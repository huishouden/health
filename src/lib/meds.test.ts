import { describe, expect, test } from 'bun:test';
import { DEMO_NOW, demoData } from './demo';
import { byTime, dailyUse, dayRows, daysLeft, doseId, guardFor, lowOn, nextDose, refillDue, scheduleText, supplyLeft, adherenceOf, rateText } from './meds';
import type { Med } from './model';

const data = demoData();
const med = (id: string) => data.meds.find((m) => m.id === `demo-med-${id}`)!;
const name = (e: string) => e.split('@')[0];
const HOUR = 3_600_000;

describe('the sample morning', () => {
  test("Ria's 8 AM: lisinopril given, metformin not marked (missed after two hours)", () => {
    const ria = data.meds.filter((m) => m.personId === 'demo-person-ria');
    const rows = dayRows(ria, data.doses, DEMO_NOW).map((r) => `${r.slot.time} ${r.med.name} ${r.state}`);
    expect(rows).toEqual(['08:00 Lisinopril given', '08:00 Metformin missed', '18:00 Metformin upcoming', '21:00 Atorvastatin upcoming']);
    expect(byTime(dayRows(ria, data.doses, DEMO_NOW)).map((g) => g.time)).toEqual(['08:00', '18:00', '21:00']);
    expect(nextDose(ria, data.doses, DEMO_NOW)?.slot.time).toBe('18:00');
  });

  test('schedules in words', () => {
    expect(scheduleText(med('metformin'))).toBe('Every day at 8 AM and 6 PM');
    expect(scheduleText(med('amoxicillin'))).toBe('Every day at 8 AM, 2 PM, and 8 PM');
    expect(scheduleText(med('vitd'))).toBe('Every Monday at 8 AM');
    expect(scheduleText(med('paracetamol'))).toBe('As needed, at least 4 hours apart, at most 4 a day');
  });
});

describe('double doses', () => {
  test('a scheduled dose already given in its slot, or within half the gap, is flagged with who and when', () => {
    expect(guardFor(med('lisinopril'), data.doses, DEMO_NOW, name, '2031-05-14T08:00').warning).toMatch(/^Lisinopril 10 mg was already given 2 hours ago by jo\. Give it again\?$/);
    expect(guardFor(med('metformin'), data.doses, DEMO_NOW, name, '2031-05-14T08:00').warning).toBeNull();
  });

  test('as needed: too soon after the last, or the most for the day', () => {
    // Paracetamol at 8:40 this morning, at least 4 hours apart.
    expect(guardFor(med('paracetamol'), data.doses, DEMO_NOW, name).warning).toBe('Last given 2 hours ago; Paracetamol 500 mg needs 4 hours between doses. The next dose is fine from 12:40 PM.');
    expect(guardFor(med('paracetamol'), data.doses, DEMO_NOW + 3 * HOUR, name).warning).toBeNull();
  });
});

describe('supply', () => {
  test('counted 25 days ago, one tablet a day, one skipped: six left, refill due', () => {
    expect(supplyLeft(med('lisinopril'), data.doses)).toBe(6);
    expect(dailyUse(med('lisinopril'), data.doses, DEMO_NOW)).toBe(1);
    expect(daysLeft(med('lisinopril'), data.doses, DEMO_NOW)).toBe(6);
    expect(refillDue(med('lisinopril'), data.doses, DEMO_NOW)).toBe(true);
    expect(lowOn(med('lisinopril'), data.doses, DEMO_NOW)).toBe('2031-05-14');
    const ordered: Med = { ...med('lisinopril'), refillOrderedAt: DEMO_NOW };
    expect(refillDue(ordered, data.doses, DEMO_NOW)).toBe(false);
    expect(refillDue(med('metformin'), data.doses, DEMO_NOW)).toBe(false);
    expect(supplyLeft(med('atorvastatin'), data.doses)).toBeNull();
  });
});

describe('history', () => {
  test('adherence over four weeks counts the missed doses', () => {
    const a = adherenceOf(med('metformin'), data.doses, DEMO_NOW - 28 * 24 * HOUR, DEMO_NOW, DEMO_NOW);
    expect(a.missed).toBe(3);
    expect(rateText(a)).toBe('95%');
    expect(doseId('m1', '2031-05-14T08:00')).toBe('m1_2031-05-14T0800');
  });
});
