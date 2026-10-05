// What Health publishes for the rest of the household, all of it for named people only
// (`@huishouden/pwa-kit/audience`): each person's admins, carers and the person themself.
//
// - Agenda (portal Today and Calendar): one item per person per dose time, today and tomorrow,
//   "Medicine for Nan", with how many medicines. Never a medicine's name where the portal shows
//   it (it may be on a wall tablet): the names go only in `calendarDetail`, which the portal never
//   shows and a reader's own calendar includes when they turn on Health details.
// - To-dos (portal To-do): doses not marked in the last 24 hours, one per person and time, with
//   Given and Skip; and refills, with Ordered.
// - Reminders (push, to the recipients' own devices): at each dose time to the main carer, naming
//   the medicines; if still not marked after the medicine's window, to the other carers; and a
//   refill reminder when the supply runs low.
// - Visits (`@huishouden/pwa-kit/visit`): "Appointment for Nan" on the agenda (what, with whom and
//   where only in `calendarDetail`), reminders at each of the visit's lead times to the person's
//   carers, and "Book a follow-up for Nan" on the to-do list once a visit wanting one is over.
//   Never the visit's notes.
//
// Pure: the app passes `url` (deep links) and `now`.

import type { PersonalAgendaInput } from '@huishouden/pwa-kit/agenda';
import type { PersonalTodoInput } from '@huishouden/pwa-kit/todos';
import type { PersonalReminderInput } from '@huishouden/pwa-kit/reminders';
import { reminderId } from '@huishouden/pwa-kit/reminders';
import { addDays, atClock, clockWords, DAY, toYmd, ymdToTime } from '@huishouden/pwa-kit/time';
import { capitalize } from '@huishouden/pwa-kit/i18n';
import type { Contact } from '@huishouden/pwa-kit/contact-core';
import { AGENDA_AHEAD_DAYS, AGENDA_PAST_DAYS } from '@huishouden/pwa-kit/agenda';
import { followUpTodo, visitAgendaItem, visitReminders, visitTitle, type PublishVisitOptions } from '@huishouden/pwa-kit/visit';
import type { Dose, Med, Person, Visit } from './model';
import { audienceOf, escalateTo, mainCarer, visitRecipients, type HouseholdLike } from './people';
import { visitPath } from './visits';
import { byTime, daysLeft, daysLeftText, doseId, doseText, isStopped, lowOn, medLabel, refillDue, rowsBetween } from './meds';
import { t } from '../i18n';

export const APP = 'health';

export interface PublishInput {
  people: Person[];
  meds: Med[];
  doses: Dose[];
  visits?: Visit[];
  /** The household's contacts, for a visit's doctor or clinic. */
  contacts?: Contact[];
  household: HouseholdLike;
  now: number;
  /** A deep link into Health: `url('?person=p1')`. */
  url: (path: string) => string;
}

const medicines = (n: number) => t('publish.medicines', { count: n });
const personPath = (p: Person) => `?tab=today&person=${encodeURIComponent(p.id)}`;
const handled = (state: string) => state === 'given' || state === 'skipped';

function each(input: PublishInput) {
  return input.people.map((p) => ({
    person: p,
    meds: input.meds.filter((m) => m.personId === p.id),
    doses: input.doses.filter((d) => d.personId === p.id),
    visits: (input.visits ?? []).filter((v) => v.personId === p.id),
    audience: audienceOf(p, input.household),
  }));
}

/** What a visit's published items need: whose, who reads them, the link and the doctor. */
function visitOptions(input: PublishInput, person: Person, audience: string[], v: Visit): PublishVisitOptions {
  const c = v.contactId ? input.contacts?.find((x) => x.id === v.contactId) : undefined;
  return { person, audience, url: input.url(visitPath(v)), ...(c ? { contact: { name: c.name, ...(c.address ? { address: c.address } : {}) } } : {}) };
}

