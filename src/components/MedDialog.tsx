import { useState } from 'react';
import { CircleStop, Play, Trash2, X } from 'lucide-react';
import type { Contact } from '@huishouden/pwa-kit/contacts';
import { doseTimes, everyDaysOf, type ParsedCourse } from '@huishouden/pwa-kit/dose';
import { LabelScan, type LabelFill } from '@huishouden/pwa-kit/react/dose';
import { RulePicker } from '@huishouden/pwa-kit/react/schedule';
import { Checkbox, Chip, deleteButton, Dialog, Field, ghostButton, inputClass, primaryButton, selectClass } from '@huishouden/pwa-kit/react/ui';
import type { EventRule } from '@huishouden/pwa-kit/schedule';
import { addDays, clockWords, isHhmm, isYmd, toYmd } from '@huishouden/pwa-kit/time';
import { DEFAULT_ESCALATE_MINUTES, LIMITS, MAX_TIMES, type Med, type Person } from '../lib/model';
import type { MedInput } from '../lib/build';
import { medLabel } from '../lib/meds';
import { useT } from '../i18n';
import { compareText, formatList } from '@huishouden/pwa-kit/i18n';
import { DOCTOR_WORDS, PHARMACY_WORDS, roleLabel } from '../lib/contacts';

type Days = 'daily' | 'other' | 'some';
type Food = 'with' | 'empty' | 'either';

const ESCALATE_CHOICES = [0, 15, 30, 60, 120];

