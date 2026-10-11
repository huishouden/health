import { describe, expect, test } from 'bun:test';
import { DEMO_HELPER, DEMO_MEMBERS, DEMO_NOW, demoData } from './demo';
import { agendaItems, dosesSource, refillSource, reminderItems, sensitiveWords, todoItems, type PublishInput } from './publish';
import { todoOpsAllowed } from '@huishouden/pwa-kit/todos';
import { readSource, sourceAllowed, sourceReads, stillDue } from '@huishouden/pwa-kit/reminder-source';
import { personalReminderDoc } from '@huishouden/pwa-kit/reminders';
import { SUITE_ORIGIN } from '@huishouden/pwa-kit/site';
import { toYmd } from '@huishouden/pwa-kit/time';
import { doseId } from './meds';

const data = demoData();
const [SAM, ALEX] = DEMO_MEMBERS;
const household = { members: [SAM, ALEX, DEMO_HELPER, 'kid@example.com'], roles: { [DEMO_HELPER]: 'helper' as const, 'kid@example.com': 'kid' as const } };
const input: PublishInput = { ...data, household, now: DEMO_NOW, url: (p) => `${SUITE_ORIGIN}/health/${p}` };
const names = data.meds.map((m) => m.name);
const leaks = (text: string) => names.filter((n) => text.includes(n));

describe('agenda', () => {
  const items = agendaItems(input).filter((i) => i.kind === 'medicine');
  test("one item per person and dose time today and tomorrow, named for the person only", () => {
    const ria = items.filter((i) => i.who === 'Oma Ria' && i.start < DEMO_NOW + 14 * 3_600_000);
    expect(ria.map((i) => `${new Date(i.start).getHours()} ${i.status} ${i.detail}`)).toEqual(['8 upcoming 2 medicines', '18 upcoming 1 medicine', '21 upcoming 1 medicine']);
    expect(items.find((i) => i.who === 'Noor' && new Date(i.start).getHours() === 8 && i.start < DEMO_NOW)?.status).toBe('done');
    for (const i of items) {
      expect(i.title).toMatch(/^Medicine for /);
      // Names only in calendarDetail, which the portal never shows.
      const { calendarDetail, ...shown } = i;
      expect(leaks(JSON.stringify(shown))).toEqual([]);
      expect(calendarDetail).toBeTruthy();
      expect(i.kind).toBe('medicine');
    }
  });

  test('each dose time names its medicines for the reader’s own calendar', () => {
    const ria8 = items.find((i) => i.who === 'Oma Ria' && new Date(i.start).getHours() === 8 && i.start > DEMO_NOW - 12 * 3_600_000)!;
    expect(leaks(ria8.calendarDetail!).length).toBe(2);
  });

  test('only admins, carers and the person read them; never kids or other members', () => {
    expect(items.find((i) => i.who === 'Oma Ria')!.audience).toEqual([DEMO_HELPER, SAM]);
    expect(items.find((i) => i.who === 'Alex')!.audience).toEqual([ALEX, SAM]);
  });
});

describe('to-dos', () => {
  const items = todoItems(input).filter((i) => !i.ref.startsWith('followup:'));
  test("Ria's unmarked 8 AM metformin, with Given and Skipped writing her dose; the low lisinopril with Ordered", () => {
    expect(items.map((i) => i.title)).toEqual(['Not marked: 8 AM medicine for Oma Ria', 'Refill a medicine for Oma Ria']);
    const [missed, refill] = items;
    expect(missed.done!.ops).toEqual([
      { col: 'healthPeople/demo-person-ria/doses', id: 'demo-med-metformin_2031-05-14T0800', data: { personId: 'demo-person-ria', medId: 'demo-med-metformin', slot: '2031-05-14T08:00', at: new Date(2031, 4, 14, 8).getTime(), status: 'given', by: '$me', createdAt: '$now' } },
    ]);
    expect((missed.cancel!.ops[0].data as { status: string }).status).toBe('skipped');
    expect(missed.done!.roles).toEqual(['admin']);
    expect(missed.done!.emails).toEqual([DEMO_HELPER, SAM]);
    expect(refill.detail).toBe('About 6 days left, 2 refills left');
    expect(refill.done!.ops[0]).toEqual({ col: 'healthPeople/demo-person-ria/meds', id: 'demo-med-lisinopril', data: { refillOrderedAt: '$now', updatedAt: '$now' }, merge: true });
    for (const i of items) {
      expect(todoOpsAllowed('health', i.done!.ops)).toBe(true);
      expect(leaks(`${i.title} ${i.detail}`)).toEqual([]);
      expect(i.audience).toEqual([DEMO_HELPER, SAM]);
    }
  });
});

