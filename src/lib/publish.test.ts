import { describe, expect, test } from 'bun:test';
import { DEMO_HELPER, DEMO_MEMBERS, DEMO_NOW, demoData } from './demo';
import { agendaItems, reminderItems, sensitiveWords, todoItems, type PublishInput } from './publish';
import { todoOpsAllowed } from '@huishouden/pwa-kit/todos';

const data = demoData();
const [SAM, ALEX] = DEMO_MEMBERS;
const household = { members: [SAM, ALEX, DEMO_HELPER, 'kid@example.com'], roles: { [DEMO_HELPER]: 'helper' as const, 'kid@example.com': 'kid' as const } };
const input: PublishInput = { ...data, household, now: DEMO_NOW, url: (p) => `https://huishouden-piekstra.web.app/health/${p}` };
const names = data.meds.map((m) => m.name);
const leaks = (text: string) => names.filter((n) => text.includes(n));

describe('agenda', () => {
  const items = agendaItems(input);
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
  const items = todoItems(input);
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