export function MedDialog({ med, person, contacts, now, images, onSave, onStop, onRestart, onDelete, onAddContact, onClose }: {
  med: Med | null;
  person: Person;
  contacts: Contact[];
  now: number;
  /** Label photos shared into the app, read as soon as the dialog opens. */
  images?: File[];
  onSave: (input: MedInput) => void;
  onStop?: () => void;
  onRestart?: () => void;
  onDelete?: () => void;
  /** Opens the contact dialog for a new doctor or pharmacy. */
  onAddContact: (role: string) => void;
  onClose: () => void;
}) {
  const t = useT();
  const today = toYmd(now);
  const [name, setName] = useState(med?.name ?? '');
  const [strength, setStrength] = useState(med?.strength ?? '');
  const [dose, setDose] = useState(med?.dose ?? '');
  const [asNeeded, setAsNeeded] = useState(med?.asNeeded ?? false);
  const [times, setTimes] = useState<string[]>(med?.times.length ? med.times : ['08:00']);
  const [days, setDays] = useState<Days>(med?.rule ? 'some' : (med?.everyDays ?? 1) === 2 ? 'other' : 'daily');
  const [rule, setRule] = useState<EventRule>(med?.rule ?? { freq: 'week', every: 1, start: med?.startDate ?? today });
  const [minHours, setMinHours] = useState(med?.minHours ? String(med.minHours) : '');
  const [maxPerDay, setMaxPerDay] = useState(med?.maxPerDay ? String(med.maxPerDay) : '');
  const [food, setFood] = useState<Food>(med?.withFood === true ? 'with' : med?.withFood === false ? 'empty' : 'either');
  const [startDate, setStartDate] = useState(med?.startDate ?? today);
  const [endDate, setEndDate] = useState(med?.endDate ?? '');
  const [prescriberId, setPrescriberId] = useState(med?.prescriberId ?? '');
  const [pharmacyId, setPharmacyId] = useState(med?.pharmacyId ?? '');
  const [supply, setSupply] = useState(med?.supply !== undefined ? String(med.supply) : '');
  const [doseAmount, setDoseAmount] = useState(med?.doseAmount !== undefined ? String(med.doseAmount) : '');
  const [doseUnit, setDoseUnit] = useState(med?.doseUnit ?? '');
  const [refills, setRefills] = useState(med?.refills !== undefined ? String(med.refills) : '');
  const [remind, setRemind] = useState(med?.remind ?? true);
  const [escalate, setEscalate] = useState(med?.escalateMinutes ?? DEFAULT_ESCALATE_MINUTES);
  const [notes, setNotes] = useState(med?.notes ?? '');

  const num = (s: string) => (s.trim() === '' ? undefined : Number(s.replace(',', '.')));
  const validNums = [supply, doseAmount, refills, minHours, maxPerDay].every((s) => s.trim() === '' || Number.isFinite(num(s)));
  const valid = name.trim().length > 0 && isYmd(startDate) && (!endDate || (isYmd(endDate) && endDate >= startDate)) && (asNeeded || (times.length > 0 && times.every(isHhmm))) && validNums;

  const fill = (parsed: ParsedCourse): LabelFill[] => {
    const filled: LabelFill[] = [];
    if (parsed.name) {
      setName(parsed.name.slice(0, LIMITS.medName));
      filled.push({ label: t('history.medicine'), value: parsed.name });
    }
    if (parsed.strength) {
      setStrength(parsed.strength.slice(0, LIMITS.strength));
      filled.push({ label: t('medDialog.strength'), value: parsed.strength });
    }
    if (parsed.dose) {
      setDose(parsed.dose.slice(0, LIMITS.dose));
      filled.push({ label: t('print.dose'), value: parsed.dose });
    }
    if (parsed.doseAmount !== undefined && parsed.doseUnit) {
      setDoseAmount(String(parsed.doseAmount));
      setDoseUnit(parsed.doseUnit);
    }
    if (parsed.asNeeded && !parsed.timesPerDay && !parsed.intervalHours) {
      setAsNeeded(true);
      if (parsed.intervalHours) setMinHours(String(parsed.intervalHours));
      filled.push({ label: t('print.when'), value: t('today.whenNeeded') });
    } else {
      const found = doseTimes(parsed);
      if (found.length) {
        setAsNeeded(false);
        setTimes(found.slice(0, MAX_TIMES));
        const every = everyDaysOf(parsed);
        setDays(every === 2 ? 'other' : 'daily');
        const words = found.map((x) => clockWords(x));
        filled.push({ label: t('medDialog.times'), value: t('meds.daysAtTimes', { days: t('meds.everyDays', { count: every === 2 ? 2 : 1 }), times: formatList(words), one: /^1(?!\d)/.test(words[0]) ? 'yes' : 'no' }) });
      }
    }
    if (parsed.withFood !== undefined) {
      setFood(parsed.withFood ? 'with' : 'empty');
      filled.push({ label: t('medDialog.food'), value: parsed.withFood ? t('medDialog.withFood') : t('medDialog.emptyStomachLong') });
    }
    if (parsed.days) {
      const last = addDays(startDate, parsed.days - 1);
      setEndDate(last);
      filled.push({ label: t('medDialog.lastDay'), value: t('medDialog.afterDays', { count: parsed.days }) });
    }
    const extra = [parsed.route && parsed.route !== 'by mouth' ? parsed.route.replace(/^./, (c) => c.toUpperCase()) : '', ...parsed.notes].filter(Boolean).join('. ');
    if (extra) {
      setNotes((n) => (n ? `${n}\n${extra}` : extra).slice(0, LIMITS.notes));
      filled.push({ label: t('common.notes'), value: extra });
    }
    return filled;
  };

  const save = () => {
    if (!valid) return;
    const supplyNum = num(supply);
    const keepCount = med?.supply === supplyNum && med?.supplyAt !== undefined;
    onSave({
      personId: person.id,
      name,
      strength,
      dose,
      doseAmount: num(doseAmount),
      doseUnit,
      asNeeded,
      times: asNeeded ? [] : times,
      ...(asNeeded ? {} : days === 'some' ? { rule: { ...rule, start: rule.start < startDate ? startDate : rule.start } } : { everyDays: days === 'other' ? 2 : 1 }),
      minHours: num(minHours),
      maxPerDay: num(maxPerDay),
      ...(food === 'either' ? {} : { withFood: food === 'with' }),
      startDate,
      endDate: endDate || undefined,
      prescriberId: prescriberId || undefined,
      pharmacyId: pharmacyId || undefined,
      refills: num(refills),
      supply: supplyNum,
      supplyAt: supplyNum === undefined ? undefined : keepCount ? med!.supplyAt : now,
      escalateMinutes: asNeeded ? 0 : escalate,
      remind: asNeeded ? false : remind,
      notes,
    });
    onClose();
  };

  const contactSelect = (label: string, role: string, value: string, set: (v: string) => void, match: RegExp) => {
    const list = [...contacts].sort((a, b) => Number(match.test(b.role ?? '')) - Number(match.test(a.role ?? '')) || compareText(a.name, b.name));
    return (
      <Field label={label}>
        <div className="flex gap-2">
          <select className={selectClass} value={value} onChange={(e) => set(e.target.value)}>
            <option value="">{t('medDialog.notSet')}</option>
            {list.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.role ? ` (${roleLabel(c.role)})` : ''}
              </option>
            ))}
          </select>
          <button type="button" className={`${ghostButton} whitespace-nowrap`} onClick={() => onAddContact(role)}>
            {t('medDialog.new')}
          </button>
        </div>
      </Field>
    );
  };

  return (
    <Dialog
      wide
      title={med ? t('a11y.edit', { name: medLabel(med) }) : t('publish.medicineFor', { name: person.name })}
      onClose={onClose}
      footer={
        <>
          {onDelete && (
            <button type="button" className={deleteButton} onClick={() => (onDelete(), onClose())}>
              <Trash2 size={18} /> {t('common.delete')}
            </button>
          )}
          {onStop && (
            <button type="button" className={ghostButton} onClick={() => (onStop(), onClose())}>
              <CircleStop size={18} /> {t('medDialog.stop')}
            </button>
          )}
          {onRestart && (
            <button type="button" className={ghostButton} onClick={() => (onRestart(), onClose())}>
              <Play size={18} /> {t('medDialog.restart')}
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
        {!med && <LabelScan onRead={fill} images={images} />}
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t('history.medicine')}>
            <input className={inputClass} value={name} maxLength={LIMITS.medName} onChange={(e) => setName(e.target.value)} placeholder="Lisinopril" autoComplete="off" /* i18n-ignore: a medicine name */ />
          </Field>
          <Field label={t('medDialog.strength')}>
            <input className={inputClass} value={strength} maxLength={LIMITS.strength} onChange={(e) => setStrength(e.target.value)} placeholder="10 mg" autoComplete="off" /* i18n-ignore: a strength */ />
          </Field>
          <Field label={t('print.dose')}>
            <input className={inputClass} value={dose} maxLength={LIMITS.dose} onChange={(e) => setDose(e.target.value)} placeholder={t('medDialog.dosePlaceholder')} autoComplete="off" />
          </Field>
        </div>

        <fieldset>
          <legend className="mb-1.5 block text-sm font-medium text-ink-soft">{t('print.when')}</legend>
          <div className="flex flex-wrap gap-2">
            <Chip active={!asNeeded} onClick={() => setAsNeeded(false)}>
              {t('medDialog.setTimes')}
            </Chip>
            <Chip active={asNeeded} onClick={() => setAsNeeded(true)}>
              {t('today.whenNeeded')}
            </Chip>
          </div>
          {!asNeeded ? (
            <div className="mt-3 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                {times.map((time, i) => (
                  <span key={i} className="inline-flex items-center gap-1">
                    <input className={`${inputClass} max-w-36`} type="time" value={time} aria-label={t('medDialog.doseTime', { n: i + 1 })} onChange={(e) => setTimes((l) => l.map((x, j) => (j === i ? e.target.value : x)))} />
                    {times.length > 1 && (
                      <button type="button" className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-muted hover:bg-sunken" aria-label={t('medDialog.removeTime', { n: i + 1 })} onClick={() => setTimes((l) => l.filter((_, j) => j !== i))}>
                        <X size={18} />
                      </button>
                    )}
                  </span>
                ))}
                {times.length < MAX_TIMES && (
                  <button type="button" className={ghostButton} onClick={() => setTimes((l) => [...l, l.length ? addHours(l[l.length - 1], 6) : '08:00'])}>
                    {t('medDialog.anotherTime')}
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-2" role="group" aria-label={t('medDialog.whichDays')}>
                <Chip active={days === 'daily'} onClick={() => setDays('daily')}>
                  {t('meds.everyDays', { count: 1 })}
                </Chip>
                <Chip active={days === 'other'} onClick={() => setDays('other')}>
                  {t('meds.everyDays', { count: 2 })}
                </Chip>
                <Chip active={days === 'some'} onClick={() => setDays('some')}>
                  {t('medDialog.someDays')}
                </Chip>
              </div>
              {days === 'some' && <RulePicker rule={rule} onChange={setRule} today={today} label={t('medDialog.whichDays')} />}
            </div>
          ) : (
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <Field label={t('medDialog.minHours')}>
                <input className={inputClass} inputMode="decimal" value={minHours} onChange={(e) => setMinHours(e.target.value.slice(0, 4))} placeholder="4" />
              </Field>
              <Field label={t('medDialog.maxPerDay')}>
                <input className={inputClass} inputMode="numeric" value={maxPerDay} onChange={(e) => setMaxPerDay(e.target.value.replace(/\D/g, '').slice(0, 2))} placeholder="4" />
              </Field>
            </div>
          )}
        </fieldset>

        <fieldset>
          <legend className="mb-1.5 block text-sm font-medium text-ink-soft">{t('medDialog.food')}</legend>
          <div className="flex flex-wrap gap-2">
            <Chip active={food === 'with'} onClick={() => setFood('with')}>
              {t('medDialog.withFood')}
            </Chip>
            <Chip active={food === 'empty'} onClick={() => setFood('empty')}>
              {t('medDialog.emptyStomach')}
            </Chip>
            <Chip active={food === 'either'} onClick={() => setFood('either')}>
              {t('medDialog.either')}
            </Chip>
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('medDialog.firstDay')}>
            <input className={inputClass} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </Field>
          <Field label={t('medDialog.lastDayOptional')} hint={t('medDialog.lastDayHint')}>
            <input className={inputClass} type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {contactSelect(t('print.prescribedBy'), 'Doctor', prescriberId, setPrescriberId, DOCTOR_WORDS)}
          {contactSelect(t('role.pharmacy'), 'Pharmacy', pharmacyId, setPharmacyId, PHARMACY_WORDS)}
        </div>

        <details className="rounded-2xl border border-line p-4" open={!!med?.supply || !!med?.refills}>
          <summary className="cursor-pointer select-none text-sm font-medium text-ink-soft">{t('medDialog.supply')}</summary>
          <p className="mt-2 text-sm text-muted">{t('medDialog.supplyHint')}</p>
          <div className="mt-3 grid gap-4 sm:grid-cols-4">
            <Field label={t('countDialog.onHand')}>
              <input className={inputClass} inputMode="decimal" value={supply} onChange={(e) => setSupply(e.target.value.slice(0, 6))} placeholder="30" />
            </Field>
            <Field label={t('medDialog.perDose')}>
              <input className={inputClass} inputMode="decimal" value={doseAmount} onChange={(e) => setDoseAmount(e.target.value.slice(0, 6))} placeholder="1" />
            </Field>
            <Field label={t('medDialog.unit')}>
              <input className={inputClass} value={doseUnit} maxLength={LIMITS.doseUnit} onChange={(e) => setDoseUnit(e.target.value)} placeholder={t('medDialog.unitPlaceholder')} autoComplete="off" />
            </Field>
            <Field label={t('countDialog.refills')}>
              <input className={inputClass} inputMode="numeric" value={refills} onChange={(e) => setRefills(e.target.value.replace(/\D/g, '').slice(0, 2))} placeholder="2" />
            </Field>
          </div>
        </details>

        {!asNeeded && (
          <div className="space-y-2">
            <Checkbox checked={remind} onChange={setRemind}>
              {t('medDialog.notify')}
            </Checkbox>
            <Field label={t('medDialog.escalate')} hint={t('medDialog.escalateHint')}>
              <select className={selectClass} value={escalate} onChange={(e) => setEscalate(Number(e.target.value))}>
                {ESCALATE_CHOICES.map((n) => (
                  <option key={n} value={n}>
                    {n === 0 ? t('medDialog.noOne') : n < 60 ? t('medDialog.afterMinutes', { count: n }) : t('medDialog.afterHours', { count: n / 60 })}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}

        <Field label={t('form.notesOptional')}>
          <textarea className={`${inputClass} min-h-20`} value={notes} maxLength={LIMITS.notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('medDialog.notesPlaceholder')} />
        </Field>
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}

function addHours(hhmm: string, hours: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const total = (((h + hours) % 24) + 24) % 24;
  return `${String(total).padStart(2, '0')}:${String(m || 0).padStart(2, '0')}`;
}
