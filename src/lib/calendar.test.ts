import { describe, expect, test } from 'bun:test';
import { googleTemplateUrl } from '@huishouden/pwa-kit/calendar-export';
import { doseEntries, doseRule } from './meds';
import type { Med } from './model';

const med = (over: Partial<Med>): Med => ({
  id: 'm1', personId: 'p1', name: 'Lisinopril', strength: '10 mg', dose: '1 tablet', asNeeded: false, times: ['08:00'], startDate: '2031-01-06',
  escalateMinutes: 30, remind: true, createdAt: 0, by: 'a@example.com', ...over,
});

describe('doses in your own calendar', () => {
  test('every day: weekly on every day, ending when the medicine does', () => {
    expect(doseRule(med({ endDate: '2031-02-01' }))).toEqual({ freq: 'week', every: 1, start: '2031-01-06', days: [0, 1, 2, 3, 4, 5, 6], until: '2031-02-01' });
    expect(doseRule(med({ everyDays: 14 }))).toEqual({ freq: 'week', every: 2, start: '2031-01-06' });
  });

  test('its own rule keeps its rhythm; as needed or every 3 days can’t repeat in a calendar', () => {
    const rule = { freq: 'month' as const, every: 1, start: '2030-12-15' };
    expect(doseRule(med({ rule, endDate: '2031-06-30' }))).toEqual({ ...rule, until: '2031-06-30' });
    expect(doseRule(med({ asNeeded: true, times: [] }))).toBeNull();
    expect(doseRule(med({ everyDays: 3 }))).toBeNull();
    expect(doseEntries(med({ everyDays: 3 }))).toEqual([]);
  });

  test('one repeating event per dose time, the time in the title when there are several', () => {
    const [morning, evening] = doseEntries(med({ times: ['08:00', '20:00'] }), 'https://example.com/health/');
    expect(morning.title).toMatch(/^Lisinopril 10 mg, 8\s?AM$/);
    expect(evening.series?.time).toBe('20:00');
    expect(morning).toMatchObject({ allDay: false, kind: 'medicine', detail: '1 tablet', url: 'https://example.com/health/' });
    const url = new URL(googleTemplateUrl(doseEntries(med({}))[0], { timeZone: 'Europe/Amsterdam' }));
    expect(url.searchParams.get('text')).toBe('Lisinopril 10 mg');
    expect(url.searchParams.get('recur')).toBe('RRULE:FREQ=WEEKLY;BYDAY=SU,MO,TU,WE,TH,FR,SA;WKST=SU');
    expect(url.searchParams.get('dates')).toBe('20310106T080000/20310106T081500');
  });
});
