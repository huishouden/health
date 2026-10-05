import { describe, expect, test } from 'bun:test';
import { DEMO_HELPER, DEMO_MEMBERS, DEMO_NOW, demoData } from './demo';
import { agendaItems, reminderItems, sensitiveWords, todoItems, type PublishInput } from './publish';
import { todoOpsAllowed } from '@huishouden/pwa-kit/todos';
import { SUITE_ORIGIN } from '@huishouden/pwa-kit/site';

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
    expect(diabetes.calendarDetail).toBe('Checkup: Diabetes check with Dr. Lena Hart · 12 Example Street · Fasting from midnight · bring the medicine list');
    expect(diabetes.url).toBe(`${SUITE_ORIGIN}/health/?tab=visits&person=demo-person-ria&visit=demo-visit-diabetes`);
    expect(visits.find((i) => i.ref.endsWith('demo-visit-cardio'))!.status).toBe('done');
    for (const i of visits) expect(leaksNotes(JSON.stringify(i))).toEqual([]);
  });

  test('reminded the day before and two hours before, to everyone who looks after them, with what to bring', () => {
    const diabetes = reminderItems(input).filter((r) => r.ref === 'health:visit:demo-visit-diabetes');
    const at = new Date(2031, 4, 16, 9, 15).getTime();
    expect(diabetes.map((r) => r.at)).toEqual([at - 86_400_000, at - 2 * 3_600_000]);
    expect(diabetes[0]).toMatchObject({ title: 'Appointment for Oma Ria', recipients: [DEMO_HELPER, SAM], audience: [DEMO_HELPER, SAM] });
    expect(diabetes[0].body).toBe('Tomorrow at 9:15 AM: Checkup: Diabetes check with Dr. Lena Hart, 12 Example Street. Fasting from midnight and bring the medicine list.');
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
