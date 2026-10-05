import { Pencil, Plus, Printer } from 'lucide-react';
import type { Contact } from '@huishouden/pwa-kit/contacts';
import { useClock } from '@huishouden/pwa-kit/react/clock';
import { useHome } from '@huishouden/pwa-kit/react/home';
import type { HouseholdHome } from '@huishouden/pwa-kit/home';
import { cardClass, ghostButton, primaryButton, secondaryButton } from '@huishouden/pwa-kit/react/ui';
import { longDate, toYmd } from '@huishouden/pwa-kit/time';
import type { Med, Person } from '../lib/model';
import { daysLeft, daysLeftText, doseEntries, doseText, isCurrent, isStopped, medLabel, refillDue, scheduleText, supplyLeft } from '../lib/meds';
import { AddToCalendar } from '@huishouden/pwa-kit/react/calendar';
import { appUrl } from '@huishouden/pwa-kit/site';
import { canEdit, canGive } from '../lib/people';
import type { HealthStore } from '../data/actions';
import { Avatar, PersonChips } from '../components/Avatar';
import { useT } from '../i18n';
import { nameFromHome } from '../lib/contacts';
import { conditionsByMed } from '../lib/conditions';
import type { Condition } from '../lib/model';
import { capitalize, compareText, formatList, getLang } from '@huishouden/pwa-kit/i18n';

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

/** The pharmacy with how far it is from home, where both are known: where the refill is picked up. */
const pharmacyName = (contacts: Contact[], id: string | undefined, home: HouseholdHome | undefined) => {
  const c = id ? contacts.find((x) => x.id === id) : undefined;
  return c ? nameFromHome(c, { home }) : undefined;
};

/** The unit the household typed ("tablet"), with an English plural only in English: it is their word, not ours. */
export const unitWords = (unit: string, n: number) => (getLang() === 'en' && n !== 1 && unit !== 'ml' ? `${unit}s` : unit);

