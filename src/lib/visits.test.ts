import { describe, expect, test } from 'bun:test';
import type { CalendarMatch } from '@huishouden/pwa-kit/calendar';
import { DEMO_NOW, DEMO_IDS, demoData } from './demo';
import { fromAssistantItem, fromCalendar, nextVisit, visitGroups } from './visits';
import { canAddVisit, canChangeVisit, canKeepNotes, canMarkVisit, visitRecipients } from './people';

const data = demoData();
const ids = (l: { id: string }[]) => l.map((v) => v.id);

describe('visits on screen', () => {
  test('coming up soonest first; yesterday’s unmarked vaccine to mark; the cardiology follow-up to book; the rest past', () => {
    const g = visitGroups(data.visits, DEMO_NOW);
    expect(ids(g.upcoming)).toEqual(['demo-visit-diabetes', 'demo-visit-physio', 'demo-visit-eyes']);
    expect(ids(g.toMark)).toEqual(['demo-visit-vaccine']);
    expect(ids(g.followUps)).toEqual(['demo-visit-cardio']);
    expect(ids(g.past)).toEqual(['demo-visit-cardio', 'demo-visit-dentist']);
  });

  test('a visit just marked stays where it was, with Undo, for a few hours', () => {
    const vaccine = { ...data.visits.find((v) => v.id === 'demo-visit-vaccine')!, status: 'attended' as const, markedAt: DEMO_NOW };
    const visits = data.visits.map((v) => (v.id === vaccine.id ? vaccine : v));
    expect(ids(visitGroups(visits, DEMO_NOW + 60_000).toMark)).toEqual(['demo-visit-vaccine']);
    expect(ids(visitGroups(visits, DEMO_NOW + 7 * 3_600_000).toMark)).toEqual([]);
  });

  test("a booked follow-up takes the cardiology one off the list", () => {
    const booked = { ...data.visits[0], id: 'next', followUpOf: 'demo-visit-cardio' };
    expect(visitGroups([...data.visits, booked], DEMO_NOW).followUps).toEqual([]);
  });

  test("Today's next visit within a week", () => {
    expect(nextVisit(data.visits, DEMO_IDS.RIA, DEMO_NOW)?.id).toBe('demo-visit-diabetes');
    expect(nextVisit(data.visits, DEMO_IDS.NOOR, DEMO_NOW)).toBeUndefined();
  });
});

describe('who may do what', () => {
  const ria = data.people.find((p) => p.id === DEMO_IDS.RIA)!;
  const visit = data.visits.find((v) => v.id === 'demo-visit-diabetes')!;
  test('the helper carer adds and marks, changes only her own, and never reads notes', () => {
    expect(canAddVisit(ria, 'helper', 'jo@example.com')).toBe(true);
    expect(canMarkVisit(ria, 'helper', 'jo@example.com')).toBe(true);
    expect(canChangeVisit(visit, ria, 'helper', 'jo@example.com')).toBe(false);
    expect(canChangeVisit({ by: 'jo@example.com' }, ria, 'helper', 'jo@example.com')).toBe(true);
    expect(canKeepNotes(ria, 'helper', 'jo@example.com')).toBe(false);
    expect(canKeepNotes(ria, 'member', 'sam@example.com')).toBe(true);
    expect(canAddVisit(ria, 'member', 'alex@example.com')).toBe(false);
    expect(canAddVisit(ria, 'kid', 'jo@example.com')).toBe(false);
  });

  test('reminded: every carer who is not a kid, else the person, else an admin', () => {
    const h = { members: ['sam@example.com', 'jo@example.com', 'kid@example.com', 'alex@example.com'], roles: { 'jo@example.com': 'helper' as const, 'kid@example.com': 'kid' as const } };
    expect(visitRecipients(ria, h)).toEqual(['jo@example.com', 'sam@example.com']);
    expect(visitRecipients({ carers: ['kid@example.com'], email: 'alex@example.com' }, h)).toEqual(['alex@example.com']);
    expect(visitRecipients({ carers: [] }, h)).toEqual(['sam@example.com']);
  });
});

describe('from elsewhere', () => {
  const match = (title: string, over: Partial<CalendarMatch> = {}): CalendarMatch => ({
    id: 'evt1', title, start: DEMO_NOW + 3 * 86_400_000, end: DEMO_NOW + 3 * 86_400_000 + 30 * 60_000, allDay: false, location: '9 Example Lane', description: '', link: 'https://calendar.example.com/e/1', calendarName: 'Family', ...over,
  });
  test('a calendar event fills a visit; whose only when it names exactly one person', () => {
    const { person, input } = fromCalendar(match("Noor's dentist"), data.people);
    expect(person?.id).toBe(DEMO_IDS.NOOR);
    expect(input).toMatchObject({ kind: 'dentist', title: "Noor's dentist", minutes: 30, location: '9 Example Lane', calendarEventId: 'evt1', remindBefore: [1440, 120] });
    expect(fromCalendar(match('Dentist'), data.people).person).toBeNull();
    expect(fromCalendar(match('Dentist'), [data.people[1]]).person).toBeNull();
    expect(fromCalendar(match('Eye exam', { description: '<p>For Ria</p>' }), data.people).person?.id).toBe(DEMO_IDS.RIA);
  });

  test("the assistant's appointments from before Health had visits become visits under the same id, notes apart", () => {
    const item = { app: 'assistant', ref: 'appointment:demo-person-ria:a1', title: 'Cardiology follow-up', start: DEMO_NOW, end: DEMO_NOW + 30 * 60_000, allDay: false, detail: 'Example Heart Center · bring the ECG', updatedAt: 5 };
    const moved = fromAssistantItem(item, 'sam@example.com')!;
    expect(moved.visit).toEqual({ id: 'a1', personId: 'demo-person-ria', kind: 'specialist', title: 'Cardiology follow-up', at: DEMO_NOW, minutes: 30, location: 'Example Heart Center', remindBefore: [1440, 120], createdAt: 5, by: 'sam@example.com', via: 'assistant' });
    expect(moved.notes).toBe('bring the ECG');
    expect(fromAssistantItem({ ...item, detail: 'Room 4' }, 'sam@example.com')).toMatchObject({ notes: 'Room 4' });
    expect(fromAssistantItem({ ...item, app: 'pet' }, 'sam@example.com')).toBeNull();
    expect(fromAssistantItem({ ...item, ref: 'job:x' }, 'sam@example.com')).toBeNull();
  });
});
