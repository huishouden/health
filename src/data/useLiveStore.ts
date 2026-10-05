import { useEffect, useMemo, useRef, useState } from 'react';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { commitOps } from '@huishouden/pwa-kit/firestore';
import { householdContacts, watchContacts } from '@huishouden/pwa-kit/contacts';
import { householdRole, isRestricted, type Role } from '@huishouden/pwa-kit/roles';
import { readError } from '@huishouden/pwa-kit/feedback';
import { watchProfiles } from '@huishouden/pwa-kit/household';
import { DAY } from '@huishouden/pwa-kit/time';
import { emptyData, type HealthData } from '../lib/demo';
import type { Dose, Med, Person, PersonPhoto } from '../lib/model';
import { APP } from '../lib/publish';
import { db } from './firebase';
import { createActions, type Backend, type HealthStore, type Op } from './actions';
import { useHealthSync } from './sync';
import { t } from '../i18n';

/** How far back the dose history reads: a year, for the doctor's list and adherence. */
const DOSE_HISTORY_DAYS = 400;

type PersonParts = { meds?: Med[]; doses?: Dose[]; photo?: PersonPhoto | null };

/**
 * Live household data from Firestore. Admins read everyone; members and helpers the people whose
 * medicines they look after (the rules refuse anything else); kids nobody. Each person's medicines,
 * doses and photo live under their document, one listener each. Writes are fire-and-forget: the
 * persistent cache applies them at once (also offline) and syncs later.
 */
export function useLiveStore(householdId: string, me: string, household: { members: string[]; roles?: Record<string, Role> }, onError: (message: string) => void): HealthStore {
  const role = householdRole(household, me);
  const restricted = isRestricted(role);
  const base = `households/${householdId}`;
  const [people, setPeople] = useState<Person[] | null>(null);
  const [parts, setParts] = useState<Record<string, PersonParts>>({});
  const [contacts, setContacts] = useState<HealthData['contacts']>([]);
  const errorRef = useRef(onError);
  errorRef.current = onError;
  const fail = (what: () => string) => (e: Error) => errorRef.current(readError(e, what()));

  useEffect(() => {
    if (!role || role === 'kid') {
      setPeople([]);
      return;
    }
    const col = collection(db, base, 'healthPeople');
    const q = role === 'admin' ? col : query(col, where('readers', 'array-contains', me));
    return onSnapshot(
      q,
      (s) => setPeople(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Person, 'id'>) })).sort((a, b) => a.createdAt - b.createdAt || a.name.localeCompare(b.name))),
      (e) => {
        setPeople([]);
        fail(() => t('live.people'))(e);
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, role, me]);

  const ids = (people ?? []).map((p) => p.id).join('|');
  useEffect(() => {
    if (!ids) return;
    const unsubs: (() => void)[] = [];
    const set = (pid: string, patch: PersonParts) => setParts((all) => ({ ...all, [pid]: { ...all[pid], ...patch } }));
    for (const pid of ids.split('|')) {
      const under = `${base}/healthPeople/${pid}`;
      unsubs.push(
        onSnapshot(
          collection(db, under, 'meds'),
          (s) => set(pid, { meds: s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Med, 'id'>), personId: pid })) }),
          (e) => (set(pid, { meds: [] }), fail(() => t('live.meds'))(e)),
        ),
        onSnapshot(
          query(collection(db, under, 'doses'), where('at', '>=', Date.now() - DOSE_HISTORY_DAYS * DAY)),
          (s) => set(pid, { doses: s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Dose, 'id'>), personId: pid })) }),
          (e) => (set(pid, { doses: [] }), fail(() => t('live.doses'))(e)),
        ),
        onSnapshot(
          doc(db, under, 'photo', 'avatar'),
          (s) => set(pid, { photo: s.exists() ? ({ id: pid, ...(s.data() as Omit<PersonPhoto, 'id'>) }) : null }),
          () => set(pid, { photo: null }),
        ),
      );
    }
    return () => unsubs.forEach((u) => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, ids]);

  useEffect(
    () => watchContacts(db, householdId, setContacts, { app: APP, restricted, backfillPositions: true, onError: fail(() => t('live.contacts')) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [householdId, restricted],
  );

  const [names, setNames] = useState<ReadonlyMap<string, string>>(new Map());
  useEffect(
    () =>
      watchProfiles(db, householdId, (profiles) =>
        setNames(new Map([...profiles.entries()].flatMap(([email, p]) => (p.name ? [[email, p.name.trim().split(/\s+/)[0]] as [string, string]] : [])))),
      ),
    [householdId],
  );

  const data: HealthData = useMemo(() => {
    const list = people ?? [];
    const of = (pid: string) => parts[pid] ?? {};
    return {
      ...emptyData(),
      people: list,
      meds: list.flatMap((p) => of(p.id).meds ?? []),
      doses: list.flatMap((p) => of(p.id).doses ?? []),
      photos: list.flatMap((p) => (of(p.id).photo ? [of(p.id).photo!] : [])),
      contacts,
    };
  }, [people, parts, contacts]);
  const dataRef = useRef(data);
  dataRef.current = data;

  const ready = people !== null && people.every((p) => parts[p.id]?.meds !== undefined && parts[p.id]?.doses !== undefined);

  const actions = useMemo(() => {
    const report = (p: Promise<unknown>) => void p.catch((e) => errorRef.current(readError(e, t('live.saveFailed'))));
    // Data keys to paths: everything about a person is under their document.
    const path = (op: Op): { col: string; id: string } => {
      if (op.col === 'people') return { col: 'healthPeople', id: op.id };
      if (op.col === 'photos') return { col: `healthPeople/${op.id}/photo`, id: 'avatar' };
      const list = dataRef.current[op.col] as { id: string; personId: string }[];
      const pid = (op.data as { personId?: string } | null)?.personId ?? list.find((x) => x.id === op.id)?.personId;
      return { col: `healthPeople/${pid}/${op.col}`, id: op.id };
    };
    const backend: Backend = {
      me,
      now: () => Date.now(),
      read: () => dataRef.current,
      newId: (key) => doc(collection(db, base, key === 'people' ? 'healthPeople' : 'healthPeople/_/meds')).id,
      write: (ops) => report(commitOps(db, base, ops.map((op) => ({ ...op, ...path(op) })))),
      contacts: householdContacts(db, householdId, APP, me, report),
    };
    return createActions(backend);
  }, [base, householdId, me]);

  useHealthSync(householdId, me, data, ready, household, role);

  return { data, ready, actions, members: household.members, me, role, household, names };
}
