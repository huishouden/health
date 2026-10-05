import { CalendarArrowDown, CalendarPlus, ExternalLink, ListChecks, MapPin, Pencil, Phone, Video, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Contact } from '@huishouden/pwa-kit/contacts';
import { useClock } from '@huishouden/pwa-kit/react/clock';
import { useHome } from '@huishouden/pwa-kit/react/home';
import { canUndoDone, cardClass, CompletionRow, ghostButton, linkClass, overline, primaryButton, secondaryButton } from '@huishouden/pwa-kit/react/ui';
import { mapsSearchUrl, telHref } from '@huishouden/pwa-kit/places';
import { formatDayShort, formatTime, monthShort, relativeDay, shortDate, toYmd } from '@huishouden/pwa-kit/time';
import { capitalize, formatList } from '@huishouden/pwa-kit/i18n';
import { followUpDay, followUpWords, leadWords, visitKindLabel, visitState, visitTitle, visitWhen } from '@huishouden/pwa-kit/visit';
import type { Person, Visit } from '../lib/model';
import { canAddVisit, canChangeVisit, canKeepNotes, canMarkVisit } from '../lib/people';
import { nameFromHome } from '../lib/contacts';
import { visitGroups } from '../lib/visits';
import type { HealthStore } from '../data/actions';
import { Avatar, PersonChips } from '../components/Avatar';
import { t, useT } from '../i18n';

