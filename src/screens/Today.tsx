import { Clock, SkipForward } from 'lucide-react';
import { asNeededCheck } from '@huishouden/pwa-kit/dose';
import { useClock } from '@huishouden/pwa-kit/react/clock';
import { canUndoDone, cardClass, CompleteButton, completeButton, CompletionList, CompletionRow, ghostButton, overline } from '@huishouden/pwa-kit/react/ui';
import { agoWords, atClock, clockWords, formatTime, toHhmm, toYmd } from '@huishouden/pwa-kit/time';
import type { Dose, Med, Person } from '../lib/model';
import { dayRows, doseText, isCurrent, logsOf, medLabel, nextDose, refillDue, type Row } from '../lib/meds';
import { canGive } from '../lib/people';
import type { HealthStore } from '../data/actions';
import { Avatar } from '../components/Avatar';
import { t as tr, useT } from '../i18n';
import { formatList } from '@huishouden/pwa-kit/i18n';
import { visitTitle, visitWhen } from '@huishouden/pwa-kit/visit';
import { CalendarClock } from 'lucide-react';
import { nextVisit } from '../lib/visits';

export interface TodayProps {
  store: HealthStore;
  people: Person[];
  nameOf: (email: string) => string;
  onMark: (row: { med: Med; slot?: string; slotAt?: number }, status: 'given' | 'skipped') => void;
  onOther: (row: { med: Med; slot?: string; slotAt?: number }) => void;
  onUnmark: (dose: Dose) => void;
  onShowMeds: (personId: string) => void;
  /** Opens the person's visits, at this one. */
  onShowVisit: (personId: string, visitId: string) => void;
  empty: React.ReactNode;
}

/** "Due now", "Due at 2 PM", "2 hours late". */
function whenText(r: Row, now: number): string {
  if (r.state === 'missed') return tr('today.notMarked', { time: clockWords(r.slot.time) });
  if (r.slot.at <= now) return tr('today.dueNow', { time: clockWords(r.slot.time) });
  return tr('today.dueAt', { time: clockWords(r.slot.time) });
}

/** Who marked a dose and when: "Given 8:10 AM by Jo", "Given late 11:02 AM by you", "Skipped by Sam". */
export function markedText(d: Dose, slotAt: number | undefined, nameOf: (e: string) => string): string {
  const late = d.status === 'given' && slotAt !== undefined && d.at > slotAt + 2 * 3_600_000;
  return tr(d.status === 'skipped' ? 'today.skippedBy' : late ? 'today.givenLateBy' : 'today.givenBy', { time: formatTime(d.at), name: nameOf(d.by) });
}

/** "Amoxicillin 250 mg/5 ml at 2 PM and 8 PM; Atorvastatin 20 mg at 9 PM". */
function laterText(rows: Row[]): string {
  const byMed = new Map<string, { label: string; times: string[] }>();
  for (const r of rows) {
    const e = byMed.get(r.med.id) ?? { label: medLabel(r.med), times: [] };
    e.times.push(clockWords(r.slot.time));
    byMed.set(r.med.id, e);
  }
  return [...byMed.values()].map((e) => tr('today.medAt', { med: e.label, times: formatList(e.times), one: /^1(?!\d)/.test(e.times[0]) ? 'yes' : 'no' })).join('; ');
}

