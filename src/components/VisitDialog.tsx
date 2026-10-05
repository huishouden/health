import { useState } from 'react';
import { ListChecks, Plus, Trash2, X } from 'lucide-react';
import type { Contact } from '@huishouden/pwa-kit/contacts';
import { useHome } from '@huishouden/pwa-kit/react/home';
import { Checkbox, Chip, deleteButton, Dialog, Field, ghostButton, inputClass, primaryButton, selectClass } from '@huishouden/pwa-kit/react/ui';
import { compareText } from '@huishouden/pwa-kit/i18n';
import { addDays, isHhmm, isYmd, shortDate, toHhmm, toYmd, ymdToTime } from '@huishouden/pwa-kit/time';
import { addInterval } from '@huishouden/pwa-kit/schedule';
import {
  DEFAULT_REMIND_BEFORE, DEFAULT_VISIT_MINUTES, FOLLOW_UP_CHOICES, followUpWords, leadWords, REMIND_CHOICES, VISIT_KINDS, VISIT_LIMITS, visitKindLabel,
  type FollowUp,
} from '@huishouden/pwa-kit/visit';
import type { Condition, Person, Specialty, Visit, VisitInput, VisitKind } from '../lib/model';
import { SPECIALTIES, specialtyLabel } from '@huishouden/pwa-kit/condition';
import { DOCTOR_WORDS, nameFromHome, roleLabel } from '../lib/contacts';
import { PREP_PRESETS, prepPreset } from '../lib/visits';
import { useT } from '../i18n';

const LENGTHS = [15, 20, 30, 45, 60, 90, 120];
const sameFollowUp = (a?: FollowUp, b?: FollowUp) => (a?.every ?? 0) === (b?.every ?? 0) && a?.unit === b?.unit;

/** The contact role a new doctor for this kind of visit gets in the contact dialog. */
export const roleForKind = (kind: VisitKind) => (kind === 'dentist' ? 'Dentist' : kind === 'specialist' || kind === 'eye' ? 'Specialist' : 'Doctor');

export interface VisitDraft {
  /** Filled in from a calendar event or as a follow-up. */
  input?: Partial<VisitInput>;
  personId?: string;
}