export interface VisitsProps {
  store: HealthStore;
  people: Person[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  highlight?: string | null;
  onAdd: (personId?: string) => void;
  onEdit: (v: Visit) => void;
  onMark: (v: Visit, status: 'attended' | 'missed' | null) => void;
  /** Opens a new visit, filled in, as the follow-up of `v`. */
  onBookFollowUp: (v: Visit) => void;
  onFollowUpDone: (v: Visit) => void;
  onPrint: (personId: string) => void;
  /** A member's name as shown ("You", "Jo"). */
  nameOf: (email: string) => string;
  /** Import from calendar; undefined when the calendar can't be searched (signed out). */
  onImport?: () => void;
  /** New events in the member's calendar (the kit's card), above the visits. */
  suggestions?: ReactNode;
  empty: ReactNode;
}

/** "Tomorrow at 10 AM", "Thu, May 15 at 2 PM", "All day Thursday": when, the reader's way. */
function whenWords(v: Visit, now: number): string {
  if (toYmd(v.at) === toYmd(now) || toYmd(v.at) === toYmd(now + 86_400_000)) return visitWhen(v, now);
  return v.allDay ? capitalize(relativeDay(v.at, now)) : `${capitalize(formatDayShort(v.at))}, ${formatTime(v.at)}`;
}

export function Visits({ store, people, selected, onSelect, highlight, onAdd, onEdit, onMark, onBookFollowUp, onFollowUpDone, onPrint, nameOf, onImport, suggestions, empty }: VisitsProps) {
  const t = useT();
  const { now } = useClock();
  const { data, role, me } = store;
  if (people.length === 0) return <>{empty}</>;
  const shown = selected ? people.filter((p) => p.id === selected) : people;
  const ids = new Set(shown.map((p) => p.id));
  const personOf = (id: string) => people.find((p) => p.id === id);
  const visits = data.visits.filter((v) => ids.has(v.personId));
  const groups = visitGroups(visits, now);
  const adders = shown.filter((p) => canAddVisit(p, role, me));
  const many = shown.length > 1;
  const nameFor = (v: Visit) => personOf(v.personId)?.name ?? '';
  const titleFor = (v: Visit) => (many ? t('visits.titleFor', { title: visitTitle(v), name: nameFor(v) }) : visitTitle(v));

  return (
    <div className="space-y-4">
      <PersonChips people={people} selected={selected} onSelect={onSelect} />
      <div className="flex flex-wrap items-center gap-2">
        {adders.length > 0 && (
          <button type="button" className={primaryButton} onClick={() => onAdd(selected ?? undefined)}>
            <CalendarPlus size={20} /> {t('visits.add')}
          </button>
        )}
        {adders.length > 0 && onImport && (
          <button type="button" className={secondaryButton} onClick={onImport}>
            <CalendarArrowDown size={20} /> {t('visits.import')}
          </button>
        )}
      </div>
      {suggestions}

      {(groups.toMark.length > 0 || groups.followUps.length > 0) && (
        <section aria-label={t(groups.toMark.length ? 'visits.toMark' : 'visits.followUps')} className={`${cardClass} p-5 sm:p-6`}>
          <h2 className="text-xl font-semibold text-ink">{t(groups.toMark.length ? 'visits.toMark' : 'visits.followUps')}</h2>
          <ul className="mt-2 divide-y divide-line">
            {groups.toMark.map((v) => {
              const p = personOf(v.personId)!;
              const may = canMarkVisit(p, role, me);
              const done = !!v.status;
              const name = titleFor(v);
              return (
                <CompletionRow
                  key={v.id}
                  done={done}
                  skipped={v.status === 'missed'}
                  name={name}
                  title={name}
                  meta={whenWords(v, now)}
                  attention
                  leading={<Avatar person={p} people={people} size={40} />}
                  status={done ? markedWords(v, me, nameOf) : undefined}
                  verb={t('visits.attended')}
                  label={t('visits.markAttended', { title: name })}
                  undoLabel={t('visits.undoMark', { title: name })}
                  disabled={!may}
                  onDone={() => onMark(v, 'attended')}
                  onUndo={may && done && canUndoDone(v.markedAt, now) ? () => onMark(v, null) : undefined}
                  actions={
                    may && (
                      <button type="button" className={ghostButton} aria-label={t('visits.markMissed', { title: name })} onClick={() => onMark(v, 'missed')}>
                        <XCircle size={18} aria-hidden="true" /> {t('visits.missed')}
                      </button>
                    )
                  }
                />
              );
            })}
            {groups.followUps.map((v) => {
              const p = personOf(v.personId)!;
              const day = followUpDay(v);
              const name = t('visits.followUpFor', { title: visitTitle(v), name: p.name });
              return (
                <li key={`follow-${v.id}`} data-completion="open" className="flex flex-wrap items-center gap-3 py-2.5">
                  <Avatar person={p} people={people} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="text-lg leading-snug font-semibold text-ink">{name}</p>
                    <p className="text-base text-muted">
                      {t('visits.followUpWhen', { when: followUpWords(v.followUp!), date: day ? shortDate(day, toYmd(now)) : '' })}
                    </p>
                  </div>
                  {canMarkVisit(p, role, me) && (
                    <div className="flex w-full items-center justify-end gap-1 sm:w-auto">
                      <button type="button" className={ghostButton} aria-label={t('visits.notNeededFor', { title: name })} onClick={() => onFollowUpDone(v)}>
                        {t('visits.notNeeded')}
                      </button>
                      {canAddVisit(p, role, me) && (
                        <button type="button" className={secondaryButton} aria-label={t('visits.bookFor', { title: name })} onClick={() => onBookFollowUp(v)}>
                          <CalendarPlus size={18} aria-hidden="true" /> {t('visits.book')}
                        </button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section aria-label={t('visits.upcoming')} className={`${cardClass} p-5 sm:p-6`}>
        <h2 className="text-xl font-semibold text-ink">{t('visits.upcoming')}</h2>
        {groups.upcoming.length === 0 ? (
          <p className="mt-2 text-lg text-muted">{adders.length ? t('visits.noneEditable') : t('visits.none')}</p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {groups.upcoming.map((v) => (
              <VisitRow key={v.id} visit={v} person={personOf(v.personId)!} store={store} many={many} now={now} highlight={highlight === v.id} onEdit={onEdit} onPrint={onPrint} />
            ))}
          </ul>
        )}
      </section>

      {groups.past.length > 0 && (
        <section aria-label={t('visits.past')} className={`${cardClass} p-5 sm:p-6`}>
          <h2 className="text-xl font-semibold text-ink">{t('visits.past')}</h2>
          <ul className="mt-2 divide-y divide-line">
            {groups.past.slice(0, 30).map((v) => {
              const p = personOf(v.personId)!;
              const state = visitState(v, now);
              const editable = canChangeVisit(v, p, role, me);
              const note = canKeepNotes(p, role, me) ? data.visitNotes.find((n) => n.id === v.id)?.text : undefined;
              return (
                <li key={v.id} className="flex items-start gap-3 py-2.5">
                  <DateTile at={v.at} muted />
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-medium text-ink [overflow-wrap:anywhere]">{titleFor(v)}</p>
                    <p className="text-sm text-muted">
                      {[visitKindLabel(v.kind), state === 'attended' ? t('visits.wasAttended') : state === 'missed' ? t('visits.wasMissed') : t('visits.notMarked')].join(' · ')}
                    </p>
                    {note && <p className="mt-1 text-sm text-ink-soft [overflow-wrap:anywhere] whitespace-pre-line">{note}</p>}
                  </div>
                  {editable && (
                    <button type="button" className={ghostButton} aria-label={t('visits.edit', { title: titleFor(v) })} onClick={() => onEdit(v)}>
                      <Pencil size={18} aria-hidden="true" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

/** "Attended · marked by Jo at 4:10 PM", "Missed · marked by you". */
function markedWords(v: Visit, me: string, nameOf: (email: string) => string): string {
  const missed = v.status === 'missed';
  const at = v.markedAt ? formatTime(v.markedAt) : '';
  if (v.markedBy === me) return t(missed ? 'visits.missedByYou' : 'visits.attendedByYou', { at });
  return t(missed ? 'visits.missedBy' : 'visits.attendedBy', { name: v.markedBy ? nameOf(v.markedBy) : '', at });
}

/** The day as a small tile: "MAY" over "15". */
function DateTile({ at, muted }: { at: number; muted?: boolean }) {
  return (
    <span aria-hidden="true" className={`flex h-14 w-12 shrink-0 flex-col items-center justify-center rounded-xl border border-line ${muted ? 'bg-sunken text-muted' : 'bg-tint text-link'}`}>
      <span className="text-xs font-semibold uppercase">{monthShort(at)}</span>
      <span className="text-xl leading-none font-semibold">{new Date(at).getDate()}</span>
    </span>
  );
}

function VisitRow({ visit: v, person, store, many, now, highlight, onEdit, onPrint }: {
  visit: Visit;
  person: Person;
  store: HealthStore;
  many: boolean;
  now: number;
  highlight: boolean;
  onEdit: (v: Visit) => void;
  onPrint: (personId: string) => void;
}) {
  const t = useT();
  const home = useHome();
  const { data, role, me } = store;
  const contact: Contact | undefined = v.contactId ? data.contacts.find((c) => c.id === v.contactId) : undefined;
  const where = v.location || contact?.address;
  const note = canKeepNotes(person, role, me) ? data.visitNotes.find((n) => n.id === v.id)?.text : undefined;
  const editable = canChangeVisit(v, person, role, me);
  const title = visitTitle(v);
  const on = visitState(v, now) === 'now';
  return (
    <li id={`visit-${v.id}`} className={`flex items-start gap-3 py-3 ${highlight ? 'rounded-xl bg-tint px-2' : ''}`} aria-label={many ? t('visits.titleFor', { title, name: person.name }) : title}>
      <DateTile at={v.at} />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-lg leading-snug font-semibold text-ink [overflow-wrap:anywhere]">
          {title}
          {many && <span className="font-normal text-muted"> {t('today.forName', { name: person.name })}</span>}
        </p>
        <p className={`text-base ${on ? 'font-semibold text-attention' : 'text-ink-soft'}`}>
          {[on ? t('visits.now') : whenWords(v, now), v.title ? visitKindLabel(v.kind) : ''].filter(Boolean).join(' · ')}
        </p>
        {contact && (
          <p className="flex flex-wrap items-center gap-x-3 text-base text-ink-soft">
            <span>{nameFromHome(contact, { home })}</span>
            {contact.phone && (
              <a className={linkClass} href={telHref(contact.phone)}>
                <Phone size={16} aria-hidden="true" /> {contact.phone}
              </a>
            )}
          </p>
        )}
        {where && (
          <a className={`${linkClass} [overflow-wrap:anywhere]`} href={mapsSearchUrl(where)} target="_blank" rel="noopener noreferrer">
            <MapPin size={16} aria-hidden="true" /> {where}
          </a>
        )}
        {v.link && (
          <p>
            <a className={linkClass} href={v.link} target="_blank" rel="noopener noreferrer">
              <Video size={16} aria-hidden="true" /> {t('visits.join')}
            </a>
          </p>
        )}
        {(v.prep?.length || v.medList) && (
          <div className="flex flex-wrap items-center gap-2 pt-1" aria-label={t('visits.before')}>
            <span className={overline}>{t('visits.before')}</span>
            {v.prep?.map((p) => (
              <span key={p} className="rounded-full border border-line px-3 py-1 text-sm text-ink-soft">
                {p}
              </span>
            ))}
            {v.medList && (
              <button type="button" className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-primary px-3 text-sm font-medium text-link hover:bg-tint" onClick={() => onPrint(person.id)}>
                <ListChecks size={16} aria-hidden="true" /> {t('visits.bringList')}
              </button>
            )}
          </div>
        )}
        <p className="text-sm text-muted">{v.remindBefore.length ? t('visits.reminders', { leads: formatList(v.remindBefore.map((m) => leadWords(m).toLowerCase())) }) : t('visits.noReminders')}</p>
        {v.followUp && <p className="text-sm text-muted">{t('visits.followUpAfter', { when: followUpWords(v.followUp).toLowerCase() })}</p>}
        {note && <p className="text-sm text-ink-soft [overflow-wrap:anywhere] whitespace-pre-line">{note}</p>}
        {v.calendarLink && (
          <a className={`${linkClass} text-sm`} href={v.calendarLink} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={14} aria-hidden="true" /> {t('visits.inCalendar')}
          </a>
        )}
      </div>
      {editable && (
        <button type="button" className={ghostButton} aria-label={t('visits.edit', { title })} onClick={() => onEdit(v)}>
          <Pencil size={18} aria-hidden="true" />
        </button>
      )}
    </li>
  );
}
