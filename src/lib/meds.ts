// Medicines over time: which doses are due, given, skipped or missed; the guards against a double
// dose; the supply left; and how a medicine went (adherence). Pure: everything takes `now`.

import {
  adherence,
  asNeededCheck,
  doseSlots,
  doubleDoseWindowMs,
  recentlyGiven,
  slotStatuses,
  type Adherence,
  type DoseLog,
  type DoseSlot,
  type ScheduleCourse,
  type SlotStatus,
} from '@huishouden/pwa-kit/dose';
import { describeRule } from '@huishouden/pwa-kit/schedule';
import { addDays, agoWords, clockWords, DAY, toHhmm, toYmd, ymdToTime } from '@huishouden/pwa-kit/time';
import { LOW_SUPPLY_DAYS, type Dose, type Med } from './model';
import { t } from '../i18n';
import { compareText, formatList, numberFormat } from '@huishouden/pwa-kit/i18n';

/** A dose is due from 30 minutes before its time until 2 hours after; later it is missed. */
export const WINDOW = { earlyMinutes: 30, graceMinutes: 120 };

/** "Lisinopril 10 mg". */
export const medLabel = (m: Pick<Med, 'name' | 'strength'>) => [m.name, m.strength].filter(Boolean).join(' ');

/** The kit's schedule for a scheduled medicine. */
export function scheduleOf(m: Med): ScheduleCourse {
  return {
    startDate: m.startDate,
    times: m.asNeeded ? [] : m.times,
    ...(m.rule ? { rule: m.rule } : { everyDays: m.everyDays ?? 1 }),
    ...(m.endDate ? { until: m.endDate } : {}),
  };
}

/** Taken on `day`: started and not yet ended. */
export function isCurrent(m: Pick<Med, 'startDate' | 'endDate'>, day: string): boolean {
  return m.startDate <= day && (!m.endDate || m.endDate >= day);
}

export const isStopped = (m: Pick<Med, 'endDate'>, now: number) => !!m.endDate && m.endDate < toYmd(now);

/** A medicine's doses as the kit's logs. */
export function logsOf(doses: readonly Dose[], medId: string): (DoseLog & Dose)[] {
  return doses.filter((d) => d.medId === medId);
}

/** The id a scheduled dose is stored under, so marking it twice (two devices) writes one document. */
export const doseId = (medId: string, slot: string) => `${medId}_${slot.replace(/[^0-9T-]/g, '')}`;

/** "Every day at 8 AM and 8 PM", "Every other day at 9 AM", "As needed, at least 4 hours apart, at most 3 a day". */
export function scheduleText(m: Med): string {
  if (m.asNeeded) {
    const parts = [t('meds.asNeeded')];
    if (m.minHours) parts.push(t('meds.minHours', { count: m.minHours }));
    if (m.maxPerDay) parts.push(t('meds.maxPerDay', { count: m.maxPerDay }));
    return parts.join(', ');
  }
  const days = m.rule ? describeRule(m.rule) : t('meds.everyDays', { count: m.everyDays ?? 1 });
  if (!m.times.length) return days;
  // "at 8 AM and 8 PM", "a las 8 a.m. y 8 p.m.", "om 8:00 en 20:00".
  const times = m.times.map((x) => clockWords(x));
  // Spanish says "a la 1" but "a las 8": the first time decides.
  return t('meds.daysAtTimes', { days, times: formatList(times), one: /^1(?!\d)/.test(times[0]) ? 'yes' : 'no' });
}

/** "1 tablet, with food". */
export function doseText(m: Pick<Med, 'dose' | 'withFood'>): string {
  return [m.dose, m.withFood === true ? t('meds.withFood') : m.withFood === false ? t('meds.emptyStomach') : ''].filter(Boolean).join(', ');
}

export type Row = SlotStatus<DoseLog & Dose> & { med: Med };

/** Every scheduled dose of the person's current medicines on the day of `now`, in time order. */
export function dayRows(meds: readonly Med[], doses: readonly Dose[], now: number, day = toYmd(now)): Row[] {
  const from = ymdToTime(day);
  const to = ymdToTime(addDays(day, 1)) - 1;
  return meds
    .filter((m) => !m.asNeeded && isCurrent(m, day))
    .flatMap((m) => slotStatuses(scheduleOf(m), logsOf(doses, m.id), from, to, now, WINDOW).map((s) => ({ ...s, med: m })))
    .sort((a, b) => a.slot.at - b.slot.at || compareText(medLabel(a.med), medLabel(b.med)));
}

/** Scheduled doses between `from` and `to` (any medicine current then), with what happened. */
export function rowsBetween(meds: readonly Med[], doses: readonly Dose[], from: number, to: number, now: number): Row[] {
  return meds
    .filter((m) => !m.asNeeded)
    .flatMap((m) => slotStatuses(scheduleOf(m), logsOf(doses, m.id), from, to, now, WINDOW).map((s) => ({ ...s, med: m })))
    .sort((a, b) => a.slot.at - b.slot.at || compareText(medLabel(a.med), medLabel(b.med)));
}