export function VisitDialog({ visit, draft, people, contacts, conditions, notes, canNotes, now, onSave, onDelete, onAddContact, onClose }: {
  visit: Visit | null;
  draft?: VisitDraft;
  /** Whose it may be: the people this member may add visits for. */
  people: Person[];
  contacts: Contact[];
  /**
   * The conditions this member may read, everyone's (only admins, member carers and the person: a
   * helper carer has none, and a visit's link to one stays as it is when they save it).
   */
  conditions: Condition[];
  /** Its notes as they are, when the member keeps them. */
  notes?: string;
  /** Whether the member reads and writes the person's visit notes. */
  canNotes: (personId: string) => boolean;
  now: number;
  onSave: (input: VisitInput, notes?: string) => void;
  onDelete?: () => void;
  /** Opens the contact dialog for a new doctor or clinic. */
  onAddContact: (role: string) => void;
  onClose: () => void;
}) {
  const t = useT();
  const home = useHome();
  const start: Partial<VisitInput> = visit ?? draft?.input ?? {};
  // A calendar event that named nobody is never assumed to be anyone's: whose it is gets chosen.
  const fromCalendar = !visit && !!draft?.input?.calendarEventId && !draft.personId;
  const [personId, setPersonId] = useState(visit?.personId ?? draft?.personId ?? (people.length === 1 && !fromCalendar ? people[0].id : ''));
  const [kind, setKind] = useState<VisitKind>(start.kind ?? 'checkup');
  const [title, setTitle] = useState(start.title ?? '');
  const [day, setDay] = useState(start.at ? toYmd(start.at) : addDays(toYmd(now), 1));
  const [time, setTime] = useState(start.at && !start.allDay ? toHhmm(start.at) : '09:00');
  const [allDay, setAllDay] = useState(!!start.allDay);
  const [minutes, setMinutes] = useState(start.minutes ?? DEFAULT_VISIT_MINUTES);
  const [contactId, setContactId] = useState(start.contactId ?? '');
  const [location, setLocation] = useState(start.location ?? '');
  const [link, setLink] = useState(start.link ?? '');
  const [prep, setPrep] = useState<string[]>(start.prep ?? []);
  const [medList, setMedList] = useState(!!start.medList);
  const [ownPrep, setOwnPrep] = useState('');
  const [remindBefore, setRemindBefore] = useState<number[]>([...(start.remindBefore ?? DEFAULT_REMIND_BEFORE)]);
  const [followUp, setFollowUp] = useState<FollowUp | undefined>(start.followUp);
  const [note, setNote] = useState(notes ?? '');
  const [specialty, setSpecialty] = useState<Specialty | ''>(start.specialty ?? '');
  const [conditionId, setConditionId] = useState(start.conditionId ?? '');
  const person = people.find((p) => p.id === personId);
  const keepsNotes = !!personId && canNotes(personId);
  const contact = contacts.find((c) => c.id === contactId);
  const theirConditions = conditions.filter((c) => c.personId === personId);
  // Whether this member reads the person's conditions; if not, the link is kept as it was.
  const linksConditions = theirConditions.length > 0;
  const linkOk = !link.trim() || /^https:\/\/\S+$/i.test(link.trim());
  const valid = !!person && isYmd(day) && (allDay || isHhmm(time)) && linkOk;
  const more = !!(start.specialty || start.conditionId || start.location || start.link || start.prep?.length || start.medList || start.followUp || notes || (start.minutes && start.minutes !== DEFAULT_VISIT_MINUTES));

  const doctors = [...contacts].sort((a, b) => Number(DOCTOR_WORDS.test(b.role ?? '')) - Number(DOCTOR_WORDS.test(a.role ?? '')) || compareText(a.name, b.name));
  const presets = PREP_PRESETS.map(prepPreset).filter((p) => !prep.includes(p));
  const addOwn = () => {
    const v = ownPrep.trim().slice(0, VISIT_LIMITS.prepItem);
    if (v && !prep.includes(v) && prep.length < VISIT_LIMITS.prep) setPrep((l) => [...l, v]);
    setOwnPrep('');
  };
  const toggleLead = (m: number) => setRemindBefore((l) => (l.includes(m) ? l.filter((x) => x !== m) : l.length < VISIT_LIMITS.remindBefore ? [...l, m] : l));

  const save = () => {
    if (!valid || !person) return;
    const at = allDay ? ymdToTime(day) : ymdToTime(day) + (Number(time.slice(0, 2)) * 60 + Number(time.slice(3))) * 60_000;
    onSave(
      {
        personId: person.id,
        kind,
        title,
        at,
        ...(allDay ? { allDay: true } : { minutes }),
        contactId: contactId || undefined,
        location,
        link: link.trim() || undefined,
        prep,
        medList,
        conditionId: (linksConditions ? theirConditions.find((c) => c.id === conditionId)?.id : start.conditionId) || undefined,
        specialty: specialty || undefined,
        remindBefore,
        followUp,
        followUpOf: start.followUpOf,
        calendarEventId: start.calendarEventId,
        calendarLink: start.calendarLink,
      },
      keepsNotes ? note : undefined,
    );
    onClose();
  };

  return (
    <Dialog
      wide
      title={visit ? t('visitDialog.edit') : person ? t('visitDialog.newFor', { name: person.name }) : t('visitDialog.new')}
      onClose={onClose}
      footer={
        <>
          {onDelete && (
            <button type="button" className={deleteButton} onClick={() => (onDelete(), onClose())}>
              <Trash2 size={18} /> {t('common.delete')}
            </button>
          )}
          <button type="button" className={ghostButton} onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="button" className={primaryButton} disabled={!valid} onClick={save}>
            {t('common.save')}
          </button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        {!visit && (people.length > 1 || fromCalendar) && (
          <Field label={t('visitDialog.whose')}>
            <select className={selectClass} value={personId} onChange={(e) => setPersonId(e.target.value)}>
              <option value="">{t('visitDialog.choosePerson')}</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
        )}

        <fieldset>
          <legend className="mb-1.5 block text-sm font-medium text-ink-soft">{t('visitDialog.kind')}</legend>
          <div className="flex flex-wrap gap-2">
            {VISIT_KINDS.map((k) => (
              <Chip key={k} active={kind === k} onClick={() => setKind(k)}>
                {visitKindLabel(k)}
              </Chip>
            ))}
          </div>
        </fieldset>

        <Field label={t('visitDialog.title')} hint={t('visitDialog.titleHint')}>
          <input className={inputClass} value={title} maxLength={VISIT_LIMITS.title} onChange={(e) => setTitle(e.target.value)} placeholder={visitKindLabel(kind)} autoComplete="off" />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('visitDialog.day')}>
            <input className={inputClass} type="date" value={day} onChange={(e) => setDay(e.target.value)} />
          </Field>
          <Field label={t('visitDialog.time')}>
            <input className={inputClass} type="time" value={time} disabled={allDay} onChange={(e) => setTime(e.target.value)} />
          </Field>
        </div>
        <Checkbox checked={allDay} onChange={setAllDay}>
          {t('visitDialog.timeUnknown')}
        </Checkbox>

        <Field label={t('visitDialog.doctor')} hint={contact ? nameFromHome(contact, { home }) : undefined}>
          <div className="flex gap-2">
            <select className={selectClass} value={contactId} onChange={(e) => setContactId(e.target.value)}>
              <option value="">{t('medDialog.notSet')}</option>
              {doctors.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.role ? ` (${roleLabel(c.role)})` : ''}
                </option>
              ))}
            </select>
            <button type="button" className={`${ghostButton} whitespace-nowrap`} onClick={() => onAddContact(roleForKind(kind))}>
              {t('medDialog.new')}
            </button>
          </div>
        </Field>

        <details className="rounded-2xl border border-line p-4" open={more}>
          <summary className="cursor-pointer select-none text-sm font-medium text-ink-soft">{t('visitDialog.more')}</summary>
          <div className="mt-3 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('visitDialog.specialty')} hint={t('visitDialog.specialtyHint')}>
                <select className={selectClass} value={specialty} onChange={(e) => setSpecialty(e.target.value as Specialty | '')}>
                  <option value="">{t('medDialog.notSet')}</option>
                  {[...SPECIALTIES].sort((a, b) => Number(a === 'primary') - Number(b === 'primary') || compareText(specialtyLabel(a), specialtyLabel(b))).map((s) => (
                    <option key={s} value={s}>
                      {specialtyLabel(s)}
                    </option>
                  ))}
                </select>
              </Field>
              {linksConditions && (
                <Field label={t('visitDialog.condition')}>
                  <select
                    className={selectClass}
                    value={conditionId}
                    onChange={(e) => {
                      setConditionId(e.target.value);
                      const c = theirConditions.find((x) => x.id === e.target.value);
                      if (c && !specialty) setSpecialty(c.specialty);
                    }}
                  >
                    <option value="">{t('medDialog.notSet')}</option>
                    {theirConditions.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('visitDialog.where')} hint={!location && contact?.address ? t('visitDialog.whereHint', { address: contact.address }) : undefined}>
                <input className={inputClass} value={location} maxLength={VISIT_LIMITS.location} onChange={(e) => setLocation(e.target.value)} placeholder={contact?.address ?? t('visitDialog.wherePlaceholder')} autoComplete="off" />
              </Field>
              {!allDay && (
                <Field label={t('visitDialog.length')}>
                  <select className={selectClass} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
                    {[...new Set([...LENGTHS, minutes])].sort((a, b) => a - b).map((m) => (
                      <option key={m} value={m}>
                        {t('visitDialog.minutes', { count: m })}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
            </div>
            <Field label={t('visitDialog.link')} hint={linkOk ? t('visitDialog.linkHint') : t('visitDialog.linkBad')}>
              <input className={inputClass} type="url" inputMode="url" aria-invalid={!linkOk} value={link} maxLength={VISIT_LIMITS.link} onChange={(e) => setLink(e.target.value)} placeholder="https://" autoComplete="off" />
            </Field>

            <fieldset>
              <legend className="mb-1.5 block text-sm font-medium text-ink-soft">{t('visitDialog.prep')}</legend>
              <div className="flex flex-wrap gap-2">
                <Chip active={medList} onClick={() => setMedList((x) => !x)}>
                  <ListChecks size={16} aria-hidden="true" /> {t('visits.bringList')}
                </Chip>
                {prep.map((p) => (
                  <span key={p} className="inline-flex min-h-11 items-center gap-1 rounded-full border border-primary bg-tint pl-3.5 text-sm font-medium text-link">
                    {p}
                    <button type="button" className="inline-flex h-11 w-11 items-center justify-center rounded-full hover:bg-tint-strong" aria-label={t('visitDialog.removePrep', { prep: p })} onClick={() => setPrep((l) => l.filter((x) => x !== p))}>
                      <X size={16} aria-hidden="true" />
                    </button>
                  </span>
                ))}
                {prep.length < VISIT_LIMITS.prep &&
                  presets.map((p) => (
                    <button key={p} type="button" className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line px-3.5 text-sm font-medium text-ink-soft hover:bg-sunken" onClick={() => setPrep((l) => [...l, p])}>
                      <Plus size={14} aria-hidden="true" /> {p}
                    </button>
                  ))}
              </div>
              {prep.length < VISIT_LIMITS.prep && (
                <div className="mt-2 flex gap-2">
                  <input
                    className={inputClass}
                    value={ownPrep}
                    maxLength={VISIT_LIMITS.prepItem}
                    onChange={(e) => setOwnPrep(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addOwn();
                      }
                    }}
                    placeholder={t('visitDialog.prepPlaceholder')}
                    aria-label={t('visitDialog.prepOwn')}
                    autoComplete="off"
                  />
                  <button type="button" className={ghostButton} disabled={!ownPrep.trim()} onClick={addOwn}>
                    {t('common.add')}
                  </button>
                </div>
              )}
            </fieldset>

            <fieldset>
              <legend className="mb-1.5 block text-sm font-medium text-ink-soft">{t('visitDialog.reminders')}</legend>
              <div className="flex flex-wrap gap-2">
                {REMIND_CHOICES.map((m) => (
                  <Chip key={m} active={remindBefore.includes(m)} onClick={() => toggleLead(m)}>
                    {leadWords(m)}
                  </Chip>
                ))}
              </div>
              <p className="mt-1 text-sm text-muted">
                {remindBefore.length ? t('visitDialog.remindersHint', { count: Math.max(1, person?.carers.length ?? 1) }) : t('visitDialog.noReminders')}
              </p>
            </fieldset>

            <Field label={t('visitDialog.followUp')} hint={followUp && isYmd(day) ? t('visitDialog.followUpHint', { date: shortDate(addInterval(day, followUp.every, followUp.unit), toYmd(now)) }) : undefined}>
              <select
                className={selectClass}
                value={followUp ? `${followUp.every}-${followUp.unit}` : ''}
                onChange={(e) => setFollowUp(FOLLOW_UP_CHOICES.find((f) => `${f.every}-${f.unit}` === e.target.value))}
              >
                <option value="">{t('visitDialog.noFollowUp')}</option>
                {[...FOLLOW_UP_CHOICES, ...(followUp && !FOLLOW_UP_CHOICES.some((f) => sameFollowUp(f, followUp)) ? [followUp] : [])].map((f) => (
                  <option key={`${f.every}-${f.unit}`} value={`${f.every}-${f.unit}`}>
                    {followUpWords(f)}
                  </option>
                ))}
              </select>
            </Field>

            {keepsNotes && (
              <Field label={t('common.notes')} hint={t('visitDialog.notesHint', { name: person?.name ?? '' })}>
                <textarea className={`${inputClass} min-h-24`} value={note} maxLength={VISIT_LIMITS.notes} onChange={(e) => setNote(e.target.value)} />
              </Field>
            )}
          </div>
        </details>
      </form>
    </Dialog>
  );
}
