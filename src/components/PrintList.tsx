import { useState } from 'react';
import { Printer, Share2, X } from 'lucide-react';
import type { Contact } from '@huishouden/pwa-kit/contacts';
import { ghostButton, primaryButton, secondaryButton } from '@huishouden/pwa-kit/react/ui';
import { addDays, longDate, toYmd, ymdToTime } from '@huishouden/pwa-kit/time';
import type { Condition, Dose, Med, Person } from '../lib/model';
import { groupBySpecialty, partialDateWords, specialtyLabel, type SpecialtyGroup } from '@huishouden/pwa-kit/condition';
import { adherenceOf, doseText, isStopped, medLabel, scheduleText } from '../lib/meds';
import { ageOn } from '../lib/people';
import { roleLabel } from '../lib/contacts';
import { t, useT } from '../i18n';
import { compareText, numberFormat } from '@huishouden/pwa-kit/i18n';

/** How far back stopped medicines are listed for the doctor. */
const STOPPED_DAYS = 90;

export interface ListModel {
  person: Person;
  current: Med[];
  stopped: Med[];
  contacts: Contact[];
  adherence: number | null;
  /** Active and managed conditions by medical area: only those the reader may see (none for a helper carer). */
  conditions: SpecialtyGroup<Condition>[];
}

export function listModel(person: Person, meds: Med[], doses: Dose[], contacts: Contact[], now: number, conditions: readonly Condition[] = []): ListModel {
  const mine = meds.filter((m) => m.personId === person.id).sort((a, b) => Number(a.asNeeded) - Number(b.asNeeded) || compareText(medLabel(a), medLabel(b)));
  const since = addDays(toYmd(now), -STOPPED_DAYS);
  const current = mine.filter((m) => !isStopped(m, now));
  const stopped = mine.filter((m) => isStopped(m, now) && m.endDate! >= since);
  const used = new Set(mine.flatMap((m) => [m.prescriberId, m.pharmacyId]).filter(Boolean));
  const from = ymdToTime(addDays(toYmd(now), -29));
  let given = 0;
  let missed = 0;
  for (const m of current.filter((x) => !x.asNeeded)) {
    const a = adherenceOf(m, doses.filter((d) => d.personId === person.id), from, now, now);
    given += a.given;
    missed += a.missed;
  }
  const open = conditions.filter((c) => c.personId === person.id && c.status !== 'resolved');
  return { person, current, stopped, contacts: contacts.filter((c) => used.has(c.id)), adherence: given + missed ? Math.round((given / (given + missed)) * 100) : null, conditions: groupBySpecialty(open) };
}

const contactName = (contacts: Contact[], id?: string) => (id ? contacts.find((c) => c.id === id)?.name ?? '' : '');

/** "92%" ("92 %" in Dutch) from a whole percentage. */
const percent = (n: number) => numberFormat({ style: 'percent', maximumFractionDigits: 0 }).format(n / 100);

/** "Born March 8, 1944 (82)". */
const bornText = (p: Person, today: string) => {
  if (!p.birthDate) return '';
  const age = ageOn(p, today);
  return age !== null ? t('print.bornAge', { date: longDate(p.birthDate), age }) : t('print.born', { date: longDate(p.birthDate) });
};

/** "Dr. Hart (Doctor): (555) 010-2231". */
const contactLine = (c: Contact) => `${c.name}${c.role ? ` (${roleLabel(c.role)})` : ''}${c.phone ? `: ${c.phone}` : ''}`;

/** "Type 2 diabetes (since March 2019, managed)". */
export const conditionLine = (c: Condition) => {
  const bits = [c.diagnosed ? t('print.conditionSince', { date: partialDateWords(c.diagnosed) }) : '', c.status === 'managed' ? t('print.conditionManaged') : ''].filter(Boolean);
  return bits.length ? `${c.name} (${bits.join(', ')})` : c.name;
};

/** The list as plain text, for sharing by message or email. */
export function listText(l: ListModel, now: number): string {
  const today = toYmd(now);
  const lines = [
    t('print.title', { name: l.person.name }),
    [bornText(l.person, today), t('print.asOf', { date: longDate(today) })].filter(Boolean).join('. '),
    l.person.allergies ? t('today.allergies', { allergies: l.person.allergies }) : t('print.noAllergies'),
    ...(l.conditions.length ? ['', t('print.conditions'), ...l.conditions.map((g) => `${specialtyLabel(g.specialty)}: ${g.conditions.map(conditionLine).join('; ')}`)] : []),
    '',
    ...l.current.map((m) => {
      const what = [doseText(m), scheduleText(m)].filter(Boolean).join(', ');
      const by = m.prescriberId ? ` ${t('print.prescribedByLine', { name: contactName(l.contacts, m.prescriberId) })}` : '';
      const since = m.endDate ? t('print.sinceUntil', { since: longDate(m.startDate), until: longDate(m.endDate) }) : t('print.since', { date: longDate(m.startDate) });
      return `- ${medLabel(m)}: ${what}.${by} ${since}`;
    }),
  ];
  if (l.stopped.length) lines.push('', t('print.stoppedRecently'), ...l.stopped.map((m) => `- ${t('print.stoppedItem', { med: medLabel(m), date: longDate(m.endDate!) })}`));
  if (l.adherence !== null) lines.push('', t('print.adherenceText', { percent: percent(l.adherence) }));
  if (l.contacts.length) lines.push('', ...l.contacts.map(contactLine));
  return lines.join('\n');
}

