// Documents exactly as the rules accept them: trimmed, clipped, no undefined fields.

import { cleanRule, isEventRule } from '@huishouden/pwa-kit/schedule';
import { isHhmm, isYmd } from '@huishouden/pwa-kit/time';
import type { Stamp } from '@huishouden/pwa-kit/store';
import { LIMITS, MAX_TIMES, type DoseData, type MedData, type PersonData } from './model';
import { readersOf } from './people';

const clip = (s: string | undefined, max: number) => (s ?? '').trim().replace(/[ \t]+/g, ' ').slice(0, max);
const opt = <K extends string>(key: K, value: string | number | boolean | object | undefined | null) =>
  value === undefined || value === null || value === '' || (typeof value === 'number' && !Number.isFinite(value)) ? {} : ({ [key]: value } as Record<K, typeof value>);

export type PersonInput = Pick<PersonData, 'name' | 'carers'> & Partial<Pick<PersonData, 'birthDate' | 'email' | 'allergies' | 'notes'>>;

export function personDoc(input: PersonInput, stamp: Stamp): PersonData {
  const email = input.email ? input.email.trim().toLowerCase() : '';
  const carers = [...new Set(input.carers.map((e) => e.trim().toLowerCase()).filter(Boolean))].slice(0, 12);
  const base = { carers, ...(email ? { email } : {}) };
  return {
    name: clip(input.name, LIMITS.name),
    ...opt('birthDate', input.birthDate && isYmd(input.birthDate) ? input.birthDate : undefined),
    ...base,
    readers: readersOf(base),
    ...opt('allergies', clip(input.allergies, LIMITS.allergies)),
    ...opt('notes', clip(input.notes, LIMITS.notes)),
    ...stamp,
  } as PersonData;
}

export type MedInput = Omit<MedData, 'createdAt' | 'updatedAt' | 'by' | 'refillOrderedAt'> & { refillOrderedAt?: number };

export function medDoc(input: MedInput, stamp: Stamp): MedData {
  const times = input.asNeeded ? [] : [...new Set(input.times.filter(isHhmm))].sort().slice(0, MAX_TIMES);
  const rule = !input.asNeeded && input.rule && isEventRule(input.rule) ? cleanRule(input.rule) : undefined;
  return {
    personId: input.personId,
    name: clip(input.name, LIMITS.medName),
    ...opt('strength', clip(input.strength, LIMITS.strength)),
    ...opt('dose', clip(input.dose, LIMITS.dose)),
    ...opt('doseAmount', input.doseAmount && input.doseAmount > 0 ? Math.min(1000, input.doseAmount) : undefined),
    ...opt('doseUnit', clip(input.doseUnit, LIMITS.doseUnit)),
    asNeeded: input.asNeeded,
    times,
    ...(rule ? { rule } : opt('everyDays', input.asNeeded ? undefined : Math.min(31, Math.max(1, Math.round(input.everyDays ?? 1))))),
    ...opt('minHours', input.asNeeded && input.minHours ? Math.min(72, Math.max(0, input.minHours)) : undefined),
    ...opt('maxPerDay', input.asNeeded && input.maxPerDay ? Math.min(24, Math.max(1, Math.round(input.maxPerDay))) : undefined),
    ...opt('withFood', input.withFood),
    startDate: input.startDate,
    ...opt('endDate', input.endDate && isYmd(input.endDate) ? input.endDate : undefined),
    ...opt('prescriberId', input.prescriberId),
    ...opt('pharmacyId', input.pharmacyId),
    ...opt('refills', input.refills !== undefined ? Math.min(99, Math.max(0, Math.round(input.refills))) : undefined),
    ...opt('supply', input.supply !== undefined ? Math.min(10000, Math.max(0, input.supply)) : undefined),
    ...opt('supplyAt', input.supply !== undefined ? input.supplyAt : undefined),
    ...opt('refillOrderedAt', input.refillOrderedAt),
    escalateMinutes: Math.min(240, Math.max(0, Math.round(input.escalateMinutes))),
    remind: input.remind,
    ...opt('notes', clip(input.notes, LIMITS.notes)),
    ...stamp,
  } as MedData;
}

export function doseDoc(input: Omit<DoseData, 'createdAt' | 'by'>, by: string, now: number): DoseData {
  return {
    personId: input.personId,
    medId: input.medId,
    ...opt('slot', input.slot),
    at: Math.round(input.at),
    status: input.status,
    ...opt('note', clip(input.note, LIMITS.doseNote)),
    by,
    createdAt: now,
  } as DoseData;
}
