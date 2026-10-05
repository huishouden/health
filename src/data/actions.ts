import type { Contact, ContactInput, ContactWrites } from '@huishouden/pwa-kit/contacts';
import { changes, stampFor, withoutId, type Backend as KitBackend, type Op as KitOp, type Undo } from '@huishouden/pwa-kit/store';
import { track } from '@huishouden/pwa-kit/observability';
import type { Role } from '@huishouden/pwa-kit/roles';
import { VISIT_FIELDS, visitDoc, visitMark, visitNoteDoc, visitUnmarked } from '@huishouden/pwa-kit/visit';
import { conditionDoc } from '@huishouden/pwa-kit/condition';
import { doseDoc, medDoc, personDoc, type MedInput, type PersonInput } from '../lib/build';
import type { HealthData } from '../lib/demo';
import type { Condition, ConditionInput, Dose, DoseStatus, Med, Person, PersonPhoto, Visit, VisitInput, VisitNote, VisitStatus } from '../lib/model';
import { doseId } from '../lib/meds';

/** The lists the actions write, by data key; the live backend turns them into paths under the person. */
export type DataKey = 'people' | 'photos' | 'meds' | 'doses' | 'visits' | 'visitNotes' | 'conditions';
export type Op = KitOp<DataKey>;

/**
 * Where the actions write: Firestore for a household, memory for the sample. The actions are the
 * same for both, so the sample behaves exactly like the real app.
 */
export interface Backend extends KitBackend<DataKey> {
  me: string;
  now(): number;
  read(): HealthData;
  contacts: ContactWrites;
}

export interface PersonBundle {
  person: Person;
  photo?: PersonPhoto;
  meds: Med[];
  doses: Dose[];
  visits: Visit[];
  visitNotes: VisitNote[];
  conditions: Condition[];
}

export interface MarkInput {
  med: Med;
  /** The scheduled dose it answers ("YYYY-MM-DDTHH:MM"); none as needed. */
  slot?: string;
  at: number;
  status: DoseStatus;
  note?: string;
}

export interface HealthActions {
  /** Returns the person's id. */
  savePerson(id: string | null, input: PersonInput): string;
  removePerson(p: Person): PersonBundle;
  restorePerson(b: PersonBundle): void;
  savePhoto(personId: string, dataUrl: string): Undo;
  removePhoto(personId: string): Undo;
  /** Returns the medicine's id. */
  saveMed(id: string | null, input: MedInput): string;
  /** Ends it today (it stays in the history and the doctor's list as stopped). */
  stopMed(m: Med): Undo;
  restartMed(m: Med): Undo;
  deleteMed(m: Med): Undo;
  /** Marks a dose given or skipped, by the signed-in member. */
  markDose(input: MarkInput): Undo;
  unmarkDoses(list: Dose[]): Undo;
  /** Sets the count on hand now (also after a refill). */
  countSupply(m: Med, supply: number, refills?: number): Undo;
  refillOrdered(m: Med): Undo;
  /**
   * Adds or changes a visit; returns its id. `notes` (keepers only) replaces its notes, an empty
   * string removes them, undefined leaves them alone.
   */
  saveVisit(id: string | null, input: VisitInput, notes?: string): string;
  /** Removes a visit and its notes. */
  deleteVisit(v: Visit): Undo;
  /** Attended or Missed, by the signed-in member; null takes the mark back. */
  markVisit(v: Visit, status: VisitStatus | null): Undo;
  /** The follow-up is booked elsewhere or not needed: its to-do goes. */
  followUpDone(v: Visit): Undo;
  /**
   * Adds or changes a condition; returns its id. `visitIds`, when given, are the person's visits
   * about it: each is linked (`conditionId`) and any other visit linked to it is unlinked.
   */
  saveCondition(id: string | null, input: ConditionInput, visitIds?: readonly string[]): string;
  /** Removes a condition and unlinks the visits about it; Undo puts both back. */
  deleteCondition(c: Condition): Undo;
  saveContact(id: string | null, input: ContactInput): void;
  removeContact(c: Contact): void;
  restoreContact(c: Contact): void;
}

export interface HealthStore {
  data: HealthData;
  /** False until the people, and each one's medicines and doses, have answered once. */
  ready: boolean;
  actions: HealthActions;
  members: string[];
  me: string;
  role: Role | null;
  household: { members: string[]; roles?: Record<string, Role> };
  /** Members' chosen names from their profiles, by email. */
  names?: ReadonlyMap<string, string>;
}

