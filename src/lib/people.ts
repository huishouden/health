// Who may do what with a person's medicines (the same as the rules in huishouden/rules), who is
// reminded, and who may read what Health publishes about them. Pure.

import { householdRole, type Role } from '@huishouden/pwa-kit/roles';
import { cleanAudience } from '@huishouden/pwa-kit/audience';
import { isYmd, toYmd } from '@huishouden/pwa-kit/time';
import type { Person, PersonData } from './model';

export interface HouseholdLike {
  members: string[];
  roles?: Record<string, Role>;
}

const lower = (e: string) => e.trim().toLowerCase();

/** The readers the rules check: the carers and the person's own email. */
export function readersOf(p: Pick<PersonData, 'carers' | 'email'>): string[] {
  return cleanAudience([...p.carers, ...(p.email ? [p.email] : [])]);
}

/** Admins see everyone; members and helpers the people they look after (or are); kids nobody. */
export function canSee(p: Pick<PersonData, 'readers'>, role: Role | null, me: string): boolean {
  if (role === 'admin') return true;
  return (role === 'member' || role === 'helper') && p.readers.includes(lower(me));
}

/** Admins, and members who are among the person's readers, change the person and their medicines. */
export function canEdit(p: Pick<PersonData, 'readers'>, role: Role | null, me: string): boolean {
  return role === 'admin' || (role === 'member' && p.readers.includes(lower(me)));
}

/** Admins, and members and helpers among the person's readers, mark doses. */
export function canGive(p: Pick<PersonData, 'readers'>, role: Role | null, me: string): boolean {
  return canSee(p, role, me);
}

/** Adding a person: admins and members (a member is then one of the carers). */
export const canAddPeople = (role: Role | null) => role === 'admin' || role === 'member';

const memberRole = (h: HouseholdLike, email: string) => householdRole({ members: h.members, roles: h.roles ?? {} }, email);
const notKid = (h: HouseholdLike) => (email: string) => {
  const r = memberRole(h, email);
  return r !== null && r !== 'kid';
};

export function admins(h: HouseholdLike): string[] {
  return h.members.filter((m) => memberRole(h, m) === 'admin');
}

/**
 * Who may read what Health publishes about a person (agenda items, to-dos, reminders): the
 * household's admins, the person's carers and the person themself, when they are members and not
 * kids. Lowercase and sorted.
 */
export function audienceOf(p: Pick<PersonData, 'readers'>, h: HouseholdLike): string[] {
  return cleanAudience([...admins(h), ...p.readers.filter(notKid(h))]);
}

/** Reminded at each dose time: the main carer, else the person themself, else the first admin. */
export function mainCarer(p: Pick<PersonData, 'carers' | 'email'>, h: HouseholdLike): string | null {
  const ok = notKid(h);
  return p.carers.map(lower).find(ok) ?? (p.email && ok(lower(p.email)) ? lower(p.email) : null) ?? admins(h)[0] ?? null;
}

/** Told when a dose isn't marked in time: the other carers (and the person), else the admins. */
export function escalateTo(p: Pick<PersonData, 'carers' | 'email' | 'readers'>, h: HouseholdLike): string[] {
  const main = mainCarer(p, h);
  const others = p.readers.filter(notKid(h)).filter((e) => e !== main);
  return cleanAudience(others.length ? others : admins(h).filter((e) => e !== main));
}

/** Age in whole years on `today`, or null without a birthday. */
export function ageOn(p: Pick<PersonData, 'birthDate'>, today: string): number | null {
  if (!p.birthDate || !isYmd(p.birthDate) || !isYmd(today)) return null;
  const [by, bm, bd] = p.birthDate.split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
}

/** "Nan (82)". */
export function nameWithAge(p: Pick<Person, 'name' | 'birthDate'>, now: number): string {
  const age = ageOn(p, toYmd(now));
  return age === null ? p.name : `${p.name} (${age})`;
}

/** First name for short labels. */
export const firstName = (p: Pick<Person, 'name'>) => p.name.trim().split(/\s+/)[0] ?? p.name;