export function Medicines({ store, people, selected, onSelect, highlight, onAdd, onEdit, onCount, onOrdered, onPrint, empty }: MedicinesProps) {
  const t = useT();
  const { now } = useClock();
  if (people.length === 0) return <>{empty}</>;
  const shown = selected ? people.filter((p) => p.id === selected) : people;
  // Only conditions this member may read are in the data (never a helper carer's).
  const treats = conditionsByMed(store.data.conditions);
  return (
    <div className="space-y-4">
      <PersonChips people={people} selected={selected} onSelect={onSelect} />
      {shown.map((p) => {
        const meds = store.data.meds.filter((m) => m.personId === p.id).sort((a, b) => compareText(medLabel(a), medLabel(b)));
        const current = meds.filter((m) => !isStopped(m, now));
        const stopped = meds.filter((m) => isStopped(m, now));
        const editable = canEdit(p, store.role, store.me);
        return (
          <section key={p.id} aria-label={t('medicines.of', { name: p.name })} className={`${cardClass} p-5 sm:p-6`}>
            <div className="flex flex-wrap items-center gap-3">
              <Avatar person={p} people={people} size={44} />
              <h2 className="min-w-0 flex-1 basis-40 text-xl font-semibold text-ink">{p.name}</h2>
              <button type="button" className={ghostButton} onClick={() => onPrint(p.id)}>
                <Printer size={18} /> {t('medicines.printList')}
              </button>
              {editable && (
                <button type="button" className={primaryButton} onClick={() => onAdd(p.id)}>
                  <Plus size={18} /> {t('medicines.add')}
                </button>
              )}
            </div>
            {p.allergies && <p className="mt-2 text-base text-ink-soft">{t('today.allergies', { allergies: p.allergies })}</p>}
            {current.length === 0 ? (
              <p className="mt-3 text-base text-muted">{editable ? t('medicines.emptyEditable') : t('medicines.empty')}</p>
            ) : (
              <ul className="mt-3 divide-y divide-line">
                {current.map((m) => (
                  <MedRow key={m.id} med={m} store={store} person={p} treats={treats.get(m.id) ?? []} highlight={highlight === m.id} onEdit={editable ? () => onEdit(m) : undefined} onCount={() => onCount(m)} onOrdered={() => onOrdered(m)} />
                ))}
              </ul>
            )}
            {stopped.length > 0 && (
              <details className="mt-3">
                <summary className="cursor-pointer select-none py-2 text-sm font-medium text-muted">{t('medicines.stoppedCount', { count: stopped.length })}</summary>
                <ul className="divide-y divide-line">
                  {stopped.map((m) => (
                    <li key={m.id} className="flex items-center gap-3 py-2">
                      <span className="min-w-0 flex-1 text-base text-ink-soft">
                        {medLabel(m)} <span className="text-sm text-muted">{t('medicines.stoppedOn', { date: longDate(m.endDate!, toYmd(now)) })}</span>
                      </span>
                      {editable && (
                        <button type="button" className={ghostButton} onClick={() => onEdit(m)}>
                          {t('common.edit')}
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

function MedRow({ med: m, store, person, treats, highlight, onEdit, onCount, onOrdered }: { med: Med; store: HealthStore; person: Person; treats: Condition[]; highlight: boolean; onEdit?: () => void; onCount: () => void; onOrdered: () => void }) {
  const t = useT();
  const { now } = useClock();
  const home = useHome();
  const { doses, contacts } = store.data;
  const left = supplyLeft(m, doses);
  const days = daysLeft(m, doses, now);
  const due = refillDue(m, doses, now);
  const ordered = m.refillOrderedAt && m.refillOrderedAt >= (m.supplyAt ?? m.createdAt);
  const may = canGive(person, store.role, store.me);
  const upcoming = !isCurrent(m, toYmd(now)) && m.startDate > toYmd(now);
  const who = [contactName(contacts, m.prescriberId), pharmacyName(contacts, m.pharmacyId, home)].filter(Boolean).join(' · ');
  return (
    <li className={`py-3 ${highlight ? 'rounded-xl bg-tint px-3' : ''}`}>
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-40 flex-1">
          <p className="text-lg font-medium text-ink">{medLabel(m)}</p>
          {treats.length > 0 && <p className="text-base text-link">{t('medicines.forCondition', { conditions: formatList(treats.map((c) => c.name)) })}</p>}
          <p className="text-base text-ink-soft">{[doseText(m), scheduleText(m)].filter(Boolean).join(' · ')}</p>
          <p className="text-sm text-muted">
            {[upcoming ? t('medicines.starts', { date: longDate(m.startDate, toYmd(now)) }) : '', m.endDate ? t('medicines.until', { date: longDate(m.endDate, toYmd(now)) }) : '', who].filter(Boolean).join(' · ')}
          </p>
          {m.notes && <p className="mt-1 text-sm text-muted">{m.notes}</p>}
          {(left !== null || m.refills !== undefined) && (
            <p className={`mt-1 text-sm ${due ? 'font-medium text-attention' : 'text-muted'}`}>
              {capitalize(
                [
                  left !== null ? (m.doseUnit ? t('medicines.unitsLeft', { count: Math.round(left), unit: unitWords(m.doseUnit, Math.round(left)) }) : t('medicines.left', { count: Math.round(left) })) : '',
                  days !== null ? daysLeftText(days).toLowerCase() : '',
                  m.refills !== undefined ? t('medicines.refills', { count: m.refills }) : '',
                  ordered ? t('medicines.refillOrderedLower') : '',
                ]
                  .filter(Boolean)
                  .join(', '),
              )}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {/* Into the person's own calendar, from their own device: one repeating event per dose time. */}
          {doseEntries(m, appUrl(import.meta.env.BASE_URL, `?tab=medicines&person=${encodeURIComponent(person.id)}`)).map((entry) => (
            <AddToCalendar key={entry.series?.time} compact entry={entry} />
          ))}
          {due && may && (
            <button type="button" className={secondaryButton} onClick={onOrdered}>
              {t('medicines.refillOrdered')}
            </button>
          )}
          {may && left !== null && (
            <button type="button" className={ghostButton} onClick={onCount}>
              {t('medicines.count')}
            </button>
          )}
          {onEdit && (
            <button type="button" className={ghostButton} aria-label={t('a11y.edit', { name: medLabel(m) })} onClick={onEdit}>
              <Pencil size={18} /> {t('common.edit')}
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