describe('reminders', () => {
  const items = reminderItems(input);
  test("at each dose time to the main carer, naming the medicines; unmarked to the others after the window", () => {
    const evening = items.find((r) => r.ref === 'health:dose:demo-person-ria' && new Date(r.at).getHours() === 18)!;
    expect(evening.recipients).toEqual([DEMO_HELPER]);
    expect(evening.body).toBe('At 6 PM: Metformin 500 mg, 1 tablet, with food');
    const late = items.find((r) => r.ref === 'health:late:demo-person-ria' && new Date(r.at).getHours() === 18)!;
    expect(new Date(late.at).getMinutes()).toBe(30);
    expect(late.recipients).toEqual([SAM]);
    // Nothing for the past, nothing for what is already marked.
    expect(items.every((r) => r.at > DEMO_NOW)).toBe(true);
    // As-needed and reminders-off medicines never remind.
    expect(items.some((r) => (r.body ?? '').includes('Paracetamol'))).toBe(false);
  });

  test('reminders turned off on a medicine: no dose or late reminders for it', () => {
    const off = (id: string): PublishInput => ({ ...input, meds: data.meds.map((m) => (m.id === id ? { ...m, remind: false } : m)) });
    // Alex's only medicine: nothing at dose time, nothing late.
    const alex = reminderItems(off('demo-med-levothyroxine')).filter((r) => /^health:(dose|late):demo-person-alex$/.test(r.ref ?? ''));
    expect(alex).toEqual([]);
    // Ria's metformin: gone from 8:00 (Lisinopril is still named) and the 6 PM time has no reminder at all.
    const ria = reminderItems(off('demo-med-metformin')).filter((r) => /^health:(dose|late):demo-person-ria$/.test(r.ref ?? ''));
    expect(ria.length).toBeGreaterThan(0);
    expect(ria.some((r) => (r.body ?? '').includes('Metformin'))).toBe(false);
    expect(ria.some((r) => new Date(r.at).getHours() === 18)).toBe(false);
    expect(ria.some((r) => r.ref === 'health:late:demo-person-ria' && (r.body ?? '').includes('Lisinopril'))).toBe(true);
    // Its refill reminder is about supply, not dose times: it stays.
    expect(reminderItems(off('demo-med-metformin')).some((r) => r.ref === 'health:refill:demo-med-metformin')).toBe(true);
  });

  test('a week ahead, and the escalation only where a window is set', () => {
    const alex = items.filter((r) => r.ref === 'health:dose:demo-person-alex');
    expect(alex).toHaveLength(7);
    expect(alex[0].recipients).toEqual([ALEX]);
  });

  test('refill soon: metformin reaches a week left later, at 9 AM that day', () => {
    const refill = items.filter((r) => (r.ref ?? '').startsWith('health:refill:'));
    expect(refill.map((r) => r.ref)).toEqual(['health:refill:demo-med-metformin', 'health:refill:demo-med-levothyroxine']);
    expect(new Date(refill[0].at).getHours()).toBe(9);
  });
});

test('every medicine and person name is a sensitive word', () => {
  const words = sensitiveWords(data.people, data.meds);
  expect(words).toContain('Lisinopril 10 mg');
  expect(words).toContain('Oma Ria');
  expect(words).toContain('Noor');
});

