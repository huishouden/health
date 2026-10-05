// Health's visits on screen and in from elsewhere: grouping, deep links, prep presets, calendar
// events and the assistant's appointments from before Health had visits. The documents and what a
// visit publishes are the kit's (`@huishouden/pwa-kit/visit`), shared with the connector.

import { plainText, type CalendarMatch } from '@huishouden/pwa-kit/calendar';
import type { AgendaItem } from '@huishouden/pwa-kit/agenda';
import { namedIn } from '@huishouden/pwa-kit/people';
import { DAY, MINUTE } from '@huishouden/pwa-kit/time';
import { DEFAULT_REMIND_BEFORE, followUpOpen, guessVisitKind, VISIT_LIMITS, visitEnd, visitState, type VisitInput } from '@huishouden/pwa-kit/visit';
import type { Person, Visit } from './model';
import { t } from '../i18n';

/** The deep link to a visit in Health. */
export const visitPath = (v: Pick<Visit, 'id' | 'personId'>) => `?tab=visits&person=${encodeURIComponent(v.personId)}&visit=${encodeURIComponent(v.id)}`;

/** How long a visit no one marked stays in "Did it happen?". */
export const MARK_WITHIN_DAYS = 30;
/** How long a marked visit stays where it was marked, with Undo (DESIGN.md "Completion"). */
export const MARKED_SHOWN_MS = 6 * 3_600_000;

export interface VisitGroups {
  /** Not over yet, soonest first. */
  upcoming: Visit[];
  /** Over in the last month and not marked, or marked in the last few hours (with Undo); oldest first. */
  toMark: Visit[];
  /** Over and marked, or too old to ask about; newest first. */
  past: Visit[];
  /** Over, wanting a follow-up nobody has booked or waived; oldest first. */
  followUps: Visit[];
}

export function visitGroups(visits: readonly Visit[], now: number): VisitGroups {
  const upcoming: Visit[] = [];
  const toMark: Visit[] = [];
  const past: Visit[] = [];
  for (const v of visits) {
    const state = visitState(v, now);
    if (state === 'upcoming' || state === 'now') upcoming.push(v);
    else if (state === 'unmarked' ? now - visitEnd(v) < MARK_WITHIN_DAYS * DAY : now - (v.markedAt ?? 0) < MARKED_SHOWN_MS) toMark.push(v);
    else past.push(v);
  }
  return {
    upcoming: upcoming.sort((a, b) => a.at - b.at),
    toMark: toMark.sort((a, b) => a.at - b.at),
    past: past.sort((a, b) => b.at - a.at),
    followUps: visits.filter((v) => followUpOpen(v, visits, now)).sort((a, b) => a.at - b.at),
  };
}

/** The next visit of a person within `days`, for Today. */
export function nextVisit(visits: readonly Visit[], personId: string, now: number, days = 7): Visit | undefined {
  return visits
    .filter((v) => v.personId === personId && !v.status && visitEnd(v) > now && v.at < now + days * DAY)
    .sort((a, b) => a.at - b.at)[0];
}

// i18n-dynamic: prep presets.
const PREP_KEYS = {
  fasting: 'prep.fasting',
  insurance: 'prep.insurance',
  early: 'prep.early',
  water: 'prep.water',
  driver: 'prep.driver',
} as const;
export type PrepPreset = keyof typeof PREP_KEYS;
export const PREP_PRESETS = Object.keys(PREP_KEYS) as PrepPreset[];
/** A preset's words in the active language, stored as typed (the visit keeps what was chosen). */
export const prepPreset = (p: PrepPreset) => t(PREP_KEYS[p]);

/** The visit a calendar event fills in, and whose it is when its words name exactly one person (never assumed). */
export function fromCalendar(m: CalendarMatch, people: readonly Person[]): { person: Person | null; input: Omit<VisitInput, 'personId'> } {
  const location = m.location?.trim().slice(0, VISIT_LIMITS.location);
  const minutes = !m.allDay && m.end && m.end > m.start ? Math.round((m.end - m.start) / MINUTE) : undefined;
  return {
    person: namedIn(`${m.title} ${plainText(m.description ?? '', 400)}`, people),
    input: {
      kind: guessVisitKind(`${m.title} ${m.location ?? ''}`),
      title: m.title.trim().slice(0, VISIT_LIMITS.title),
      at: m.start,
      ...(m.allDay ? { allDay: true } : {}),
      ...(minutes && minutes >= 5 && minutes <= VISIT_LIMITS.minutes ? { minutes } : {}),
      ...(location ? { location } : {}),
      remindBefore: [...DEFAULT_REMIND_BEFORE],
      calendarEventId: m.id,
      calendarLink: m.link,
    },
  };
}

/**
 * An appointment the assistant added before Health had visits: a `personalAgenda` item of app
 * `assistant`, ref `appointment:<person>:<id>`, with "place · notes" as its detail. As a visit under
 * the same id, and its notes; null for anything else. Moved over by a keeper's device (`useLiveStore`),
 * in that keeper's name (`by`), as the rules require of whoever creates it.
 */
export function fromAssistantItem(item: Pick<AgendaItem, 'app' | 'ref' | 'title' | 'start' | 'end' | 'allDay' | 'detail' | 'updatedAt'>, by: string): { visit: Visit; notes?: string } | null {
  const m = /^appointment:([^:]+):([^:]+)$/.exec(item.ref);
  if (item.app !== 'assistant' || !m) return null;
  const [, personId, id] = m;
  const parts = (item.detail ?? '').split(' · ').map((s) => s.trim()).filter(Boolean);
  // "place · notes" when both were given; one part alone could be either, so it goes to the notes, which only keepers read.
  const location = parts.length > 1 ? parts[0] : undefined;
  const notes = parts.length > 1 ? parts.slice(1).join(' · ') : parts[0];
  const minutes = !item.allDay && item.end ? Math.round((item.end - item.start) / MINUTE) : undefined;
  return {
    visit: {
      id,
      personId,
      kind: guessVisitKind(`${item.title} ${item.detail ?? ''}`),
      title: item.title.slice(0, VISIT_LIMITS.title),
      at: item.start,
      ...(item.allDay ? { allDay: true } : {}),
      ...(minutes && minutes >= 5 && minutes <= VISIT_LIMITS.minutes && minutes !== 60 ? { minutes } : {}),
      ...(location ? { location: location.slice(0, VISIT_LIMITS.location) } : {}),
      remindBefore: [...DEFAULT_REMIND_BEFORE],
      createdAt: item.updatedAt,
      by,
      via: 'assistant',
    },
    ...(notes ? { notes: notes.slice(0, VISIT_LIMITS.notes) } : {}),
  };
}
