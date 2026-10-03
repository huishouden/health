import type { Contact, ContactInput, ContactWrites } from '@huishouden/pwa-kit/contacts';
import { changes, stampFor, withoutId, type Backend as KitBackend, type Op as KitOp, type Undo } from '@huishouden/pwa-kit/store';
import { track } from '@huishouden/pwa-kit/observability';
import type { Role } from '@huishouden/pwa-kit/roles';
import { doseDoc, medDoc, personDoc, type MedInput, type PersonInput } from '../lib/build';
import type { HealthData } from '../lib/demo';
import type { Dose, DoseStatus, Med, Person, PersonPhoto } from '../lib/model';
import { doseId } from '../lib/meds';

/** The lists the actions write, by data key; the live backend turns them into paths under the person. */
export type DataKey = 'people' | 'photos' | 'meds' | 'doses';
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
      };
      // Children first: the rules read the person to allow removing what is under them.
      const ops: Op[] = [
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
    saveContact: (id, input) => b.contacts.save(id, input),
    removeContact: (c) => b.contacts.remove(c),
    restoreContact: (c) => b.contacts.restore(c),
  };
}