describe('visits', () => {
  const notes = data.visitNotes.map((n) => n.text);
  const leaksNotes = (text: string) => notes.filter((n) => text.includes(n));

  test('on the agenda as "Appointment for Oma Ria"; what, with whom and where only for the reader\'s own calendar', () => {
    const visits = agendaItems(input).filter((i) => i.kind === 'appointment');
    // A month back to half a year ahead: Noor's dentist two months ago is past the agenda.
    expect(visits.map((i) => i.ref).sort()).toEqual(['visit:demo-person-alex:demo-visit-physio', 'visit:demo-person-noor:demo-visit-vaccine', 'visit:demo-person-ria:demo-visit-cardio', 'visit:demo-person-ria:demo-visit-diabetes', 'visit:demo-person-ria:demo-visit-eyes']);
    const diabetes = visits.find((i) => i.ref.endsWith('demo-visit-diabetes'))!;
    expect(diabetes).toMatchObject({ title: 'Appointment for Oma Ria', who: 'Oma Ria', private: true, allDay: false, audience: [DEMO_HELPER, SAM] });
    expect(diabetes.detail).toBeUndefined();
    // Dr. Hart is a private contact and Jo, a helper carer, reads Ria's items: the doctor isn't named.
    expect(diabetes.calendarDetail).toBe('Checkup: Diabetes check · Fasting from midnight · bring the medicine list');
    // Noor's readers are all members: her private pediatrician is.
    expect(visits.find((i) => i.ref.endsWith('demo-visit-vaccine'))!.calendarDetail).toBe('Vaccine: School vaccine with Dr. Omar Velde');
    expect(diabetes.url).toBe(`${SUITE_ORIGIN}/health/?tab=visits&person=demo-person-ria&visit=demo-visit-diabetes`);
    expect(visits.find((i) => i.ref.endsWith('demo-visit-cardio'))!.status).toBe('done');
    for (const i of visits) expect(leaksNotes(JSON.stringify(i))).toEqual([]);
  });

  test('reminded the day before and two hours before, to everyone who looks after them, with what to bring', () => {
    const diabetes = reminderItems(input).filter((r) => r.ref === 'health:visit:demo-visit-diabetes');
    const at = new Date(2031, 4, 16, 9, 15).getTime();
    expect(diabetes.map((r) => r.at)).toEqual([at - 86_400_000, at - 2 * 3_600_000]);
    expect(diabetes[0]).toMatchObject({ title: 'Appointment for Oma Ria', recipients: [DEMO_HELPER, SAM], audience: [DEMO_HELPER, SAM] });
    expect(diabetes[0].body).toBe('Tomorrow at 9:15 AM: Checkup: Diabetes check. Fasting from midnight and bring the medicine list.');
    expect(JSON.stringify(reminderItems(input))).not.toContain('Lena Hart');
    // Alex's own visit reminds Alex, an hour before; nothing for visits already over.
    expect(reminderItems(input).filter((r) => r.ref === 'health:visit:demo-visit-physio').map((r) => r.recipients)).toEqual([[ALEX]]);
    expect(reminderItems(input).some((r) => r.ref === 'health:visit:demo-visit-vaccine')).toBe(false);
    for (const r of reminderItems(input)) expect(leaksNotes(`${r.title} ${r.body}`)).toEqual([]);
  });

  test("a follow-up to book once the visit is over: Booked and Not needed mark it, for the person's readers", () => {
    const todo = todoItems(input).find((i) => i.ref === 'followup:demo-person-ria:demo-visit-cardio')!;
    expect(todo).toMatchObject({ title: 'Book a follow-up for Oma Ria', detail: 'Around May 23', who: 'Oma Ria', audience: [DEMO_HELPER, SAM] });
    expect(todo.done!.ops).toEqual([{ col: 'healthPeople/demo-person-ria/visits', id: 'demo-visit-cardio', data: { followUpDoneAt: '$now', updatedAt: '$now' }, merge: true }]);
    expect(todo.done!.emails).toEqual([DEMO_HELPER, SAM]);
    expect(todoOpsAllowed('health', todo.done!.ops)).toBe(true);
    // The diabetes check's follow-up waits until the visit is over.
    expect(todoItems(input).some((i) => i.ref.endsWith('demo-visit-diabetes'))).toBe(false);
  });

  test("a visit's title and place never reach analytics", () => {
    const words = sensitiveWords(data.people, data.meds, data.visits);
    expect(words).toContain('Diabetes check');
    expect(words).toContain('Example Heart Center, 30 Example Street');
  });
});

