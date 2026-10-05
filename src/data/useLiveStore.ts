import { useEffect, useMemo, useRef, useState } from 'react';
import { collection, doc, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import { PERSONAL_AGENDA, toAgendaItem } from '@huishouden/pwa-kit/agenda';
import { toVisit, visitNoteDoc } from '@huishouden/pwa-kit/visit';
import { commitOps } from '@huishouden/pwa-kit/firestore';
import { householdContacts, watchContacts } from '@huishouden/pwa-kit/contacts';
import { householdRole, isRestricted, type Role } from '@huishouden/pwa-kit/roles';
import { readError } from '@huishouden/pwa-kit/feedback';
import { reportError } from '@huishouden/pwa-kit/observability';
import { watchProfiles } from '@huishouden/pwa-kit/household';
import { DAY } from '@huishouden/pwa-kit/time';
import { emptyData, type HealthData } from '../lib/demo';
import type { Dose, Med, Person, PersonPhoto, Visit, VisitNote } from '../lib/model';
import { canKeepNotes } from '../lib/people';
import { fromAssistantItem } from '../lib/visits';
import { APP } from '../lib/publish';
import { db } from './firebase';
import { createActions, type Backend, type HealthStore, type Op } from './actions';
import { useHealthSync } from './sync';
import { t } from '../i18n';

/** How far back the dose history reads: a year, for the doctor's list and adherence. */
const DOSE_HISTORY_DAYS = 400;

type PersonParts = { meds?: Med[]; doses?: Dose[]; visits?: Visit[]; visitNotes?: VisitNote[]; photo?: PersonPhoto | null };

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
  // The people whose visit notes this member keeps (the rules refuse anyone else's).
  const keeps = (people ?? []).filter((p) => canKeepNotes(p, role, me)).map((p) => p.id).join('|');
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
          collection(db, under, 'visits'),
          (s) => set(pid, { visits: s.docs.map((d) => toVisit(d.id, d.data(), pid)) }),
          (e) => (set(pid, { visits: [] }), fail(() => t('live.visits'))(e)),
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

  useEffect(() => {
    if (!keeps) return;
    const set = (pid: string, visitNotes: VisitNote[]) => setParts((all) => ({ ...all, [pid]: { ...all[pid], visitNotes } }));
    const unsubs = keeps.split('|').map((pid) =>
      onSnapshot(
        collection(db, `${base}/healthPeople/${pid}`, 'visitNotes'),
        (s) => set(pid, s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<VisitNote, 'id'>), personId: pid }))),
        () => set(pid, []),
      ),
    );
    return () => unsubs.forEach((u) => u());
  }, [base, keeps]);

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
      visits: list.flatMap((p) => of(p.id).visits ?? []),
      visitNotes: list.flatMap((p) => of(p.id).visitNotes ?? []),
      photos: list.flatMap((p) => (of(p.id).photo ? [of(p.id).photo!] : [])),
      contacts,
    };
  }, [people, parts, contacts]);
  const dataRef = useRef(data);
  dataRef.current = data;

  const ready = people !== null && people.every((p) => parts[p.id]?.meds !== undefined && parts[p.id]?.doses !== undefined && parts[p.id]?.visits !== undefined);

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
  useAssistantVisits(base, me, ready, data, role);

  return { data, ready, actions, members: household.members, me, role, household, names };
}

/**
 * The assistant's appointments from before Health had visits (`personalAgenda` items of app
 * `assistant`, `appointment:<person>:<id>`) become visits under the same id, with their notes, and
 * the old item goes; Health publishes the visit from then on. Once per open, on the device of a
 * keeper of that person (only keepers may write the notes); a visit already there is left as it is.
 */
function useAssistantVisits(base: string, me: string, ready: boolean, data: HealthData, role: Role | null) {
  const done = useRef(false);
  const latest = useRef(data);
  latest.current = data;
  useEffect(() => {
    if (!ready || done.current || (role !== 'admin' && role !== 'member')) return;
    done.current = true;
    void (async () => {
      const snap = await getDocs(query(collection(db, base, PERSONAL_AGENDA), where('app', '==', 'assistant'), where('audience', 'array-contains', me)));
      const d = latest.current;
      const ops: { col: string; id: string; data: Record<string, unknown> | null }[] = [];
      for (const doc of snap.docs) {
        const moved = fromAssistantItem(toAgendaItem(doc.id, doc.data()), me);
        const person = moved && d.people.find((p) => p.id === moved.visit.personId);
        if (!moved || !person || !canKeepNotes(person, role, me)) continue;
        if (!d.visits.some((v) => v.id === moved.visit.id)) {
          const { id, ...visit } = moved.visit;
          ops.push({ col: `healthPeople/${person.id}/visits`, id, data: visit as unknown as Record<string, unknown> });
          if (moved.notes) ops.push({ col: `healthPeople/${person.id}/visitNotes`, id, data: { ...visitNoteDoc(person.id, moved.notes, me, Date.now()), via: 'assistant' } });
        }
        ops.push({ col: PERSONAL_AGENDA, id: doc.id, data: null });
      }
      if (ops.length) await commitOps(db, base, ops);
    })().catch((e) => reportError(e, { where: 'move assistant visits' }));
  }, [base, me, ready, role]);
}
