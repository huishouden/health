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

type Days = 'daily' | 'other' | 'some';
type Food = 'with' | 'empty' | 'either';

const ESCALATE_CHOICES = [0, 15, 30, 60, 120];

export function MedDialog({ med, person, contacts, now, onSave, onStop, onRestart, onDelete, onAddContact, onClose }: {
  med: Med | null;
  person: Person;
  contacts: Contact[];
  now: number;
  onSave: (input: MedInput) => void;
  onStop?: () => void;
  onRestart?: () => void;
  onDelete?: () => void;
  /** Opens the contact dialog for a new doctor or pharmacy. */
  onAddContact: (role: string) => void;
  onClose: () => void;
}) {
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
      filled.push({ label: 'Medicine', value: parsed.name });
    }
    if (parsed.strength) {
      setStrength(parsed.strength.slice(0, LIMITS.strength));
      filled.push({ label: 'Strength', value: parsed.strength });
    }
    if (parsed.dose) {
      setDose(parsed.dose.slice(0, LIMITS.dose));
      filled.push({ label: 'Dose', value: parsed.dose });
    }
    if (parsed.doseAmount !== undefined && parsed.doseUnit) {
      setDoseAmount(String(parsed.doseAmount));
      setDoseUnit(parsed.doseUnit);
    }
    if (parsed.asNeeded && !parsed.timesPerDay && !parsed.intervalHours) {
      setAsNeeded(true);
      if (parsed.intervalHours) setMinHours(String(parsed.intervalHours));
      filled.push({ label: 'When', value: 'When needed' });
    } else {
      const t = doseTimes(parsed);
      if (t.length) {
        setAsNeeded(false);
        setTimes(t.slice(0, MAX_TIMES));
        const every = everyDaysOf(parsed);
        setDays(every === 2 ? 'other' : 'daily');
        filled.push({ label: 'Times', value: `${every === 2 ? 'Every other day' : 'Every day'} at ${t.map(clockWords).join(', ')}` });
      }
    }
    if (parsed.withFood !== undefined) {
      setFood(parsed.withFood ? 'with' : 'empty');
      filled.push({ label: 'Food', value: parsed.withFood ? 'With food' : 'On an empty stomach' });
    }
    if (parsed.days) {
      const last = addDays(startDate, parsed.days - 1);
      setEndDate(last);
      filled.push({ label: 'Last day', value: `After ${parsed.days} days` });
    }
    const extra = [parsed.route && parsed.route !== 'by mouth' ? parsed.route.replace(/^./, (c) => c.toUpperCase()) : '', ...parsed.notes].filter(Boolean).join('. ');
    if (extra) {
      setNotes((n) => (n ? `${n}\n${extra}` : extra).slice(0, LIMITS.notes));
      filled.push({ label: 'Notes', value: extra });
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
    const list = [...contacts].sort((a, b) => Number(match.test(b.role ?? '')) - Number(match.test(a.role ?? '')) || a.name.localeCompare(b.name));
    return (
      <Field label={label}>
        <div className="flex gap-2">
          <select className={selectClass} value={value} onChange={(e) => set(e.target.value)}>
            <option value="">Not set</option>
            {list.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.role ? ` (${c.role})` : ''}
              </option>
            ))}
          </select>
          <button type="button" className={`${ghostButton} whitespace-nowrap`} onClick={() => onAddContact(role)}>
            New
          </button>
        </div>
      </Field>
    );
  };

  return (
    <Dialog
      wide
      title={med ? `Edit ${medLabel(med)}` : `Medicine for ${person.name}`}
      onClose={onClose}
      footer={
        <>
          {onDelete && (
            <button type="button" className={deleteButton} onClick={() => (onDelete(), onClose())}>
              <Trash2 size={18} /> Delete
            </button>
          )}
          {onStop && (
            <button type="button" className={ghostButton} onClick={() => (onStop(), onClose())}>
              <CircleStop size={18} /> Stop taking
            </button>
          )}
          {onRestart && (
            <button type="button" className={ghostButton} onClick={() => (onRestart(), onClose())}>
              <Play size={18} /> Taking it again
            </button>
          )}
          <button type="button" className={ghostButton} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={primaryButton} disabled={!valid} onClick={save}>
            Save
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
        {!med && <LabelScan onRead={fill} />}
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Medicine">
            <input className={inputClass} value={name} maxLength={LIMITS.medName} onChange={(e) => setName(e.target.value)} placeholder="Lisinopril" autoComplete="off" />
          </Field>
          <Field label="Strength">
            <input className={inputClass} value={strength} maxLength={LIMITS.strength} onChange={(e) => setStrength(e.target.value)} placeholder="10 mg" autoComplete="off" />
          </Field>
          <Field label="Dose">
            <input className={inputClass} value={dose} maxLength={LIMITS.dose} onChange={(e) => setDose(e.target.value)} placeholder="1 tablet" autoComplete="off" />
          </Field>
        </div>

        <fieldset>
          <legend className="mb-1.5 block text-sm font-medium text-ink-soft">When</legend>
          <div className="flex flex-wrap gap-2">
            <Chip active={!asNeeded} onClick={() => setAsNeeded(false)}>
              At set times
            </Chip>
            <Chip active={asNeeded} onClick={() => setAsNeeded(true)}>
              When needed
            </Chip>
          </div>
          {!asNeeded ? (
            <div className="mt-3 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                {times.map((t, i) => (
                  <span key={i} className="inline-flex items-center gap-1">
                    <input className={`${inputClass} max-w-36`} type="time" value={t} aria-label={`Dose ${i + 1} time`} onChange={(e) => setTimes((l) => l.map((x, j) => (j === i ? e.target.value : x)))} />
                    {times.length > 1 && (
                      <button type="button" className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-muted hover:bg-sunken" aria-label={`Remove dose ${i + 1} time`} onClick={() => setTimes((l) => l.filter((_, j) => j !== i))}>
                        <X size={18} />
                      </button>
                    )}
                  </span>
                ))}
                {times.length < MAX_TIMES && (
                  <button type="button" className={ghostButton} onClick={() => setTimes((l) => [...l, l.length ? addHours(l[l.length - 1], 6) : '08:00'])}>
                    Another time
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Which days">
                <Chip active={days === 'daily'} onClick={() => setDays('daily')}>
                  Every day
                </Chip>
                <Chip active={days === 'other'} onClick={() => setDays('other')}>
                  Every other day
                </Chip>
                <Chip active={days === 'some'} onClick={() => setDays('some')}>
                  Some days
                </Chip>
              </div>
              {days === 'some' && <RulePicker rule={rule} onChange={setRule} today={today} label="Which days" />}
            </div>
          ) : (
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <Field label="Hours between doses (optional)">
                <input className={inputClass} inputMode="decimal" value={minHours} onChange={(e) => setMinHours(e.target.value.slice(0, 4))} placeholder="4" />
              </Field>
              <Field label="Most in 24 hours (optional)">
                <input className={inputClass} inputMode="numeric" value={maxPerDay} onChange={(e) => setMaxPerDay(e.target.value.replace(/\D/g, '').slice(0, 2))} placeholder="4" />
              </Field>
            </div>
          )}
        </fieldset>

        <fieldset>
          <legend className="mb-1.5 block text-sm font-medium text-ink-soft">Food</legend>
          <div className="flex flex-wrap gap-2">
            <Chip active={food === 'with'} onClick={() => setFood('with')}>
              With food
            </Chip>
            <Chip active={food === 'empty'} onClick={() => setFood('empty')}>
              Empty stomach
            </Chip>
            <Chip active={food === 'either'} onClick={() => setFood('either')}>
              Either
            </Chip>
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First day">
            <input className={inputClass} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </Field>
          <Field label="Last day (optional)" hint="Leave empty for a medicine taken until a doctor says stop.">
            <input className={inputClass} type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {contactSelect('Prescribed by', 'Doctor', prescriberId, setPrescriberId, /doctor|physician|pediatric|specialist|dentist|gp/i)}
          {contactSelect('Pharmacy', 'Pharmacy', pharmacyId, setPharmacyId, /pharmac|chemist/i)}
        </div>

        <details className="rounded-2xl border border-line p-4" open={!!med?.supply || !!med?.refills}>
          <summary className="cursor-pointer select-none text-sm font-medium text-ink-soft">Supply and refills</summary>
          <p className="mt-2 text-sm text-muted">Count what is on hand to be told a week before it runs out. Each dose marked given counts down.</p>
          <div className="mt-3 grid gap-4 sm:grid-cols-4">
            <Field label="On hand now">
              <input className={inputClass} inputMode="decimal" value={supply} onChange={(e) => setSupply(e.target.value.slice(0, 6))} placeholder="30" />
            </Field>
            <Field label="Per dose">
              <input className={inputClass} inputMode="decimal" value={doseAmount} onChange={(e) => setDoseAmount(e.target.value.slice(0, 6))} placeholder="1" />
            </Field>
            <Field label="Unit">
              <input className={inputClass} value={doseUnit} maxLength={LIMITS.doseUnit} onChange={(e) => setDoseUnit(e.target.value)} placeholder="tablet" autoComplete="off" />
            </Field>
            <Field label="Refills left">
              <input className={inputClass} inputMode="numeric" value={refills} onChange={(e) => setRefills(e.target.value.replace(/\D/g, '').slice(0, 2))} placeholder="2" />
            </Field>
          </div>
        </details>

        {!asNeeded && (
          <div className="space-y-2">
            <Checkbox checked={remind} onChange={setRemind}>
              Notify at each dose time
            </Checkbox>
            <Field label="If a dose isn't marked" hint="The other people looking after them get a notification.">
              <select className={selectClass} value={escalate} onChange={(e) => setEscalate(Number(e.target.value))}>
                {ESCALATE_CHOICES.map((n) => (
                  <option key={n} value={n}>
                    {n === 0 ? "Don't tell anyone else" : `Tell the others after ${n < 60 ? `${n} minutes` : n === 60 ? 'an hour' : `${n / 60} hours`}`}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}

        <Field label="Notes (optional)">
          <textarea className={`${inputClass} min-h-20`} value={notes} maxLength={LIMITS.notes} onChange={(e) => setNotes(e.target.value)} placeholder="What it is for, how to give it" />
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
