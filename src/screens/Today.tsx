import { Check, Clock, SkipForward } from 'lucide-react';
import { asNeededCheck } from '@huishouden/pwa-kit/dose';
import { useClock } from '@huishouden/pwa-kit/react/clock';
import { cardClass, ghostButton, overline, primaryButton, secondaryButton } from '@huishouden/pwa-kit/react/ui';
import { agoWords, clockWords, formatTime, toHhmm, toYmd } from '@huishouden/pwa-kit/time';
import type { Dose, Med, Person } from '../lib/model';
import { dayRows, doseText, isCurrent, logsOf, medLabel, nextDose, refillDue, type Row } from '../lib/meds';
import { canGive } from '../lib/people';
import type { HealthStore } from '../data/actions';
import { Avatar } from '../components/Avatar';

export interface TodayProps {
  store: HealthStore;
  people: Person[];
  nameOf: (email: string) => string;
  onMark: (row: { med: Med; slot?: string; slotAt?: number }, status: 'given' | 'skipped') => void;
  onOther: (row: { med: Med; slot?: string; slotAt?: number }) => void;
  onUnmark: (dose: Dose) => void;
  onShowMeds: (personId: string) => void;
  empty: React.ReactNode;
}

/** "Due now", "Due at 2 PM", "2 hours late". */
function whenText(r: Row, now: number): string {
  if (r.state === 'missed') return `${clockWords(r.slot.time)} · not marked`;
  if (r.slot.at <= now) return `${clockWords(r.slot.time)} · due now`;
  return `Due at ${clockWords(r.slot.time)}`;
}

/** Who marked a dose and when: "Given 8:10 AM by Jo", "Given late 11:02 AM by you", "Skipped by Sam". */
export function markedText(d: Dose, slotAt: number | undefined, nameOf: (e: string) => string): string {
  const late = d.status === 'given' && slotAt !== undefined && d.at > slotAt + 2 * 3_600_000;
  return `${d.status === 'skipped' ? 'Skipped' : late ? 'Given late' : 'Given'} ${formatTime(d.at)} by ${nameOf(d.by)}`;
}

/** "Amoxicillin 250 mg/5 ml at 2 PM and 8 PM; Atorvastatin 20 mg at 9 PM". */
function laterText(rows: Row[]): string {
  const byMed = new Map<string, { label: string; times: string[] }>();
  for (const r of rows) {
    const e = byMed.get(r.med.id) ?? { label: medLabel(r.med), times: [] };
    e.times.push(clockWords(r.slot.time));
    byMed.set(r.med.id, e);
  }
  return [...byMed.values()].map((e) => `${e.label} at ${e.times.length > 1 ? `${e.times.slice(0, -1).join(', ')} and ${e.times.at(-1)}` : e.times[0]}`).join('; ');
}

