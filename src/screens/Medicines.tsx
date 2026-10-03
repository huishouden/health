import { Pencil, Plus, Printer } from 'lucide-react';
import type { Contact } from '@huishouden/pwa-kit/contacts';
import { useClock } from '@huishouden/pwa-kit/react/clock';
import { cardClass, ghostButton, primaryButton, secondaryButton } from '@huishouden/pwa-kit/react/ui';
import { longDate, toYmd } from '@huishouden/pwa-kit/time';
import type { Med, Person } from '../lib/model';
import { daysLeft, daysLeftText, doseText, isCurrent, isStopped, medLabel, refillDue, scheduleText, supplyLeft } from '../lib/meds';
import { canEdit, canGive } from '../lib/people';
import type { HealthStore } from '../data/actions';
import { Avatar, PersonChips } from '../components/Avatar';

export interface MedicinesProps {
  store: HealthStore;
  people: Person[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  highlight?: string | null;
  onAdd: (personId: string) => void;
  onEdit: (m: Med) => void;
  onCount: (m: Med) => void;
  onOrdered: (m: Med) => void;
  onPrint: (personId: string) => void;
  empty: React.ReactNode;
}

const contactName = (contacts: Contact[], id?: string) => (id ? contacts.find((c) => c.id === id)?.name : undefined);

export function Medicines({ store, people, selected, onSelect, highlight, onAdd, onEdit, onCount, onOrdered, onPrint, empty }: MedicinesProps) {
  const { now } = useClock();
  if (people.length === 0) return <>{empty}</>;
  const shown = selected ? people.filter((p) => p.id === selected) : people;
  return (
    <div className="space-y-4">
      <PersonChips people={people} selected={selected} onSelect={onSelect} />
      {shown.map((p) => {
        const meds = store.data.meds.filter((m) => m.personId === p.id).sort((a, b) => medLabel(a).localeCompare(medLabel(b)));
        const current = meds.filter((m) => !isStopped(m, now));
        const stopped = meds.filter((m) => isStopped(m, now));
        const editable = canEdit(p, store.role, store.me);
        return (
          <section key={p.id} aria-label={`${p.name}'s medicines`} className={`${cardClass} p-5 sm:p-6`}>
            <div className="flex flex-wrap items-center gap-3">
              <Avatar person={p} people={people} size={44} />
              <h2 className="min-w-0 flex-1 text-xl font-semibold text-ink">{p.name}</h2>
              <button type="button" className={ghostButton} onClick={() => onPrint(p.id)}>
                <Printer size={18} /> List for the doctor
              </button>
              {editable && (
                <button type="button" className={primaryButton} onClick={() => onAdd(p.id)}>
                  <Plus size={18} /> Add medicine
                </button>
              )}
            </div>
            {p.allergies && <p className="mt-2 text-base text-ink-soft">Allergies: {p.allergies}</p>}
            {current.length === 0 ? (
              <p className="mt-3 text-base text-muted">No medicines yet.{editable ? ' Add one, or scan a pharmacy label to fill it in.' : ''}</p>
            ) : (
              <ul className="mt-3 divide-y divide-line">
                {current.map((m) => (
                  <MedRow key={m.id} med={m} store={store} person={p} highlight={highlight === m.id} onEdit={editable ? () => onEdit(m) : undefined} onCount={() => onCount(m)} onOrdered={() => onOrdered(m)} />
                ))}
              </ul>
            )}
            {stopped.length > 0 && (
              <details className="mt-3">
                <summary className="cursor-pointer select-none py-2 text-sm font-medium text-muted">Stopped ({stopped.length})</summary>
                <ul className="divide-y divide-line">
                  {stopped.map((m) => (
                    <li key={m.id} className="flex items-center gap-3 py-2">
                      <span className="min-w-0 flex-1 text-base text-ink-soft">
                        {medLabel(m)} <span className="text-sm text-muted">stopped {longDate(m.endDate!, toYmd(now))}</span>
                      </span>
                      {editable && (
                        <button type="button" className={ghostButton} onClick={() => onEdit(m)}>
                          Edit
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </section>
        );
      })}
    </div>
  );
}

function MedRow({ med: m, store, person, highlight, onEdit, onCount, onOrdered }: { med: Med; store: HealthStore; person: Person; highlight: boolean; onEdit?: () => void; onCount: () => void; onOrdered: () => void }) {
  const { now } = useClock();
  const { doses, contacts } = store.data;
  const left = supplyLeft(m, doses);
  const days = daysLeft(m, doses, now);
  const due = refillDue(m, doses, now);
  const ordered = m.refillOrderedAt && m.refillOrderedAt >= (m.supplyAt ?? m.createdAt);
  const may = canGive(person, store.role, store.me);
  const upcoming = !isCurrent(m, toYmd(now)) && m.startDate > toYmd(now);
  const who = [contactName(contacts, m.prescriberId), contactName(contacts, m.pharmacyId)].filter(Boolean).join(' · ');
  return (
    <li className={`py-3 ${highlight ? 'rounded-xl bg-tint px-3' : ''}`}>
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-40 flex-1">
          <p className="text-lg font-medium text-ink">{medLabel(m)}</p>
          <p className="text-base text-ink-soft">{[doseText(m), scheduleText(m)].filter(Boolean).join(' · ')}</p>
          <p className="text-sm text-muted">
            {[upcoming ? `Starts ${longDate(m.startDate, toYmd(now))}` : '', m.endDate ? `Until ${longDate(m.endDate, toYmd(now))}` : '', who].filter(Boolean).join(' · ')}
          </p>
          {m.notes && <p className="mt-1 text-sm text-muted">{m.notes}</p>}
          {(left !== null || m.refills !== undefined) && (
            <p className={`mt-1 text-sm ${due ? 'font-medium text-attention' : 'text-muted'}`}>
              {[
                left !== null ? `${Math.round(left)}${m.doseUnit ? ` ${m.doseUnit}${Math.round(left) === 1 || m.doseUnit === 'ml' ? '' : 's'}` : ''} left` : '',
                days !== null ? daysLeftText(days).toLowerCase() : '',
                m.refills !== undefined ? `${m.refills} ${m.refills === 1 ? 'refill' : 'refills'}` : '',
                ordered ? 'refill ordered' : '',
              ]
                .filter(Boolean)
                .join(', ')
                .replace(/^./, (c) => c.toUpperCase())}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {due && may && (
            <button type="button" className={secondaryButton} onClick={onOrdered}>
              Refill ordered
            </button>
          )}
          {may && left !== null && (
            <button type="button" className={ghostButton} onClick={onCount}>
              Count
            </button>
          )}
          {onEdit && (
            <button type="button" className={ghostButton} aria-label={`Edit ${medLabel(m)}`} onClick={onEdit}>
              <Pencil size={18} /> Edit
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

