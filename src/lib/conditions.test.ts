import { describe, expect, test } from 'bun:test';
import { conditionGroups, conditionsByMed, fromParts, householdGroups, medsFor, toParts, visitsFor } from './conditions';
import { demoData, DEMO_IDS, DEMO_NOW } from './demo';
import { agendaItems, reminderItems, sensitiveWords, todoItems } from './publish';
import { canReadConditions } from './people';

const d = demoData();

describe('conditions', () => {
  test("a person's by medical area, current areas first; the household's across people", () => {
    expect(conditionGroups(d.conditions, DEMO_IDS.NOOR).map((g) => [g.specialty, g.current])).toEqual([['allergy', 1], ['ent', 0]]);
    const endo = householdGroups(d.conditions, [DEMO_IDS.RIA, DEMO_IDS.ALEX]).find((g) => g.specialty === 'endocrinology')!;
    expect(endo.conditions.map((c) => c.name)).toEqual(['High cholesterol', 'Type 2 diabetes', 'Underactive thyroid']);
  });

  test('what each medicine treats, and the visits about a condition', () => {
    expect(conditionsByMed(d.conditions).get('demo-med-metformin')!.map((c) => c.name)).toEqual(['Type 2 diabetes']);
    const diabetes = d.conditions.find((c) => c.id === 'demo-condition-diabetes')!;
    expect(medsFor(diabetes, d.meds).map((m) => m.name)).toEqual(['Metformin']);
    expect(visitsFor(diabetes, d.visits, DEMO_NOW).map((v) => v.id)).toEqual(['demo-visit-diabetes']);
  });

  test('partial dates from the dialog: a year, a month, a day; impossible ones refused', () => {
    expect(fromParts({ year: '2019', month: '', day: '' })).toBe('2019');
    expect(fromParts({ year: '2019', month: '03', day: '' })).toBe('2019-03');
    expect(fromParts({ year: '2019', month: '03', day: '14' })).toBe('2019-03-14');
    expect(fromParts({ year: '', month: '03', day: '' })).toBeUndefined();
    expect(fromParts({ year: '19', month: '', day: '' })).toBeNull();
    expect(fromParts({ year: '2027', month: '02', day: '30' })).toBeNull();
    expect(toParts('2019-03')).toEqual({ year: '2019', month: '03', day: '' });
  });

  test('helper carers and kids never read them, also as the person; admins and member carers do', () => {
    const p = { readers: ['jo@example.com', 'sam@example.com'], email: 'jo@example.com' };
    expect(canReadConditions(p, 'helper', 'jo@example.com')).toBe(false);
    expect(canReadConditions(p, 'kid', 'jo@example.com')).toBe(false);
    expect(canReadConditions(p, 'member', 'sam@example.com')).toBe(true);
    expect(canReadConditions(p, 'admin', 'x@example.com')).toBe(true);
  });

  test('nothing Health publishes names a condition or a visit’s medical area; their names are kept out of reports', () => {
    const household = { members: ['sam@example.com', 'alex@example.com', 'jo@example.com'], roles: { 'jo@example.com': 'helper' as const } };
    const input = { people: d.people, meds: d.meds, doses: d.doses, visits: d.visits, contacts: d.contacts, household, now: DEMO_NOW, url: (path: string) => `https://example.com/health/${path}` };
    const published = JSON.stringify([agendaItems(input), todoItems(input), reminderItems(input)]);
    for (const c of d.conditions) expect(published).not.toContain(c.name);
    for (const word of ['Endocrinology', 'Ophthalmology', 'Cardiology,', 'demo-condition']) expect(published).not.toContain(word);
    const words = sensitiveWords(d.people, d.meds, d.visits, d.conditions);
    expect(words).toContain('Type 2 diabetes');
    expect(words).toContain('Example Hospital');
  });
});