/** Rows grouped by dose time: one card per time on Today. */
export function byTime(rows: readonly Row[]): { at: number; time: string; rows: Row[] }[] {
  const groups = new Map<number, Row[]>();
  for (const r of rows) groups.set(r.slot.at, [...(groups.get(r.slot.at) ?? []), r]);
  return [...groups.entries()].sort((a, b) => a[0] - b[0]).map(([at, list]) => ({ at, time: list[0].slot.time, rows: list }));
}

/** The next scheduled dose after now (looking a week ahead), if any. */
export function nextDose(meds: readonly Med[], doses: readonly Dose[], now: number): Row | undefined {
  return rowsBetween(meds.filter((m) => isCurrent(m, toYmd(now)) || m.startDate > toYmd(now)), doses, now, now + 8 * DAY, now).find((r) => r.state === 'upcoming');
}

export interface Guard {
  /** One sentence for the person about to give it, or null when nothing stands in the way. */
  warning: string | null;
}

/**
 * Before marking a dose given: a scheduled medicine already given within half the time between its
 * doses, or an as-needed one given too recently or too often. Advice, never a block.
 */
export function guardFor(m: Med, doses: readonly Dose[], now: number, nameOf: (email: string) => string, slot?: string): Guard {
  const logs = logsOf(doses, m.id);
  if (m.asNeeded) {
    const check = asNeededCheck(logs, now, { minHours: m.minHours, maxPerDay: m.maxPerDay });
    if (check.ok) return { warning: null };
    const next = t(toYmd(check.nextAt) !== toYmd(now) ? 'guard.nextTomorrow' : 'guard.next', { time: clockWords(toHhmm(check.nextAt)) });
    if (check.reason === 'max-reached') return { warning: `${t('guard.max', { count: check.inLastDay, med: medLabel(m) })} ${next}` };
    return { warning: `${t('guard.tooSoon', { ago: agoWords(check.last!, now), med: medLabel(m), count: m.minHours ?? 0 })} ${next}` };
  }
  const same = slot ? logs.find((l) => l.slot === slot && l.status === 'given') : undefined;
  const recent = same ?? recentlyGiven(logs, now, doubleDoseWindowMs(m.times));
  if (!recent) return { warning: null };
  return { warning: t('guard.already', { med: medLabel(m), ago: agoWords(recent.at, now), name: nameOf(recent.by) }) };
}

// ---- Supply ----

/** Units used on an average day: scheduled doses over the next four weeks, or as needed the last two. */
export function dailyUse(m: Med, doses: readonly Dose[], now: number): number | null {
  const amount = m.doseAmount ?? 1;
  if (m.asNeeded) {
    const recent = logsOf(doses, m.id).filter((d) => d.status === 'given' && d.at > now - 14 * DAY && d.at <= now).length;
    return recent ? (recent * amount) / 14 : null;
  }
  const slots = doseSlots(scheduleOf(m), now, now + 28 * DAY).length;
  return slots ? (slots * amount) / 28 : null;
}

/** Units left: the last count less the doses given since. Null when nobody counted. */
export function supplyLeft(m: Med, doses: readonly Dose[]): number | null {
  if (m.supply === undefined) return null;
  const since = m.supplyAt ?? m.createdAt;
  const used = logsOf(doses, m.id).filter((d) => d.status === 'given' && d.at >= since).length * (m.doseAmount ?? 1);
  return Math.max(0, m.supply - used);
}

/** Whole days the supply lasts at the usual pace, or null when either isn't known. */
export function daysLeft(m: Med, doses: readonly Dose[], now: number): number | null {
  const left = supplyLeft(m, doses);
  const use = dailyUse(m, doses, now);
  if (left === null || !use) return null;
  return Math.floor(left / use);
}

/** Low on supply and no refill ordered since it was last counted. */
export function refillDue(m: Med, doses: readonly Dose[], now: number): boolean {
  if (isStopped(m, now)) return false;
  const days = daysLeft(m, doses, now);
  if (days === null || days > LOW_SUPPLY_DAYS) return false;
  return !(m.refillOrderedAt && m.refillOrderedAt >= (m.supplyAt ?? m.createdAt));
}

/** The day the supply is expected to reach `LOW_SUPPLY_DAYS` days (today when it already has). */
export function lowOn(m: Med, doses: readonly Dose[], now: number): string | null {
  const days = daysLeft(m, doses, now);
  if (days === null) return null;
  return addDays(toYmd(now), Math.max(0, days - LOW_SUPPLY_DAYS));
}

/** "About 5 days left", "Less than a day left". */
export function daysLeftText(days: number): string {
  if (days < 1) return t('meds.lessThanDay');
  return t('meds.daysLeft', { count: days });
}

// ---- History ----

export function adherenceOf(m: Med, doses: readonly Dose[], from: number, to: number, now: number): Adherence {
  return adherence(scheduleOf(m), logsOf(doses, m.id), from, to, now, WINDOW);
}

/** "92%" ("92 %" where the locale says so) or "No doses yet". */
const formatPercent = (rate: number) => numberFormat({ style: 'percent', maximumFractionDigits: 0 }).format(rate);

export function rateText(a: Adherence): string {
  return a.rate === null ? t('meds.noDoses') : formatPercent(a.rate);
}

export type { DoseSlot };