/** The visit with its condition link taken off: the whole document from `VISIT_FIELDS`, to write as a replace (a merge would keep it). */
function unlinked(v: Visit, now: number): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of VISIT_FIELDS) {
    if (k === 'conditionId') continue;
    const value = (v as unknown as Record<string, unknown>)[k];
    if (value !== undefined) out[k] = value;
  }
  return { ...out, updatedAt: now };
}

export function createActions(b: Backend): HealthActions {
  const find = (col: DataKey, id: string) => (b.read()[col] as { id: string }[]).find((x) => x.id === id);
  const change = changes<DataKey>(b, find);

  return {
    savePerson: (id, input) => {
      const existing = id ? b.read().people.find((p) => p.id === id) : undefined;
      const personId = id ?? b.newId('people');
      change([{ col: 'people', id: personId, data: personDoc(input, stampFor(existing, b.me, b.now())) }]);
      if (!existing) track('add person');
      return personId;
    },
    removePerson: (person) => {
      const d = b.read();
      const bundle: PersonBundle = {
        person,
        photo: d.photos.find((p) => p.id === person.id),
        meds: d.meds.filter((m) => m.personId === person.id),
        doses: d.doses.filter((x) => x.personId === person.id),
        visits: d.visits.filter((x) => x.personId === person.id),
        visitNotes: d.visitNotes.filter((x) => x.personId === person.id),
        conditions: d.conditions.filter((x) => x.personId === person.id),
      };
      // Children first: the rules read the person to allow removing what is under them.
      const ops: Op[] = [
        ...bundle.conditions.map((x): Op => ({ col: 'conditions', id: x.id, data: null })),
        ...bundle.visitNotes.map((x): Op => ({ col: 'visitNotes', id: x.id, data: null })),
        ...bundle.visits.map((x): Op => ({ col: 'visits', id: x.id, data: null })),
        ...bundle.doses.map((x): Op => ({ col: 'doses', id: x.id, data: null })),
        ...bundle.meds.map((m): Op => ({ col: 'meds', id: m.id, data: null })),
        ...(bundle.photo ? [{ col: 'photos' as const, id: person.id, data: null }] : []),
        { col: 'people', id: person.id, data: null },
      ];
      b.write(ops);
      return bundle;
    },
    restorePerson: (bundle) => {
      b.write([
        { col: 'people', id: bundle.person.id, data: withoutId(bundle.person) },
        ...(bundle.photo ? [{ col: 'photos' as const, id: bundle.person.id, data: withoutId(bundle.photo) }] : []),
        ...bundle.meds.map((m): Op => ({ col: 'meds', id: m.id, data: withoutId(m) })),
        ...bundle.doses.map((x): Op => ({ col: 'doses', id: x.id, data: withoutId(x) })),
        ...bundle.visits.map((x): Op => ({ col: 'visits', id: x.id, data: withoutId(x) })),
        ...bundle.visitNotes.map((x): Op => ({ col: 'visitNotes', id: x.id, data: withoutId(x) })),
        ...bundle.conditions.map((x): Op => ({ col: 'conditions', id: x.id, data: withoutId(x) })),
      ]);
    },
    savePhoto: (personId, dataUrl) => change([{ col: 'photos', id: personId, data: { data: dataUrl, updatedAt: b.now(), by: b.me } }]),
    removePhoto: (personId) => change([{ col: 'photos', id: personId, data: null }]),
    saveMed: (id, input) => {
      const existing = id ? b.read().meds.find((m) => m.id === id) : undefined;
      const medId = id ?? b.newId('meds');
      const keep = existing?.refillOrderedAt !== undefined && input.refillOrderedAt === undefined ? { refillOrderedAt: existing.refillOrderedAt } : {};
      change([{ col: 'meds', id: medId, data: medDoc({ ...input, ...keep }, stampFor(existing, b.me, b.now())) }]);
      if (!existing) track('add medicine', { asNeeded: input.asNeeded });
      return medId;
    },
    stopMed: (m) => {
      const today = new Date(b.now());
      const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      return change([{ col: 'meds', id: m.id, data: { endDate: ymd < m.startDate ? m.startDate : ymd, updatedAt: b.now() }, merge: true }]);
    },
    restartMed: (m) => {
      const { id: _id, endDate: _e, ...rest } = m;
      return change([{ col: 'meds', id: m.id, data: { ...rest, updatedAt: b.now() } }]);
    },
    deleteMed: (m) => {
      const doses = b.read().doses.filter((x) => x.medId === m.id);
      return change([...doses.map((x): Op => ({ col: 'doses', id: x.id, data: null })), { col: 'meds', id: m.id, data: null }]);
    },
    markDose: ({ med, slot, at, status, note }) => {
      const now = b.now();
      const id = slot ? doseId(med.id, slot) : b.newId('doses');
      track(status === 'given' ? 'give dose' : 'skip dose', { asNeeded: med.asNeeded });
      return change([{ col: 'doses', id, data: doseDoc({ personId: med.personId, medId: med.id, ...(slot ? { slot } : {}), at, status, ...(note ? { note } : {}) }, b.me, now) }]);
    },
    unmarkDoses: (list) => change(list.map((x): Op => ({ col: 'doses', id: x.id, data: null }))),
    countSupply: (m, supply, refills) =>
      change([{ col: 'meds', id: m.id, data: { supply: Math.max(0, Math.min(10000, supply)), supplyAt: b.now(), ...(refills !== undefined ? { refills } : {}), updatedAt: b.now() }, merge: true }]),
    refillOrdered: (m) => change([{ col: 'meds', id: m.id, data: { refillOrderedAt: b.now(), updatedAt: b.now() }, merge: true }]),
    saveVisit: (id, input, notes) => {
      const d = b.read();
      const existing = id ? d.visits.find((v) => v.id === id) : undefined;
      const visitId = id ?? b.newId('visits');
      const now = b.now();
      // A carried-over mark stays as it was (who marked it); marking goes through markVisit.
      const marks = existing?.status ? { status: existing.status, markedAt: existing.markedAt, markedBy: existing.markedBy } : {};
      const ops: Op[] = [{ col: 'visits', id: visitId, data: visitDoc({ ...input, ...marks, ...(existing?.followUpDoneAt ? { followUpDoneAt: existing.followUpDoneAt } : {}) }, stampFor(existing, b.me, now), existing?.via) }];
      if (notes !== undefined) {
        const had = d.visitNotes.find((n) => n.id === visitId);
        if (notes.trim()) ops.push({ col: 'visitNotes', id: visitId, data: visitNoteDoc(input.personId, notes, b.me, now) });
        else if (had) ops.push({ col: 'visitNotes', id: visitId, data: null });
      }
      b.write(ops);
      if (!existing) track('add visit', { kind: input.kind });
      return visitId;
    },
    deleteVisit: (v) => {
      const note = b.read().visitNotes.find((n) => n.id === v.id);
      return change([...(note ? [{ col: 'visitNotes' as const, id: v.id, data: null }] : []), { col: 'visits', id: v.id, data: null }]);
    },
    markVisit: (v, status) => {
      track(status === 'attended' ? 'visit attended' : status === 'missed' ? 'visit missed' : 'visit unmarked');
      // A mark merges only its own fields; taking it back replaces the visit without them.
      return change([
        status
          ? { col: 'visits', id: v.id, data: visitMark(status, b.me, b.now()), merge: true }
          : { col: 'visits', id: v.id, data: visitUnmarked(v, b.now()) },
      ]);
    },
    followUpDone: (v) => change([{ col: 'visits', id: v.id, data: { followUpDoneAt: b.now(), updatedAt: b.now() }, merge: true }]),
    saveCondition: (id, input, visitIds) => {
      const d = b.read();
      const existing = id ? d.conditions.find((c) => c.id === id) : undefined;
      const conditionId = id ?? b.newId('conditions');
      const now = b.now();
      const ops: Op[] = [{ col: 'conditions', id: conditionId, data: conditionDoc(input, stampFor(existing, b.me, now)) as unknown as Record<string, unknown> }];
      if (visitIds) {
        const want = new Set(visitIds);
        for (const v of d.visits.filter((x) => x.personId === input.personId)) {
          if (want.has(v.id) && v.conditionId !== conditionId) ops.push({ col: 'visits', id: v.id, data: { conditionId, updatedAt: now }, merge: true });
          else if (!want.has(v.id) && v.conditionId === conditionId) ops.push({ col: 'visits', id: v.id, data: unlinked(v, now) });
        }
      }
      change(ops);
      if (!existing) track('add condition', { looked: !!input.icd10 });
      return conditionId;
    },
    deleteCondition: (c) => {
      const now = b.now();
      const linked = b.read().visits.filter((v) => v.personId === c.personId && v.conditionId === c.id);
      return change([...linked.map((v): Op => ({ col: 'visits', id: v.id, data: unlinked(v, now) })), { col: 'conditions', id: c.id, data: null }]);
    },
    saveContact: (id, input) => b.contacts.save(id, input),
    removeContact: (c) => b.contacts.remove(c),
    restoreContact: (c) => b.contacts.restore(c),
  };
}
