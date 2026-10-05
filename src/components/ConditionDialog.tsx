import { useEffect, useRef, useState } from 'react';
import { Search, Trash2 } from 'lucide-react';
import type { Contact } from '@huishouden/pwa-kit/contacts';
import { ContactSelect } from '@huishouden/pwa-kit/react/contacts';
import { useHome } from '@huishouden/pwa-kit/react/home';
import { Checkbox, Chip, deleteButton, Dialog, Field, ghostButton, inputClass, primaryButton, selectClass } from '@huishouden/pwa-kit/react/ui';
import {
  CONDITION_LIMITS, CONDITION_SEVERITIES, CONDITION_STATUSES, ConditionSearchUnavailable, SPECIALTIES, conditionStatusLabel, defaultSpecialty, searchConditions, severityLabel,
  specialtyLabel, type ConditionMatch,
} from '@huishouden/pwa-kit/condition';
import { compareText } from '@huishouden/pwa-kit/i18n';
import { formatDayShort, monthName } from '@huishouden/pwa-kit/time';
import { visitTitle } from '@huishouden/pwa-kit/visit';
import type { Condition, ConditionInput, ConditionSeverity, ConditionStatus, Med, Person, Specialty, Visit } from '../lib/model';
import { fromParts, toParts, type DateParts } from '../lib/conditions';
import { DOCTOR_WORDS, nameFromHome, roleLabel } from '../lib/contacts';
import { isStopped, medLabel } from '../lib/meds';
import { useT } from '../i18n';

/** Waits this long after the last key before asking the lookup. */
const SEARCH_DELAY_MS = 300;

type Lookup = { state: 'idle' } | { state: 'searching' } | { state: 'found'; matches: ConditionMatch[] } | { state: 'offline' };

/**
 * Suggestions for the name as it is typed, from the kit's lookup (the National Library of Medicine's
 * Clinical Tables): debounced, the last answer wins, nothing asked offline or once one is picked.
 */