/** Visits on the agenda: from a month back to half a year ahead, as the portal reads it. */
export function visitAgendaItems(input: PublishInput): PersonalAgendaInput[] {
  const from = input.now - AGENDA_PAST_DAYS * DAY;
  const to = input.now + AGENDA_AHEAD_DAYS * DAY;
  return each(input).flatMap(({ person, visits, audience }) =>
    visits.filter((v) => v.at >= from && v.at <= to).map((v) => visitAgendaItem(v, visitOptions(input, person, audience, v))),
  );
}

/** Agenda items: each person's dose times today and tomorrow, and their visits. */
export function agendaItems(input: PublishInput): PersonalAgendaInput[] {
  const today = toYmd(input.now);
  const from = ymdToTime(today);
  const to = ymdToTime(addDays(today, 2)) - 1;
  return each(input).flatMap(({ person, meds, doses, audience }): PersonalAgendaInput[] =>
    byTime(rowsBetween(meds, doses, from, to, input.now)).map((g) => ({
      ref: `dose:${person.id}:${g.rows[0].slot.key}`,
      kind: 'medicine' as const,
      title: t('publish.medicineFor', { name: person.name }),
      start: g.at,
      allDay: false,
      detail: medicines(g.rows.length),
      calendarDetail: g.rows.map((r) => [medLabel(r.med), doseText(r.med)].filter(Boolean).join(', ')).join('; '),
      url: input.url(personPath(person)),
      who: person.name,
      status: g.rows.every((r) => handled(r.state)) ? ('done' as const) : ('upcoming' as const),
      audience,
    })),
  ).concat(visitAgendaItems(input));
}

/** To-dos: doses not marked in the last 24 hours, and refills to order. */
export function todoItems(input: PublishInput): PersonalTodoInput[] {
  const { now } = input;
  const out: PersonalTodoInput[] = [];
  for (const { person, meds, doses, visits, audience } of each(input)) {
    // Admins always may; members and helpers who look after the person are named (the rules decide).
    const givers = audience.filter((e) => person.readers.includes(e));
    const who = { roles: ['admin' as const], ...(givers.length ? { emails: givers } : {}) };
    for (const g of byTime(rowsBetween(meds, doses, now - DAY, now, now))) {
      const missed = g.rows.filter((r) => r.state === 'missed');
      if (!missed.length) continue;
      const ops = (status: 'given' | 'skipped') =>
        missed.slice(0, 8).map((r) => ({
          col: `healthPeople/${person.id}/doses`,
          id: doseId(r.med.id, r.slot.key),
          data: { personId: person.id, medId: r.med.id, slot: r.slot.key, at: r.slot.at, status, by: '$me', createdAt: '$now' },
        }));
      const today = toYmd(g.at) === toYmd(now);
      out.push({
        ref: `missed:${person.id}:${g.rows[0].slot.key}`,
        title: t(today ? 'publish.notMarked' : 'publish.notMarkedYesterday', { time: clockWords(g.time), name: person.name }),
        detail: t('publish.notMarkedDetail', { count: missed.length }),
        createdAt: g.at,
        due: g.at,
        who: person.name,
        url: input.url(personPath(person)),
        done: { label: t('publish.markGiven'), ops: ops('given'), ...who },
        cancel: { label: t('publish.markSkipped'), ops: ops('skipped'), ...who },
        audience,
      });
    }
    for (const m of meds) {
      if (!refillDue(m, doses, now)) continue;
      const days = daysLeft(m, doses, now) ?? 0;
      const low = lowOn(m, doses, now);
      out.push({
        ref: `refill:${person.id}:${m.id}`,
        title: t('publish.refillFor', { name: person.name }),
        detail: [daysLeftText(days), m.refills !== undefined ? t('meds.refillsLeft', { count: m.refills }) : ''].filter(Boolean).join(', '),
        createdAt: low ? Math.min(now, ymdToTime(low)) : now,
        who: person.name,
        url: input.url(`?tab=medicines&person=${encodeURIComponent(person.id)}&med=${encodeURIComponent(m.id)}`),
        done: {
          label: t('publish.ordered'),
          ops: [{ col: `healthPeople/${person.id}/meds`, id: m.id, data: { refillOrderedAt: '$now', updatedAt: '$now' }, merge: true }],
          roles: ['admin'],
          ...(givers.length ? { emails: givers } : {}),
        },
        audience,
      });
    }
    for (const v of visits) {
      const todo = followUpTodo(v, visits, { person, audience, url: input.url(visitPath(v)), givers, now });
      if (todo) out.push(todo);
    }
  }
  return out;
}

