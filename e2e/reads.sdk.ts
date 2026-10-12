// Read budgets of Health's own sync paths (pwa-kit STANDARD.md "Read budgets"), on the emulators
// with the household's rules (`bun run e2e:emulator`, which `hh dev evidence` runs inside
// `firebase emulators:exec`): the publish of reminders, agenda and to-dos, and the move of the
// assistant's old appointments. Reads are counted from the SDK's own results as Firestore bills them
// (`readCounter().sdk`); the interleaving tests land another device's write before each read. Its
// own `bun test` process: it replaces firebase/firestore with the counted module for the process.
// A change that raises a ceiling says why in its PR.
import { afterAll, beforeAll, describe, expect, mock, test } from 'bun:test';
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
import { expectReads, readCounter, writeBeforeEachRead } from '@huishouden/pwa-kit/read-test';
import { e2eProject, e2eTarget, getTestDoc, seedTestHousehold, testHousehold, writeTestDocs, type TestHousehold } from '@huishouden/pwa-kit/staging';
import { personalAgendaDoc, PERSONAL_AGENDA } from '@huishouden/pwa-kit/agenda';
import { personalReminderDoc, PERSONAL_REMINDERS } from '@huishouden/pwa-kit/reminders';
import { personalTodoDoc, PERSONAL_TODOS } from '@huishouden/pwa-kit/todos';
import { toYmd } from '@huishouden/pwa-kit/time';
import type { Med, Person, Visit } from '../src/lib/model';

const real = await import('firebase/firestore');
const counter = readCounter();
mock.module('firebase/firestore', () => counter.sdk(real));
const { connectFirestoreEmulator, initializeFirestore, memoryLocalCache, terminate } = await import('firebase/firestore');
const { publishHealth } = await import('../src/data/publish-run');
const { moveAssistantVisits } = await import('../src/data/assistant-visits');

const emulator = e2eTarget() === 'emulator';
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
// Tomorrow at 10:30 local time, so the counts don't hang on when the test runs: the 08:00 dose is
// due and not marked, the 12:00 and 20:00 ones are ahead.
const NOW = new Date(new Date().setHours(0, 0, 0, 0) + DAY + 10.5 * HOUR).getTime();
// The rules take only the suite's own addresses.
const URL = 'https://huishouden-staging.web.app/health/';

let hh: TestHousehold;
let app: FirebaseApp;
let db: ReturnType<typeof real.getFirestore>;
let admin: string;

beforeAll(async () => {
  if (!emulator) return;
  const household = testHousehold('health-reads-sdk');
  admin = household.users.admin.email;
  // The person is in Firestore too: the rules check a reminder's medicines against their readers.
  const { id, ...person } = gran();
  hh = await seedTestHousehold({ household, docs: { [`healthPeople/${id}`]: person } });
  app = initializeApp({ apiKey: 'demo-key', projectId: e2eProject(), appId: 'demo' }, `reads-${hh.id}`);
  db = initializeFirestore(app, { localCache: memoryLocalCache() });
  connectFirestoreEmulator(db, process.env.HH_EMULATOR_HOST || '127.0.0.1', Number(process.env.HH_EMULATOR_FIRESTORE_PORT || 8080), {
    mockUserToken: { sub: hh.users.admin.uid, email: admin, email_verified: true },
  });
});

afterAll(async () => {
  if (!emulator) return;
  await terminate(db);
  await deleteApp(app);
});

// An invented person the admin looks after: two daily medicines with reminders, none marked
// today, and a visit tomorrow.
const gran = (): Person => ({ id: 'gran', name: 'Test Gran', carers: [admin], readers: [admin], createdAt: NOW - 30 * DAY, by: admin });
function input() {
  const person = gran();
  const med = (id: string, name: string, times: string[]): Med => ({ id, personId: 'gran', name, dose: '1 tablet', asNeeded: false, times, everyDays: 1, startDate: toYmd(NOW - 30 * DAY), escalateMinutes: 30, remind: true, createdAt: NOW - 30 * DAY, by: admin });
  const visit: Visit = { id: 'eyes', personId: 'gran', kind: 'eye', at: NOW + DAY, remindBefore: [DAY], createdAt: NOW - DAY, by: admin };
  return { people: [person], meds: [med('m1', 'Test tablets', ['08:00', '20:00']), med('m2', 'Test drops', ['12:00'])], doses: [], visits: [visit], contacts: [], household: { members: [admin], roles: { [admin]: 'admin' as const } }, now: NOW, url: (path: string) => `${URL}${path}` };
}