export function Today({ store, people, nameOf, onMark, onOther, onUnmark, onShowMeds, empty }: TodayProps) {
  const { now } = useClock();
  const { data, role, me } = store;
  if (people.length === 0) return <>{empty}</>;
  const today = toYmd(now);
  const rowsOf = (p: Person) => dayRows(data.meds.filter((m) => m.personId === p.id), data.doses, now);
  const needs = people
    .flatMap((p) => rowsOf(p).filter((r) => r.state === 'due' || r.state === 'missed').map((r) => ({ person: p, row: r })))
    .sort((a, b) => a.row.slot.at - b.row.slot.at);
  const next = people
    .map((p) => ({ person: p, row: nextDose(data.meds.filter((m) => m.personId === p.id), data.doses, now) }))
    .filter((x): x is { person: Person; row: Row } => !!x.row)
    .sort((a, b) => a.row.slot.at - b.row.slot.at)[0];

  return (
    <div className="grid gap-4">
      <section aria-label="Needs doing" className={`${cardClass} p-5 sm:p-6`}>
        <h2 className="text-xl font-semibold text-ink">Needs doing</h2>
        {needs.length === 0 ? (
          <p className="mt-2 text-lg text-muted">
            Nothing due right now.
            {next && ` Next: ${next.person.name} at ${clockWords(next.row.slot.time)}${toYmd(next.row.slot.at) !== today ? ' tomorrow' : ''}.`}
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {needs.map(({ person, row }) => {
              const may = canGive(person, role, me);
              const target = { med: row.med, slot: row.slot.key, slotAt: row.slot.at };
              return (
                <li key={`${row.med.id}-${row.slot.key}`} className="flex flex-wrap items-center gap-3 py-3">
                  <Avatar person={person} people={people} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-medium text-ink">
                      {medLabel(row.med)} <span className="font-normal text-muted">for {person.name}</span>
                    </p>
                    <p className={`text-sm ${row.state === 'missed' ? 'font-medium text-attention' : 'text-muted'}`}>
                      {[whenText(row, now), doseText(row.med)].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  {may && (
                    <div className="flex gap-1.5">
                      <button type="button" className={primaryButton} aria-label={`Given: ${medLabel(row.med)} for ${person.name}`} onClick={() => onMark(target, 'given')}>
                        <Check size={18} /> Given
                      </button>
                      <button type="button" className={secondaryButton} aria-label={`Skip: ${medLabel(row.med)} for ${person.name}`} onClick={() => onMark(target, 'skipped')}>
                        <SkipForward size={18} /> Skip
                      </button>
                      <button type="button" className={ghostButton} aria-label={`Another time: ${medLabel(row.med)} for ${person.name}`} onClick={() => onOther(target)}>
                        <Clock size={18} /> Late
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 sm:items-start">
        {people.map((p) => (
          <PersonDay key={p.id} person={p} people={people} store={store} rows={rowsOf(p)} nameOf={nameOf} onMark={onMark} onUnmark={onUnmark} onShowMeds={onShowMeds} />
        ))}
      </div>
    </div>
  );
}

function PersonDay({ person, people, store, rows, nameOf, onMark, onUnmark, onShowMeds }: {
  person: Person;
  people: Person[];
  store: HealthStore;
  rows: Row[];
  nameOf: (email: string) => string;
  onMark: TodayProps['onMark'];
  onUnmark: TodayProps['onUnmark'];
  onShowMeds: (personId: string) => void;
}) {
  const { now } = useClock();
  const { data, role, me } = store;
  const may = canGive(person, role, me);
  const today = toYmd(now);
  const meds = data.meds.filter((m) => m.personId === person.id && isCurrent(m, today));
  const asNeeded = meds.filter((m) => m.asNeeded);
  const done = rows.filter((r) => r.log);
  const later = rows.filter((r) => r.state === 'upcoming');
  const low = meds.filter((m) => refillDue(m, data.doses, now));

  return (
    <section aria-label={`${person.name} today`} className={`${cardClass} p-5`}>
      <div className="flex items-center gap-3">
        <Avatar person={person} people={people} size={44} />
        <h2 className="min-w-0 flex-1 text-lg font-semibold text-ink">{person.name}</h2>
        <button type="button" className={ghostButton} aria-label={`Show ${person.name}'s medicines`} onClick={() => onShowMeds(person.id)}>
          Medicines
        </button>
      </div>
      {meds.length === 0 && <p className="mt-2 text-base text-muted">No medicines at the moment.</p>}
      {person.allergies && <p className="mt-2 text-sm text-muted">Allergies: {person.allergies}</p>}
      {done.length > 0 && (
        <>
          <h3 className={`${overline} mt-4`}>Done today</h3>
          <ul className="mt-1 space-y-1">
            {done.map((r) => (
              <li key={`${r.med.id}-${r.slot.key}`} className="flex items-center gap-2 text-base text-ink-soft">
                <Check size={16} className={r.state === 'given' ? 'text-positive' : 'text-muted'} aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  {medLabel(r.med)} <span className="text-sm text-muted">{clockWords(r.slot.time)} · {markedText(r.log!, r.slot.at, nameOf)}</span>
                </span>
                {may && (
                  <button type="button" className="min-h-11 rounded-xl px-2 text-sm text-muted hover:bg-sunken" aria-label={`Undo: ${medLabel(r.med)} at ${clockWords(r.slot.time)}`} onClick={() => onUnmark(r.log!)}>
                    Undo
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      {later.length > 0 && (
        <p className="mt-3 text-base text-ink-soft">
          <span className="text-muted">Later today: </span>
          {laterText(later)}
        </p>
      )}
      {asNeeded.length > 0 && (
        <>
          <h3 className={`${overline} mt-4`}>When needed</h3>
          <ul className="mt-1 divide-y divide-line">
            {asNeeded.map((m) => {
              const logs = logsOf(data.doses, m.id);
              const check = asNeededCheck(logs, now, { minHours: m.minHours, maxPerDay: m.maxPerDay });
              const last = logs.filter((l) => l.status === 'given' && l.at <= now).sort((a, b) => b.at - a.at)[0];
              return (
                <li key={m.id} className="flex flex-wrap items-center gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-base text-ink">{medLabel(m)}</p>
                    <p className="text-sm text-muted">
                      {last ? `Last ${agoWords(last.at, now)} by ${nameOf(last.by)}` : 'Not given recently'}
                      {!check.ok && ` · fine from ${clockWords(toHhmm(check.nextAt))}${toYmd(check.nextAt) !== today ? ' tomorrow' : ''}`}
                    </p>
                  </div>
                  {may && (
                    <button type="button" className={secondaryButton} aria-label={`Give ${medLabel(m)} to ${person.name}`} onClick={() => onMark({ med: m }, 'given')}>
                      Give
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
      {low.length > 0 && (
        <p className="mt-3 text-sm font-medium text-attention">
          Running low: {low.map(medLabel).join(', ')}
        </p>
      )}
    </section>
  );
}
