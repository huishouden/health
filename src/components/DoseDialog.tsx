import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Chip, Dialog, Field, ghostButton, inputClass, primaryButton } from '@huishouden/pwa-kit/react/ui';
import { clockWords, fromLocalInput, toHhmm, toLocalInput } from '@huishouden/pwa-kit/time';
import { LIMITS, type DoseStatus, type Med } from '../lib/model';
import { medLabel } from '../lib/meds';
import { useT } from '../i18n';
import { unitWords } from '../screens/Medicines';

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
  const t = useT();
  const [status, setStatus] = useState<DoseStatus>(initial);
  const [when, setWhen] = useState(toLocalInput(now));
  const [note, setNote] = useState('');
  const at = fromLocalInput(when);
  const valid = at !== null && at <= now + 60_000;
  return (
    <Dialog
      title={t('doseDialog.title', { med: medLabel(med), name: personName })}
      onClose={onClose}
      footer={
        <>
          <button type="button" className={ghostButton} onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="button" className={primaryButton} disabled={!valid} onClick={() => (onSave(status, at!, note), onClose())}>
            {warning && status === 'given' ? t('doseDialog.giveAgain') : status === 'given' ? t('doseDialog.markGiven') : t('doseDialog.markSkipped')}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {warning && (
          <p role="alert" className="flex gap-2 rounded-2xl border border-terracotta bg-attention-tint/30 p-3 text-base text-ink">
            <AlertTriangle size={20} className="mt-0.5 shrink-0 text-terracotta" aria-hidden="true" />
            {warning}
          </p>
        )}
        {slotAt !== undefined && <p className="text-base text-ink-soft">{t('doseDialog.slot', { time: clockWords(toHhmm(slotAt)) })}</p>}
        <div className="flex flex-wrap gap-2" role="group" aria-label={t('doseDialog.whatHappened')}>
          <Chip active={status === 'given'} onClick={() => setStatus('given')}>
            {t('dose.given')}
          </Chip>
          <Chip active={status === 'skipped'} onClick={() => setStatus('skipped')}>
            {t('dose.skipped')}
          </Chip>
        </div>
        <Field label={status === 'given' ? t('doseDialog.givenAt') : t('doseDialog.markedAt')}>
          <input className={inputClass} type="datetime-local" value={when} max={toLocalInput(now)} onChange={(e) => setWhen(e.target.value)} />
        </Field>
        <Field label={status === 'skipped' ? t('doseDialog.why') : t('doseDialog.note')}>
          <input className={inputClass} value={note} maxLength={LIMITS.doseNote} onChange={(e) => setNote(e.target.value)} placeholder={status === 'skipped' ? t('doseDialog.whyPlaceholder') : t('doseDialog.notePlaceholder')} autoComplete="off" />
        </Field>
      </div>
    </Dialog>
  );
}

/** Counting what is on hand, after a refill or now and then. */
export function CountDialog({ med, left, onSave, onClose }: { med: Med; left: number | null; onSave: (supply: number, refills?: number) => void; onClose: () => void }) {
  const t = useT();
  const [count, setCount] = useState(left !== null ? String(Math.round(left)) : '');
  const [refills, setRefills] = useState(med.refills !== undefined ? String(med.refills) : '');
  const n = Number(count.replace(',', '.'));
  const valid = count.trim() !== '' && Number.isFinite(n) && n >= 0;
  return (
    <Dialog
      title={t('countDialog.title', { med: medLabel(med) })}
      onClose={onClose}
      footer={
        <>
          <button type="button" className={ghostButton} onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="button" className={primaryButton} disabled={!valid} onClick={() => (onSave(n, refills.trim() === '' ? undefined : Number(refills)), onClose())}>
            {t('common.save')}
          </button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={med.doseUnit ? t('countDialog.onHandUnit', { unit: unitWords(med.doseUnit, 2) }) : t('countDialog.onHand')}>
          <input className={inputClass} inputMode="decimal" value={count} onChange={(e) => setCount(e.target.value.slice(0, 6))} />
        </Field>
        <Field label={t('countDialog.refills')}>
          <input className={inputClass} inputMode="numeric" value={refills} onChange={(e) => setRefills(e.target.value.replace(/\D/g, '').slice(0, 2))} />
        </Field>
      </div>
    </Dialog>
  );
}