/** Another device's stale item in each of the lists Health publishes to: the sync must remove it. */
const stale = (n: number) => ({
  [`${PERSONAL_REMINDERS}/health-stale-${n}`]: personalReminderDoc({ app: 'health', ref: `stale:${n}`, title: `Old ${n}`, at: NOW + 2 * DAY, url: URL, audience: [admin], recipients: [admin] }, admin, NOW),
  [`${PERSONAL_AGENDA}/health-stale-${n}`]: personalAgendaDoc('health', { ref: `stale:${n}`, kind: 'appointment', title: `Old ${n}`, start: NOW + 2 * DAY, allDay: true, url: URL, audience: [admin] }, admin, NOW),
  [`${PERSONAL_TODOS}/health-stale-${n}`]: personalTodoDoc('health', { ref: `stale:${n}`, title: `Old ${n}`, createdAt: NOW - DAY, url: URL, audience: [admin] }, admin, NOW),
});

const fail = (e: unknown) => {
  throw e;
};

describe.skipIf(!emulator)('publishing (reminders, agenda, to-dos): one query each, none when this device already published the same', () => {
  test('first publish, again, and again with this device\'s note', async () => {
    // Nothing published yet: three queries that find nothing, billed one read each.
    await expectReads(() => publishHealth(db, hh.id, admin, input(), { published: null, onError: fail }), { max: 3, min: 3, counter, label: 'Health publish, first' });
    // Again without the note: each query returns what the first wrote: 21 reminders (three doses a
    // day for a week), 7 agenda items (today's and tomorrow's dose times, the visit) and 3 to-dos.
    const { value, reads } = await expectReads(() => publishHealth(db, hh.id, admin, input(), { published: null, onError: fail }), { max: 31, min: 31, counter, label: 'Health publish, again' });
    expect(reads).toBe((value.reminders?.unchanged ?? 0) + (value.agenda?.unchanged ?? 0) + (value.todos?.unchanged ?? 0));
    // With the note of what this device published: nothing read.
    const notes = new Map<string, string>();
    const store = { getItem: (k: string) => notes.get(k) ?? null, setItem: (k: string, v: string) => void notes.set(k, v), removeItem: (k: string) => void notes.delete(k), key: (i: number) => [...notes.keys()][i] ?? null, get length() { return notes.size; } };
    await publishHealth(db, hh.id, admin, input(), { published: store, onError: fail });
    await expectReads(() => publishHealth(db, hh.id, admin, input(), { published: store, onError: fail }), { max: 0, counter, label: 'Health publish, published' });
  });

  test('interleaving: another device writes before each of its three reads; one pass, its 31 items and the 6 strays read once', async () => {
    let n = 0;
    const { value } = await expectReads(() => publishHealth(db, hh.id, admin, input(), { published: null, onError: fail }), {
      max: 37,
      min: 37,
      counter,
      label: 'Health publish with a write before each read',
      beforeRead: writeBeforeEachRead(() => writeTestDocs(hh, stale(++n))),
    });
    expect(n).toBe(3);
    // Each list's query saw every stray written before it, and removed it.
    expect([value.reminders?.deleted, value.agenda?.deleted, value.todos?.deleted]).toEqual([1, 2, 3]);
  });
});

describe.skipIf(!emulator)("moving the assistant's old appointments: one query of the member's own", () => {
  const item = (id: string) => ({
    [`${PERSONAL_AGENDA}/${id}`]: personalAgendaDoc('assistant', { ref: `appointment:gran:${id}`, kind: 'appointment', title: 'Eye doctor', start: NOW + 3 * DAY, allDay: false, url: URL, audience: [admin] }, admin, NOW),
  });
  const data = () => ({ people: input().people, visits: [] });

  test('two to move, then nothing left', async () => {
    await writeTestDocs(hh, { ...item('a1'), ...item('a2') });
    const { value } = await expectReads(() => moveAssistantVisits(db, `households/${hh.id}`, admin, 'admin', data, NOW), { max: 2, min: 2, counter, label: 'assistant visits' });
    expect(value).toBe(2);
    for (const id of ['a1', 'a2']) expect(await getTestDoc(hh, `healthPeople/gran/visits/${id}`)).toMatchObject({ personId: 'gran' });
    await expectReads(() => moveAssistantVisits(db, `households/${hh.id}`, admin, 'admin', data, NOW), { max: 1, min: 1, counter, label: 'assistant visits, none left' });
  });

  test('interleaving: one more lands before its read; read once and moved with the rest', async () => {
    await writeTestDocs(hh, item('b1'));
    const { value } = await expectReads(() => moveAssistantVisits(db, `households/${hh.id}`, admin, 'admin', data, NOW), {
      max: 2,
      min: 2,
      counter,
      label: 'assistant visits with a write before the read',
      beforeRead: writeBeforeEachRead(() => writeTestDocs(hh, item('b2'))),
    });
    expect(value).toBe(2);
    for (const id of ['b1', 'b2']) {
      expect(await getTestDoc(hh, `healthPeople/gran/visits/${id}`)).toMatchObject({ personId: 'gran' });
      expect(await getTestDoc(hh, `${PERSONAL_AGENDA}/${id}`)).toBeNull();
    }
  });
});