describe('the sender drops a reminder once it is done elsewhere', () => {
  const items = reminderItems(input);
  const stored = (r: (typeof items)[number]) => readSource('health', personalReminderDoc(r, r.audience[0], DEMO_NOW).source)!;

  test('a dose-time reminder names its doses: due while any is unmarked, only for the person’s readers', () => {
    const evening = items.find((r) => r.ref === 'health:dose:demo-person-ria' && new Date(r.at).getHours() === 18)!;
    const source = stored(evening);
    expect(source.any).toBe(true);
    const docs = source.checks.filter((c) => 'absent' in c).map((c) => c.doc);
    expect(docs.length).toBeGreaterThan(0);
    expect(docs.every((d) => d.startsWith('healthPeople/demo-person-ria/doses/'))).toBe(true);
    const medsOn = new Map(source.checks.filter((c) => !('absent' in c)).map((c) => [c.doc, { remind: true }]));
    // The portal's "Mark given" for those doses writes exactly these records.
    const later = { ...input, now: evening.at + 3 * 3_600_000 };
    const todo = todoItems(later).find((t) => t.ref.startsWith('missed:demo-person-ria:') && t.due === evening.at)!;
    expect(todo.done!.ops.map((o) => `${o.col}/${o.id}`)).toEqual(docs);
    const unmarked = new Map<string, Record<string, unknown> | null>([...docs.map((d) => [d, null] as const), ...medsOn]);
    expect(stillDue(source, unmarked)).toBe(true);
    expect(stillDue(source, new Map<string, Record<string, unknown> | null>([...docs.map((d) => [d, { status: 'given' }] as const), ...medsOn]))).toBe(false);
    // Read with the person, whose readers decide whether the writer's source counts.
    const person = data.people.find((p) => p.id === 'demo-person-ria')!;
    expect(sourceReads('health', source)).toContain('healthPeople/demo-person-ria');
    const read = new Map<string, Record<string, unknown> | null>([['healthPeople/demo-person-ria', { readers: person.readers }]]);
    expect(sourceAllowed('health', source, person.readers[0], 'member', read, { personal: true })).toBe(true);
    expect(sourceAllowed('health', source, 'nobody@example.com', 'member', read, { personal: true })).toBe(false);
    // Never on a shared reminder, which every member reads.
    expect(sourceAllowed('health', source, person.readers[0], 'member', read)).toBe(false);
    // An admin who isn't a reader, and a helper who is (the tablet, a sitter): yes. A kid among the readers: never.
    const P = { personal: true };
    const withReaders = (readers: string[]) => new Map<string, Record<string, unknown> | null>([['healthPeople/demo-person-ria', { readers }]]);
    expect(sourceAllowed('health', source, ALEX, 'admin', withReaders(person.readers.filter((e) => e !== ALEX)), P)).toBe(true);
    expect(person.readers).toContain(DEMO_HELPER);
    expect(sourceAllowed('health', source, DEMO_HELPER, 'helper', read, P)).toBe(true);
    expect(sourceAllowed('health', source, 'kid@example.com', 'kid', withReaders([...person.readers, 'kid@example.com']), P)).toBe(false);
    // The late one for the other carers names the same doses.
    const late = items.find((r) => r.ref === 'health:late:demo-person-ria' && new Date(r.at).getHours() === 18)!;
    expect(stored(late)).toEqual(source);
  });

  test("dose and late reminders: due only while the dose's medicine still wants them", () => {
    // Ria's 8:00 tomorrow: Lisinopril and Metformin, each its dose and its medicine.
    const tomorrow8 = items.filter((r) => r.ref === 'health:dose:demo-person-ria' && new Date(r.at).getHours() === 8 && r.at > DEMO_NOW)[0]!;
    const source = stored(tomorrow8);
    expect(source.any).toBe(true);
    const meds = ['demo-med-lisinopril', 'demo-med-metformin'];
    const day = toYmd(tomorrow8.at);
    const doseDoc = (m: string) => `healthPeople/demo-person-ria/doses/${doseId(m, `${day}T08:00`)}`;
    const medDoc = (m: string) => `healthPeople/demo-person-ria/meds/${m}`;
    expect(source.checks.map((c) => c.doc).sort()).toEqual(meds.flatMap((m) => [doseDoc(m), medDoc(m)]).sort());
    const med = (id: string) => ({ ...data.meds.find((m) => m.id === id)! }) as Record<string, unknown>;
    const read = (over: Record<string, Record<string, unknown> | null> = {}) =>
      new Map<string, Record<string, unknown> | null>(Object.entries({ ...Object.fromEntries(meds.flatMap((m) => [[doseDoc(m), null], [medDoc(m), med(m)]])), ...over }));
    expect(stillDue(source, read())).toBe(true);
    // Reminders off on one: the other's dose keeps it due; marked too, it is deleted unsent.
    const offLis = { [medDoc('demo-med-lisinopril')]: { ...med('demo-med-lisinopril'), remind: false } };
    expect(stillDue(source, read(offLis))).toBe(true);
    expect(stillDue(source, read({ ...offLis, [doseDoc('demo-med-metformin')]: { status: 'given' } }))).toBe(false);
    // Off on both, or both stopped today (the day before the dose), or removed.
    expect(stillDue(source, read({ ...offLis, [medDoc('demo-med-metformin')]: { ...med('demo-med-metformin'), remind: false } }))).toBe(false);
    const stopped = (m: string) => ({ ...med(m), endDate: toYmd(DEMO_NOW) });
    expect(stillDue(source, read({ [medDoc('demo-med-lisinopril')]: stopped('demo-med-lisinopril'), [medDoc('demo-med-metformin')]: stopped('demo-med-metformin') }))).toBe(false);
    expect(stillDue(source, read({ [medDoc('demo-med-lisinopril')]: null, [medDoc('demo-med-metformin')]: null }))).toBe(false);
    // Stopped with the dose's own day as the last: still due.
    const last = (m: string) => ({ ...med(m), endDate: day });
    expect(stillDue(source, read({ [medDoc('demo-med-lisinopril')]: last('demo-med-lisinopril'), [medDoc('demo-med-metformin')]: last('demo-med-metformin') }))).toBe(true);
    // The late one for the other carers checks the same.
    const late = items.find((r) => r.ref === 'health:late:demo-person-ria' && r.at === tomorrow8.at + 30 * 60_000)!;
    expect(stored(late)).toEqual(source);
  });

  test('more doses at one time than fit in groups: only the doses are checked', () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({ med: { id: `m${i}` }, slot: { key: '2031-05-15T08:00' } }));
    const source = dosesSource('p1', rows)!;
    expect(source.checks.every((c) => 'absent' in c && c.group === undefined)).toBe(true);
    expect(readSource('health', source)).toEqual(source);
    expect(readSource('health', dosesSource('p1', rows.slice(0, 4)))!.checks).toHaveLength(8);
    expect(dosesSource('p1', [...rows, ...rows])).toBeUndefined();
  });

  test('a refill reminder: due until a refill is ordered', () => {
    const refill = items.find((r) => r.ref === 'health:refill:demo-med-metformin')!;
    const source = stored(refill);
    const [check] = source.checks;
    const med = data.meds.find((m) => m.id === 'demo-med-metformin')!;
    expect(stillDue(source, new Map([[check.doc, { ...med }]]))).toBe(true);
    expect(stillDue(source, new Map([[check.doc, { ...med, refillOrderedAt: DEMO_NOW }]]))).toBe(false);
    // The to-do's Ordered writes the medicine the source reads; only the person's readers may use it.
    // Lisinopril is low already, so its refill to-do is up: its Ordered writes what its refill source reads.
    const lisinopril = data.meds.find((m) => m.id === 'demo-med-lisinopril')!;
    const todo = todoItems(input).find((t) => t.ref === 'refill:demo-person-ria:demo-med-lisinopril')!;
    expect(todo.done!.ops.map((o) => `${o.col}/${o.id}`)).toEqual([refillSource('demo-person-ria', lisinopril).checks[0].doc]);
    expect(check.doc).toBe('healthPeople/demo-person-ria/meds/demo-med-metformin');
    const person = data.people.find((p) => p.id === 'demo-person-ria')!;
    const read = new Map<string, Record<string, unknown> | null>([['healthPeople/demo-person-ria', { readers: person.readers }]]);
    expect(sourceAllowed('health', source, person.readers[0], 'member', read, { personal: true })).toBe(true);
    expect(sourceAllowed('health', source, 'nobody@example.com', 'member', read, { personal: true })).toBe(false);
  });
});