function useConditionLookup(term: string, enabled: boolean): Lookup {
  const [lookup, setLookup] = useState<Lookup>({ state: 'idle' });
  useEffect(() => {
    const q = term.trim();
    if (!enabled || q.length < 2) {
      setLookup({ state: 'idle' });
      return;
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setLookup({ state: 'offline' });
      return;
    }
    const abort = new AbortController();
    const timer = setTimeout(() => {
      setLookup({ state: 'searching' });
      searchConditions(q, { signal: abort.signal, limit: 6 })
        .then((matches) => !abort.signal.aborted && setLookup({ state: 'found', matches }))
        .catch((e) => {
          if (abort.signal.aborted) return;
          setLookup(e instanceof ConditionSearchUnavailable ? { state: 'offline' } : { state: 'idle' });
        });
    }, SEARCH_DELAY_MS);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [term, enabled]);
  return lookup;
}

function DateFields({ label, value, onChange, invalid }: { label: string; value: DateParts; onChange: (v: DateParts) => void; invalid: boolean }) {
  const t = useT();
  const days = Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0'));
  return (
    <fieldset>
      <legend className="mb-1.5 block text-sm font-medium text-ink-soft">{label}</legend>
      <div className="flex flex-wrap gap-2">
        <input
          className={`${inputClass} max-w-28`}
          inputMode="numeric"
          aria-label={t('conditionDialog.year', { label })}
          aria-invalid={invalid}
          placeholder={t('conditionDialog.yearPlaceholder')}
          value={value.year}
          onChange={(e) => onChange({ ...value, year: e.target.value.replace(/\D/g, '').slice(0, 4) })}
        />
        <select className={`${selectClass} max-w-44`} aria-label={t('conditionDialog.month', { label })} value={value.month} disabled={!value.year} onChange={(e) => onChange({ ...value, month: e.target.value, day: e.target.value ? value.day : '' })}>
          <option value="">{t('conditionDialog.anyMonth')}</option>
          {Array.from({ length: 12 }, (_, i) => (
            <option key={i} value={String(i + 1).padStart(2, '0')}>
              {monthName(i + 1)}
            </option>
          ))}
        </select>
        {value.month && (
          <select className={`${selectClass} max-w-28`} aria-label={t('conditionDialog.day', { label })} value={value.day} onChange={(e) => onChange({ ...value, day: e.target.value })}>
            <option value="">{t('conditionDialog.anyDay')}</option>
            {days.map((d) => (
              <option key={d} value={d}>
                {Number(d)}
              </option>
            ))}
          </select>
        )}
      </div>
      {invalid && <p className="mt-1 text-sm text-attention">{t('conditionDialog.badDate')}</p>}
    </fieldset>
  );
}

export function ConditionDialog({ condition, person, contacts, meds, visits, now, onSave, onDelete, onAddContact, onClose }: {
  condition: Condition | null;
  person: Person;
  contacts: Contact[];
  /** The person's medicines. */
  meds: Med[];
  /** The person's visits. */
  visits: Visit[];
  now: number;
  onSave: (input: ConditionInput, visitIds: string[]) => void;
  onDelete?: () => void;
  /** Opens the contact dialog for a new doctor or clinic. */
  onAddContact: (role: string) => void;
  onClose: () => void;
}) {
  const t = useT();
  const home = useHome();
  const [name, setName] = useState(condition?.name ?? '');
  const [icd10, setIcd10] = useState(condition?.icd10);
  // The name a suggestion filled in: typing over it drops its code.
  const picked = useRef(condition?.icd10 ? condition.name : '');
  const [specialty, setSpecialty] = useState<Specialty>(condition?.specialty ?? 'primary');
  // Chosen by hand: the lookup and the name no longer move it.
  const [ownSpecialty, setOwnSpecialty] = useState(!!condition);
  const [status, setStatus] = useState<ConditionStatus>(condition?.status ?? 'active');
  const [diagnosed, setDiagnosed] = useState<DateParts>(toParts(condition?.diagnosed));
  const [resolved, setResolved] = useState<DateParts>(toParts(condition?.resolved));
  const [severity, setSeverity] = useState<ConditionSeverity | ''>(condition?.severity ?? '');
  const [doctorId, setDoctorId] = useState(condition?.doctorId ?? '');
  const [clinicId, setClinicId] = useState(condition?.clinicId ?? '');
  const [place, setPlace] = useState(condition?.place ?? '');
  const [medIds, setMedIds] = useState<string[]>(condition?.medIds ?? []);
  const [visitIds, setVisitIds] = useState<string[]>(() => (condition ? visits.filter((v) => v.conditionId === condition.id).map((v) => v.id) : []));
  const [notes, setNotes] = useState(condition?.notes ?? '');
  const [searching, setSearching] = useState(!condition);
  const lookup = useConditionLookup(name, searching);

  const diagnosedValue = fromParts(diagnosed);
  const resolvedValue = status === 'resolved' ? fromParts(resolved) : undefined;
  const valid = name.trim().length > 0 && diagnosedValue !== null && resolvedValue !== null;
  const more = !!condition && !!(condition.diagnosed || condition.doctorId || condition.clinicId || condition.place || condition.severity || condition.medIds?.length || condition.notes || visitIds.length);

  const typeName = (value: string) => {
    setName(value);
    setSearching(true);
    if (icd10 && value.trim() !== picked.current) setIcd10(undefined);
    if (!ownSpecialty) setSpecialty(defaultSpecialty({ name: value }));
  };
  const pick = (m: ConditionMatch) => {
    const n = m.name.slice(0, CONDITION_LIMITS.name);
    setName(n);
    picked.current = n;
    setIcd10(m.icd10);
    setSearching(false);
    if (!ownSpecialty) setSpecialty(m.specialty ?? defaultSpecialty({ name: n }));
  };

  const doctors = [...contacts].sort((a, b) => Number(DOCTOR_WORDS.test(b.role ?? '')) - Number(DOCTOR_WORDS.test(a.role ?? '')) || compareText(a.name, b.name));
  const doctor = contacts.find((c) => c.id === doctorId);
  const clinic = contacts.find((c) => c.id === clinicId);
  const medChoices = meds.filter((m) => !isStopped(m, now) || medIds.includes(m.id)).sort((a, b) => compareText(medLabel(a), medLabel(b)));
  const visitChoices = [...visits].sort((a, b) => b.at - a.at).slice(0, 12);
  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  const save = () => {
    if (!valid) return;
    onSave(
      {
        personId: person.id,
        name,
        icd10,
        specialty,
        status,
        diagnosed: diagnosedValue ?? undefined,
        resolved: resolvedValue ?? undefined,
        severity: severity || undefined,
        doctorId: doctorId || undefined,
        clinicId: clinicId || undefined,
        place: clinicId ? undefined : place,
        medIds,
        notes,
      },
      visitIds,
    );
    onClose();
  };

  const contactField = (label: string, value: string, set: (v: string) => void, chosen: Contact | undefined, role: string) => (
    <Field label={label} hint={chosen ? nameFromHome(chosen, { home }) : undefined}>
      <div className="flex gap-2">
        <ContactSelect value={value} contacts={doctors} onChange={set} empty={t('medDialog.notSet')} roleLabel={roleLabel} label={label} />
        <button type="button" className={`${ghostButton} whitespace-nowrap`} onClick={() => onAddContact(role)}>
          {t('medDialog.new')}
        </button>
      </div>
    </Field>
  );

  return (
    <Dialog
      wide
      title={condition ? t('a11y.edit', { name: condition.name }) : t('conditionDialog.newFor', { name: person.name })}
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
        <Field label={t('conditionDialog.name')} hint={icd10 ? t('conditionDialog.code', { code: icd10 }) : t('conditionDialog.lookupNote')}>
          <div className="relative">
            <Search size={18} aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
            <input
              className={`${inputClass} pl-10`}
              value={name}
              maxLength={CONDITION_LIMITS.name}
              onChange={(e) => typeName(e.target.value)}
              placeholder={t('conditionDialog.namePlaceholder')}
              autoComplete="off"
              aria-autocomplete="list"
              aria-controls="condition-suggestions"
            />
          </div>
        </Field>
        {searching && lookup.state !== 'idle' && (
          <div id="condition-suggestions" aria-live="polite" className="-mt-2">
            {lookup.state === 'searching' && <p className="text-sm text-muted">{t('conditionDialog.searching')}</p>}
            {lookup.state === 'offline' && <p className="text-sm text-muted">{t('conditionDialog.offline')}</p>}
            {lookup.state === 'found' &&
              (lookup.matches.length ? (
                <ul aria-label={t('conditionDialog.suggestions')} className="divide-y divide-line rounded-2xl border border-line">
                  {lookup.matches.map((m) => (
                    <li key={`${m.name}|${m.icd10 ?? ''}`}>
                      <button type="button" className="flex min-h-11 w-full flex-wrap items-baseline gap-x-2 px-3.5 py-2 text-left hover:bg-sunken" onClick={() => pick(m)}>
                        <span className="text-base font-medium text-ink">{m.name}</span>
                        <span className="text-sm text-muted">{[m.icd10, m.specialty ? specialtyLabel(m.specialty) : ''].filter(Boolean).join(' · ')}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">{t('conditionDialog.noMatch')}</p>
              ))}
          </div>
        )}

        <Field label={t('conditionDialog.specialty')} hint={!ownSpecialty && icd10 ? t('conditionDialog.specialtyFromCode') : undefined}>
          <select
            className={selectClass}
            value={specialty}
            onChange={(e) => {
              setSpecialty(e.target.value as Specialty);
              setOwnSpecialty(true);
            }}
          >
            {[...SPECIALTIES].sort((a, b) => Number(a === 'primary') - Number(b === 'primary') || compareText(specialtyLabel(a), specialtyLabel(b))).map((s) => (
              <option key={s} value={s}>
                {specialtyLabel(s)}
              </option>
            ))}
          </select>
        </Field>

        <fieldset>
          <legend className="mb-1.5 block text-sm font-medium text-ink-soft">{t('conditionDialog.status')}</legend>
          <div className="flex flex-wrap gap-2">
            {CONDITION_STATUSES.map((s) => (
              <Chip key={s} active={status === s} onClick={() => setStatus(s)}>
                {conditionStatusLabel(s)}
              </Chip>
            ))}
          </div>
        </fieldset>
        {status === 'resolved' && <DateFields label={t('conditionDialog.resolved')} value={resolved} onChange={setResolved} invalid={resolvedValue === null} />}

        <details className="rounded-2xl border border-line p-4" open={more}>
          <summary className="cursor-pointer select-none text-sm font-medium text-ink-soft">{t('conditionDialog.more')}</summary>
          <div className="mt-3 space-y-4">
            <DateFields label={t('conditionDialog.diagnosed')} value={diagnosed} onChange={setDiagnosed} invalid={diagnosedValue === null} />
            <div className="grid gap-4 sm:grid-cols-2">
              {contactField(t('conditionDialog.diagnosedBy'), doctorId, setDoctorId, doctor, 'Doctor')}
              {contactField(t('conditionDialog.where'), clinicId, setClinicId, clinic, 'Specialist')}
            </div>
            {!clinicId && (
              <Field label={t('conditionDialog.place')}>
                <input className={inputClass} value={place} maxLength={CONDITION_LIMITS.place} onChange={(e) => setPlace(e.target.value)} placeholder={t('conditionDialog.placePlaceholder')} autoComplete="off" />
              </Field>
            )}

            <fieldset>
              <legend className="mb-1.5 block text-sm font-medium text-ink-soft">{t('conditionDialog.severity')}</legend>
              <div className="flex flex-wrap gap-2">
                <Chip active={severity === ''} onClick={() => setSeverity('')}>
                  {t('medDialog.notSet')}
                </Chip>
                {CONDITION_SEVERITIES.map((s) => (
                  <Chip key={s} active={severity === s} onClick={() => setSeverity(s)}>
                    {severityLabel(s)}
                  </Chip>
                ))}
              </div>
            </fieldset>

            {medChoices.length > 0 && (
              <fieldset>
                <legend className="mb-1.5 block text-sm font-medium text-ink-soft">{t('conditionDialog.meds')}</legend>
                <div className="space-y-1">
                  {medChoices.slice(0, CONDITION_LIMITS.medIds).map((m) => (
                    <Checkbox key={m.id} checked={medIds.includes(m.id)} onChange={() => setMedIds((l) => toggle(l, m.id))}>
                      {medLabel(m)}
                    </Checkbox>
                  ))}
                </div>
              </fieldset>
            )}

            {visitChoices.length > 0 && (
              <fieldset>
                <legend className="mb-1.5 block text-sm font-medium text-ink-soft">{t('conditionDialog.visits')}</legend>
                <div className="space-y-1">
                  {visitChoices.map((v) => (
                    <Checkbox key={v.id} checked={visitIds.includes(v.id)} onChange={() => setVisitIds((l) => toggle(l, v.id))}>
                      {t('conditionDialog.visitLine', { title: visitTitle(v), date: formatDayShort(v.at) })}
                    </Checkbox>
                  ))}
                </div>
              </fieldset>
            )}

            <Field label={t('form.notesOptional')} hint={t('conditionDialog.notesHint')}>
              <textarea className={`${inputClass} min-h-20`} value={notes} maxLength={CONDITION_LIMITS.notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </div>
        </details>
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}