/** A medication list to print or share for a doctor's visit: one page, plain, readable on paper. */
export function PrintList({ list, now, onClose }: { list: ListModel; now: number; onClose: () => void }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const today = toYmd(now);
  const { person } = list;
  const share = async () => {
    const text = listText(list, now);
    if (navigator.share) {
      await navigator.share({ title: t('print.title', { name: person.name }), text }).catch(() => {});
      return;
    }
    await navigator.clipboard?.writeText(text);
    setCopied(true);
  };
  const scheduled = list.current.filter((m) => !m.asNeeded);
  const asNeeded = list.current.filter((m) => m.asNeeded);
  // A table on paper and on wider screens; on a phone screen each medicine is a stacked block, so
  // nothing runs off the side.
  const table = (meds: Med[]) => (
    <table className="mt-2 w-full border-collapse text-left text-base phone:block">
      <thead className="phone:sr-only">
        <tr className="border-b-2 border-ink text-sm">
          <th className="py-1.5 pr-3 font-semibold">{t('history.medicine')}</th>
          <th className="py-1.5 pr-3 font-semibold">{t('print.dose')}</th>
          <th className="py-1.5 pr-3 font-semibold">{t('print.when')}</th>
          <th className="py-1.5 pr-3 font-semibold">{t('print.prescribedBy')}</th>
          <th className="py-1.5 font-semibold">{t('print.sinceHeader')}</th>
        </tr>
      </thead>
      <tbody className="phone:block phone:border-t-2 phone:border-ink">
        {meds.map((m) => {
          const by = contactName(list.contacts, m.prescriberId);
          return (
            <tr key={m.id} className="break-inside-avoid border-b border-line align-top phone:block phone:py-3">
              <td className="py-2 pr-3 font-medium phone:block phone:p-0 phone:text-lg">{medLabel(m)}</td>
              <td className="py-2 pr-3 phone:block phone:p-0">{doseText(m)}</td>
              <td className="py-2 pr-3 phone:block phone:p-0">
                {scheduleText(m)}
                {m.endDate ? `, ${t('print.until', { date: longDate(m.endDate, today) })}` : ''}
                {m.notes && <span className="block text-sm text-muted">{m.notes}</span>}
              </td>
              <td className={`py-2 pr-3 phone:p-0 ${by ? 'phone:block' : 'phone:hidden'}`}>
                <span className="hidden phone:inline">{t('print.prescribedBy')} </span>
                {by}
              </td>
              <td className="py-2 whitespace-nowrap phone:block phone:p-0 phone:whitespace-normal phone:text-muted">
                <span className="hidden phone:inline">{t('print.sinceHeader')} </span>
                {longDate(m.startDate, today)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
  return (
    <section
      aria-label={t('print.listFor', { name: person.name })}
      data-hh-print=""
      className="min-w-0 rounded-2xl border border-line bg-surface p-4 shadow-sm [overflow-wrap:break-word] sm:p-6 print:text-black"
    >
      <div className="mb-4 flex flex-wrap gap-2 print:hidden">
        <button type="button" className={primaryButton} onClick={() => window.print()}>
          <Printer size={18} /> {t('print.print')}
        </button>
        <button type="button" className={secondaryButton} onClick={() => void share()}>
          <Share2 size={18} /> {copied ? t('print.copied') : t('print.share')}
        </button>
        <button type="button" className={`${ghostButton} ml-auto`} onClick={onClose}>
          <X size={18} /> {t('common.close')}
        </button>
      </div>
      <h1 className="text-2xl font-semibold text-ink">{t('print.title', { name: person.name })}</h1>
      <p className="mt-1 text-base text-ink-soft">
        {[bornText(person, today), t('print.asOf', { date: longDate(today) })].filter(Boolean).join(' · ')}
      </p>
      <p className="mt-1 text-base font-medium text-ink">{person.allergies ? t('today.allergies', { allergies: person.allergies }) : t('print.noAllergies')}</p>
      {list.conditions.length > 0 && (
        <>
          <h2 className="mt-5 text-lg font-semibold text-ink">{t('print.conditions')}</h2>
          <dl className="mt-1 space-y-1 text-base">
            {list.conditions.map((g) => (
              <div key={g.specialty} className="break-inside-avoid sm:flex sm:gap-2">
                <dt className="font-medium sm:w-56 sm:shrink-0">{specialtyLabel(g.specialty)}</dt>
                <dd>{g.conditions.map(conditionLine).join('; ')}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
      {scheduled.length > 0 && (
        <>
          <h2 className="mt-5 text-lg font-semibold text-ink">{t('print.regular')}</h2>
          {table(scheduled)}
        </>
      )}
      {asNeeded.length > 0 && (
        <>
          <h2 className="mt-5 text-lg font-semibold text-ink">{t('today.whenNeeded')}</h2>
          {table(asNeeded)}
        </>
      )}
      {list.current.length === 0 && <p className="mt-4 text-base">{t('today.noMeds')}</p>}
      {list.stopped.length > 0 && (
        <>
          <h2 className="mt-5 text-lg font-semibold text-ink">{t('print.stoppedTitle')}</h2>
          <ul className="mt-1 list-disc pl-5 text-base">
            {list.stopped.map((m) => (
              <li key={m.id}>
                {t('print.stoppedItem', { med: medLabel(m), date: longDate(m.endDate!, today) })}
              </li>
            ))}
          </ul>
        </>
      )}
      {list.adherence !== null && <p className="mt-5 text-base text-ink-soft">{t('print.adherence', { percent: percent(list.adherence) })}</p>}
      {list.contacts.length > 0 && (
        <>
          <h2 className="mt-5 text-lg font-semibold text-ink">{t('print.doctors')}</h2>
          <ul className="mt-1 text-base">
            {list.contacts.map((c) => (
              <li key={c.id}>
                {c.name}
                {c.role ? ` (${roleLabel(c.role)})` : ''}
                {c.phone && (
                  <>
                    , <span className="whitespace-nowrap">{c.phone}</span>
                  </>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
