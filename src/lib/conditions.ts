// Conditions as Health shows them: by person and medical area, the medicines that treat each, the
// visits about each, and the date fields the dialog edits. The model, the area table and the
// lookup are the kit's (`@huishouden/pwa-kit/condition`). Pure.

import { groupBySpecialty, isPartialDate, type SpecialtyGroup } from '@huishouden/pwa-kit/condition';
import type { Condition, Med, PartialDate, Visit } from './model';

/** One person's conditions by medical area, current areas first (`groupBySpecialty`). */
export function conditionGroups(conditions: readonly Condition[], personId: string): SpecialtyGroup<Condition>[] {
  return groupBySpecialty(conditions.filter((c) => c.personId === personId));
}

/** The household's conditions by medical area, each with whose it is: the carers' overview. */
export function householdGroups(conditions: readonly Condition[], personIds: readonly string[]): SpecialtyGroup<Condition>[] {
  const ids = new Set(personIds);
  return groupBySpecialty(conditions.filter((c) => ids.has(c.personId)));
}

/** The conditions each medicine treats, by medicine id, current ones first: Medicines' "For type 2 diabetes". */
export function conditionsByMed(conditions: readonly Condition[]): Map<string, Condition[]> {
  const out = new Map<string, Condition[]>();
  const order = { active: 0, managed: 1, resolved: 2 } as const;
  for (const c of [...conditions].sort((a, b) => order[a.status] - order[b.status])) for (const id of c.medIds ?? []) out.set(id, [...(out.get(id) ?? []), c]);
  return out;
}

/** The person's medicines that treat it, in the condition's order, skipping any since deleted. */
export const medsFor = (c: Pick<Condition, 'medIds'>, meds: readonly Med[]): Med[] => (c.medIds ?? []).map((id) => meds.find((m) => m.id === id)).filter((m): m is Med => !!m);

/** The visits about it, the next one first, then the past ones newest first. */
export function visitsFor(c: Pick<Condition, 'id' | 'personId'>, visits: readonly Visit[], now: number): Visit[] {
  const mine = visits.filter((v) => v.personId === c.personId && v.conditionId === c.id);
  const coming = mine.filter((v) => v.at >= now).sort((a, b) => a.at - b.at);
  const past = mine.filter((v) => v.at < now).sort((a, b) => b.at - a.at);
  return [...coming, ...past];
}

/** A partial date as the dialog edits it: a year, and optionally a month and then a day. */
export interface DateParts {
  year: string;
  /** "" or "01".."12". */
  month: string;
  /** "" or "01".."31". */
  day: string;
}

export function toParts(d: PartialDate | undefined): DateParts {
  if (!d || !isPartialDate(d)) return { year: '', month: '', day: '' };
  const [year, month = '', day = ''] = d.split('-');
  return { year, month, day };
}

/**
 * The stored partial date from the dialog's fields: undefined when the year is empty, null when the
 * fields don't make a real date (a year that isn't four digits, February 30).
 */
export function fromParts({ year, month, day }: DateParts): PartialDate | undefined | null {
  const y = year.trim();
  if (!y) return undefined;
  const value = [y, month, month ? day : ''].filter(Boolean).join('-');
  return isPartialDate(value) ? value : null;
}
