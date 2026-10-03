import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Chip, Dialog, Field, ghostButton, inputClass, primaryButton } from '@huishouden/pwa-kit/react/ui';
import { clockWords, fromLocalInput, toHhmm, toLocalInput } from '@huishouden/pwa-kit/time';
import { LIMITS, type DoseStatus, type Med } from '../lib/model';
import { medLabel } from '../lib/meds';

/**
 * Marking a dose with more than one tap: given at another time (late, or earlier and not ticked),
 * or skipped with a reason. With `warning` (a double dose), it asks before giving it again.
 */
export function DoseDialog({ med, personName, slotAt, now, warning, initial = 'given', onSave, onClose }: {
  med: Med;
  personName: string;
  slotAt?: number;
  now: number;
  /** Shown first: "Lisinopril 10 mg was already given 2 hours ago by Jo. Give it again?" */
  warning?: string | null;
  initial?: DoseStatus;
  onSave: (status: DoseStatus, at: number, note: string) => void;
  onClose: () => void;
}) {
  const [status, setStatus] = useState<DoseStatus>(initial);
  const [when, setWhen] = useState(toLocalInput(now));
  const [note, setNote] = useState('');
  const at = fromLocalInput(when);
  const valid = at !== null && at <= now + 60_000;
  return (
    <Dialog
      title={`${medLabel(med)} for ${personName}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className={ghostButton} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={primaryButton} disabled={!valid} onClick={() => (onSave(status, at!, note), onClose())}>
            {warning && status === 'given' ? 'Give it again' : status === 'given' ? 'Mark given' : 'Mark skipped'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {warning && (
          <p role="alert" className="flex gap-2 rounded-2xl border border-terracotta bg-terracotta-light/30 p-3 text-base text-stone-800">
            <AlertTriangle size={20} className="mt-0.5 shrink-0 text-terracotta" aria-hidden="true" />
            {warning}
          </p>
        )}
        {slotAt !== undefined && <p className="text-base text-stone-700">The {clockWords(toHhmm(slotAt))} dose.</p>}
        <div className="flex flex-wrap gap-2" role="group" aria-label="What happened">
          <Chip active={status === 'given'} onClick={() => setStatus('given')}>
            Given
          </Chip>
          <Chip active={status === 'skipped'} onClick={() => setStatus('skipped')}>
            Skipped
          </Chip>
        </div>
        <Field label={status === 'given' ? 'Given at' : 'Marked at'}>
          <input className={inputClass} type="datetime-local" value={when} max={toLocalInput(now)} onChange={(e) => setWhen(e.target.value)} />
        </Field>
        <Field label={status === 'skipped' ? 'Why (optional)' : 'Note (optional)'}>
          <input className={inputClass} value={note} maxLength={LIMITS.doseNote} onChange={(e) => setNote(e.target.value)} placeholder={status === 'skipped' ? 'Fasting for a blood test' : 'Took it with lunch'} autoComplete="off" />
        </Field>
      </div>
    </Dialog>
  );
}

/** Counting what is on hand, after a refill or now and then. */
export function CountDialog({ med, left, onSave, onClose }: { med: Med; left: number | null; onSave: (supply: number, refills?: number) => void; onClose: () => void }) {
  const [count, setCount] = useState(left !== null ? String(Math.round(left)) : '');
  const [refills, setRefills] = useState(med.refills !== undefined ? String(med.refills) : '');
  const n = Number(count.replace(',', '.'));
  const valid = count.trim() !== '' && Number.isFinite(n) && n >= 0;
  return (
    <Dialog
      title={`Count ${medLabel(med)}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className={ghostButton} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={primaryButton} disabled={!valid} onClick={() => (onSave(n, refills.trim() === '' ? undefined : Number(refills)), onClose())}>
            Save
          </button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={`On hand now${med.doseUnit ? ` (${med.doseUnit}s)` : ''}`}>
          <input className={inputClass} inputMode="decimal" value={count} onChange={(e) => setCount(e.target.value.slice(0, 6))} />
        </Field>
        <Field label="Refills left">
          <input className={inputClass} inputMode="numeric" value={refills} onChange={(e) => setRefills(e.target.value.replace(/\D/g, '').slice(0, 2))} />
        </Field>
      </div>
    </Dialog>
  );
}
