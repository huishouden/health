import { useState } from 'react';
import { Printer, Share2, X } from 'lucide-react';
import type { Contact } from '@huishouden/pwa-kit/contacts';
import { ghostButton, primaryButton, secondaryButton } from '@huishouden/pwa-kit/react/ui';
import { addDays, longDate, toYmd, ymdToTime } from '@huishouden/pwa-kit/time';
import type { Dose, Med, Person } from '../lib/model';
import { adherenceOf, doseText, isStopped, medLabel, scheduleText } from '../lib/meds';
import { ageOn } from '../lib/people';

/** How far back stopped medicines are listed for the doctor. */
const STOPPED_DAYS = 90;

export interface ListModel {
  person: Person;
  current: Med[];
  stopped: Med[];
  contacts: Contact[];
  adherence: number | null;
}

export function listModel(person: Person, meds: Med[], doses: Dose[], contacts: Contact[], now: number): ListModel {
  const mine = meds.filter((m) => m.personId === person.id).sort((a, b) => Number(a.asNeeded) - Number(b.asNeeded) || medLabel(a).localeCompare(medLabel(b)));
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
  return { person, current, stopped, contacts: contacts.filter((c) => used.has(c.id)), adherence: given + missed ? Math.round((given / (given + missed)) * 100) : null };
}

const contactName = (contacts: Contact[], id?: string) => (id ? contacts.find((c) => c.id === id)?.name ?? '' : '');

/** The list as plain text, for sharing by message or email. */
export function listText(l: ListModel, now: number): string {
  const today = toYmd(now);
  const age = ageOn(l.person, today);
  const lines = [
    `Medicines for ${l.person.name}`,
    [l.person.birthDate ? `Born ${longDate(l.person.birthDate)}${age !== null ? ` (${age})` : ''}` : '', `As of ${longDate(today)}`].filter(Boolean).join('. '),
    `Allergies: ${l.person.allergies || 'none recorded'}`,
    '',
    ...l.current.map((m) => `- ${medLabel(m)}: ${[doseText(m), scheduleText(m)].filter(Boolean).join(', ')}${m.prescriberId ? `. Prescribed by ${contactName(l.contacts, m.prescriberId)}` : ''}. Since ${longDate(m.startDate)}${m.endDate ? `, until ${longDate(m.endDate)}` : ''}.`),
  ];
  if (l.stopped.length) lines.push('', 'Stopped recently:', ...l.stopped.map((m) => `- ${medLabel(m)}, stopped ${longDate(m.endDate!)}`));
  if (l.adherence !== null) lines.push('', `Doses given, last 30 days: ${l.adherence}%`);
  if (l.contacts.length) lines.push('', ...l.contacts.map((c) => `${c.name}${c.role ? ` (${c.role})` : ''}${c.phone ? `: ${c.phone}` : ''}`));
  return lines.join('\n');
}

/** A medication list to print or share for a doctor's visit: one page, plain, readable on paper. */
export function PrintList({ list, now, onClose }: { list: ListModel; now: number; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const today = toYmd(now);
  const { person } = list;
  const age = ageOn(person, today);
  const share = async () => {
    const text = listText(list, now);
    if (navigator.share) {
      await navigator.share({ title: `Medicines for ${person.name}`, text }).catch(() => {});
      return;
    }
    await navigator.clipboard?.writeText(text);
    setCopied(true);
  };
  const scheduled = list.current.filter((m) => !m.asNeeded);
  const asNeeded = list.current.filter((m) => m.asNeeded);
  const table = (meds: Med[]) => (
    <table className="mt-2 w-full border-collapse text-left text-base">
      <thead>
        <tr className="border-b-2 border-stone-800 text-sm">
          <th className="py-1.5 pr-3 font-semibold">Medicine</th>
          <th className="py-1.5 pr-3 font-semibold">Dose</th>
          <th className="py-1.5 pr-3 font-semibold">When</th>
          <th className="py-1.5 pr-3 font-semibold">Prescribed by</th>
          <th className="py-1.5 font-semibold">Since</th>
        </tr>
      </thead>
      <tbody>
        {meds.map((m) => (
          <tr key={m.id} className="break-inside-avoid border-b border-stone-200 align-top">
            <td className="py-2 pr-3 font-medium">{medLabel(m)}</td>
            <td className="py-2 pr-3">{doseText(m)}</td>
            <td className="py-2 pr-3">
              {scheduleText(m)}
              {m.endDate ? `, until ${longDate(m.endDate, today)}` : ''}
              {m.notes && <span className="block text-sm text-stone-600">{m.notes}</span>}
            </td>
            <td className="py-2 pr-3">{contactName(list.contacts, m.prescriberId)}</td>
            <td className="py-2 whitespace-nowrap">{longDate(m.startDate, today)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
  return (
    <section aria-label={`Medicine list for ${person.name}`} className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm print:border-0 print:p-0 print:shadow-none">
      <div className="mb-4 flex flex-wrap gap-2 print:hidden">
        <button type="button" className={primaryButton} onClick={() => window.print()}>
          <Printer size={18} /> Print
        </button>
        <button type="button" className={secondaryButton} onClick={() => void share()}>
          <Share2 size={18} /> {copied ? 'Copied' : 'Share'}
        </button>
        <button type="button" className={`${ghostButton} ml-auto`} onClick={onClose}>
          <X size={18} /> Close
        </button>
      </div>
      <h1 className="text-2xl font-semibold text-stone-800">Medicines for {person.name}</h1>
      <p className="mt-1 text-base text-stone-700">
        {[person.birthDate ? `Born ${longDate(person.birthDate)}${age !== null ? ` (${age})` : ''}` : '', `As of ${longDate(today)}`].filter(Boolean).join(' · ')}
      </p>
      <p className="mt-1 text-base font-medium text-stone-800">Allergies: {person.allergies || 'none recorded'}</p>
      {scheduled.length > 0 && (
        <>
          <h2 className="mt-5 text-lg font-semibold text-stone-800">Taken regularly</h2>
          {table(scheduled)}
        </>
      )}
      {asNeeded.length > 0 && (
        <>
          <h2 className="mt-5 text-lg font-semibold text-stone-800">When needed</h2>
          {table(asNeeded)}
        </>
      )}
      {list.current.length === 0 && <p className="mt-4 text-base">No medicines at the moment.</p>}
      {list.stopped.length > 0 && (
        <>
          <h2 className="mt-5 text-lg font-semibold text-stone-800">Stopped in the last three months</h2>
          <ul className="mt-1 list-disc pl-5 text-base">
            {list.stopped.map((m) => (
              <li key={m.id}>
                {medLabel(m)}, stopped {longDate(m.endDate!, today)}
              </li>
            ))}
          </ul>
        </>
      )}
      {list.adherence !== null && <p className="mt-5 text-base text-stone-700">Doses given in the last 30 days: {list.adherence}%.</p>}
      {list.contacts.length > 0 && (
        <>
          <h2 className="mt-5 text-lg font-semibold text-stone-800">Doctors and pharmacy</h2>
          <ul className="mt-1 text-base">
            {list.contacts.map((c) => (
              <li key={c.id}>
                {c.name}
                {c.role ? ` (${c.role})` : ''}
                {c.phone ? `, ${c.phone}` : ''}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