/** How far ahead dose reminders are written; the app re-syncs on open and on every change. */
export const REMINDER_DAYS = 7;

/** Push reminders: dose times, unmarked doses for the other carers, and refills. */
export function reminderItems(input: PublishInput): PersonalReminderInput[] {
  const { now, household } = input;
  const out: PersonalReminderInput[] = [];
  for (const { person, meds, doses, visits, audience } of each(input)) {
    const recipients = visitRecipients(person, household);
    for (const v of visits) out.push(...visitReminders(v, { ...visitOptions(input, person, audience, v), recipients, now }));
    const main = mainCarer(person, household);
    const others = escalateTo(person, household);
    const url = input.url(personPath(person));
    const groups = byTime(rowsBetween(meds.filter((m) => m.remind), doses, now - DAY, now + REMINDER_DAYS * DAY, now));
    for (const g of groups) {
      const open = g.rows.filter((r) => !handled(r.state));
      if (!open.length) continue;
      const names = open.map((r) => [medLabel(r.med), doseText(r.med)].filter(Boolean).join(', ')).join('; ');
      if (main && g.at > now) {
        out.push({
          id: reminderId(`health:dose:${person.id}`, g.at),
          app: APP,
          title: t('publish.medicineFor', { name: person.name }),
          // The time the reader's way ("At 8 PM", "A las 8 p.m.", "Om 20:00"), then the medicines.
          body: t('publish.doseBody', { at: capitalize(atClock(g.time)), names }),
          at: g.at,
          url,
          recipients: [main],
          ref: `health:dose:${person.id}`,
          audience,
        });
      }
      const windows = open.map((r) => r.med.escalateMinutes).filter((n) => n > 0);
      if (!windows.length || !others.length) continue;
      const at = g.at + Math.min(...windows) * 60_000;
      if (at <= now) continue;
      out.push({
        id: reminderId(`health:late:${person.id}`, at),
        app: APP,
        title: t('publish.lateTitle', { name: person.name }),
        body: t('publish.lateBody', { time: clockWords(g.time), names }),
        at,
        url,
        recipients: others,
        ref: `health:late:${person.id}`,
        audience,
      });
    }
    if (!main) continue;
    for (const m of meds) {
      if (isStopped(m, now) || (m.refillOrderedAt && m.refillOrderedAt >= (m.supplyAt ?? m.createdAt))) continue;
      const low = lowOn(m, doses, now);
      const days = daysLeft(m, doses, now);
      if (!low || days === null) continue;
      const at = ymdToTime(low) + 9 * 3_600_000;
      if (at <= now) continue;
      out.push({
        id: reminderId(`health:refill:${m.id}`, at),
        app: APP,
        title: t('publish.refillSoon', { name: person.name }),
        body: m.refills !== undefined ? t('publish.refillBodyRefills', { med: medLabel(m), count: m.refills }) : t('publish.refillBody', { med: medLabel(m) }),
        at,
        url: input.url(`?tab=medicines&person=${encodeURIComponent(person.id)}&med=${encodeURIComponent(m.id)}`),
        recipients: [main],
        ref: `health:refill:${m.id}`,
        audience,
      });
    }
  }
  return out;
}

/** Everything Health holds that must never reach analytics: people's and medicines' names, and what visits are and where. */
export function sensitiveWords(people: readonly Person[], meds: readonly Med[], visits: readonly Visit[] = []): string[] {
  return [
    ...people.flatMap((p) => [p.name, ...p.name.split(/\s+/)]),
    ...meds.flatMap((m) => [m.name, medLabel(m)]),
    ...visits.flatMap((v) => [visitTitle(v), ...(v.location ? [v.location] : []), ...(v.prep ?? [])]),
  ];
}