export function Today({ store, people, nameOf, onMark, onOther, onUnmark, onShowMeds, onShowVisit, empty }: TodayProps) {
  const t = useT();
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
      <section aria-label={t('today.needs')} className={`${cardClass} p-5 sm:p-6`}>
        <h2 className="text-xl font-semibold text-ink">{t('today.needs')}</h2>
        {needs.length === 0 ? (
          <p className="mt-2 text-lg text-muted">
            {t('today.nothingDue')}
            {next &&
              ` ${t(toYmd(next.row.slot.at) !== today ? 'today.nextTomorrow' : 'today.next', { name: next.person.name, at: atClock(next.row.slot.time) })}`}
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {needs.filter(({ person }) => canGive(person, role, me)).map(({ person, row }) => {
              const target = { med: row.med, slot: row.slot.key, slotAt: row.slot.at };
              const med = medLabel(row.med);
              return (
                <li key={`${row.med.id}-${row.slot.key}`} data-completion="open" className="flex flex-wrap items-center gap-3 py-3">
                  <Avatar person={person} people={people} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="text-lg leading-snug font-semibold text-ink">
                      {med} <span className="font-normal text-muted">{t('today.forName', { name: person.name })}</span>
                    </p>
                    <p className={`text-base ${row.state === 'missed' ? 'font-semibold text-attention' : 'text-muted'}`}>
                      {[whenText(row, now), doseText(row.med)].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <div className="flex w-full items-center justify-end gap-1 sm:w-auto">
                    <button type="button" className={ghostButton} aria-label={t('today.skipFor', { med, name: person.name })} onClick={() => onMark(target, 'skipped')}>
                      <SkipForward size={18} aria-hidden="true" /> {t('today.skip')}
                    </button>
                    <button type="button" className={ghostButton} aria-label={t('today.anotherTimeFor', { med, name: person.name })} onClick={() => onOther(target)}>
                      <Clock size={18} aria-hidden="true" /> {t('today.late')}
                    </button>
                    <CompleteButton done={false} name={med} verb={t('today.give')} label={t('today.giveTo', { med, name: person.name })} onDone={() => onMark(target, 'given')} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 sm:items-start">
        {people.map((p) => (
          <PersonDay key={p.id} person={p} people={people} store={store} rows={rowsOf(p)} nameOf={nameOf} onMark={onMark} onUnmark={onUnmark} onShowMeds={onShowMeds} onShowVisit={onShowVisit} />
        ))}
      </div>
    </div>
  );
}

function PersonDay({ person, people, store, rows, nameOf, onMark, onUnmark, onShowMeds, onShowVisit }: {
  person: Person;
  people: Person[];
  store: HealthStore;
  rows: Row[];
  nameOf: (email: string) => string;
  onMark: TodayProps['onMark'];
  onUnmark: TodayProps['onUnmark'];
  onShowMeds: (personId: string) => void;
  onShowVisit: TodayProps['onShowVisit'];
}) {
  const t = useT();
  const { now } = useClock();
  const { data, role, me } = store;
  const may = canGive(person, role, me);
  const today = toYmd(now);
  const meds = data.meds.filter((m) => m.personId === person.id && isCurrent(m, today));
  const asNeeded = meds.filter((m) => m.asNeeded);
  const done = rows.filter((r) => r.log);
  const open = rows.filter((r) => r.state === 'due' || r.state === 'missed');
  const doneRow = (r: Row) => {
    const d = r.log!;
    const med = medLabel(r.med);
    const skipped = d.status === 'skipped';
    const next = rows.find((x) => x.med.id === r.med.id && x.slot.at > r.slot.at)?.slot.at;
    const undo = may && canUndoDone(d.createdAt ?? d.at, now, { until: next });
    return (
      <CompletionRow
        key={`${r.med.id}-${r.slot.key}`}
        done
        skipped={skipped}
        name={med}
        title={
          <>
            {med} <span className="font-normal">{clockWords(r.slot.time)}</span>
          </>
        }
        status={markedText(d, r.slot.at, nameOf)}
        onDone={() => {}}
        onUndo={undo ? () => onUnmark(d) : undefined}
        undoLabel={t(skipped ? 'today.undoSkipped' : 'today.undoGiven', { med, at: atClock(r.slot.time) })}
      />
    );
  };
  const later = rows.filter((r) => r.state === 'upcoming');
  const visit = nextVisit(data.visits, person.id, now);
  const low = meds.filter((m) => refillDue(m, data.doses, now));

  return (
    <section aria-label={t('today.personToday', { name: person.name })} className={`${cardClass} p-5`}>
      <div className="flex items-center gap-3">
        <Avatar person={person} people={people} size={44} />
        <h2 className="min-w-0 flex-1 text-lg font-semibold text-ink">{person.name}</h2>
        <button type="button" className={ghostButton} aria-label={t('today.showMeds', { name: person.name })} onClick={() => onShowMeds(person.id)}>
          {t('tab.medicines')}
        </button>
      </div>
      {meds.length === 0 && <p className="mt-2 text-base text-muted">{t('today.noMeds')}</p>}
      {visit && (
        <button
          type="button"
          className="-mx-2 mt-2 flex min-h-11 w-[calc(100%+1rem)] items-center gap-2 rounded-xl px-2 text-left text-base text-ink-soft hover:bg-sunken"
          aria-label={t('today.showVisit', { title: visitTitle(visit), name: person.name })}
          onClick={() => onShowVisit(person.id, visit.id)}
        >
          <CalendarClock size={18} className="shrink-0 text-link" aria-hidden="true" />
          <span className="min-w-0 flex-1">{t('today.nextVisit', { when: visitWhen(visit, now), title: visitTitle(visit) })}</span>
        </button>
      )}
      {person.allergies && <p className="mt-2 text-sm text-muted">{t('today.allergies', { allergies: person.allergies })}</p>}
      {done.length > 0 &&
        (open.length > 0 ? (
          <>
            <h3 className={`${overline} mt-4`}>{t('today.doneToday')}</h3>
            <ul className="mt-1 divide-y divide-line">{done.map(doneRow)}</ul>
          </>
        ) : (
          <CompletionList className="mt-3" items={done} isDone={() => true} label={t('today.doneToday')} allDone={t('today.allDoneSoFar')}>
            {doneRow}
          </CompletionList>
        ))}
      {later.length > 0 && (
        <p className="mt-3 text-base text-ink-soft">
          <span className="text-muted">{t('today.laterToday')} </span>
          {laterText(later)}
        </p>
      )}
      {asNeeded.length > 0 && (
        <>
          <h3 className={`${overline} mt-4`}>{t('today.whenNeeded')}</h3>
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
                      {last ? t('today.lastBy', { ago: agoWords(last.at, now), name: nameOf(last.by) }) : t('today.notRecently')}
                      {!check.ok && ` · ${t(toYmd(check.nextAt) !== today ? 'today.fineFromTomorrow' : 'today.fineFrom', { time: clockWords(toHhmm(check.nextAt)) })}`}
                    </p>
                  </div>
                  {may && (
                    <button type="button" className={completeButton} aria-label={t('today.giveTo', { med: medLabel(m), name: person.name })} onClick={() => onMark({ med: m }, 'given')}>
                      {t('today.give')}
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
          {t('today.runningLow', { meds: formatList(low.map(medLabel)) })}
        </p>
      )}
    </section>
  );
}
