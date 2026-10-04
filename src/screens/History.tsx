import { Printer } from 'lucide-react';
import { useClock } from '@huishouden/pwa-kit/react/clock';
import { cardClass, ghostButton, overline } from '@huishouden/pwa-kit/react/ui';
import { addDays, clockWords, DAY, formatTime, longDate, toYmd, ymdToTime } from '@huishouden/pwa-kit/time';
import type { Dose, Med, Person } from '../lib/model';
import { adherenceOf, medLabel, rateText, rowsBetween } from '../lib/meds';
import type { HealthStore } from '../data/actions';
import { Avatar, PersonChips } from '../components/Avatar';
import { useT } from '../i18n';
import { capitalize, numberFormat } from '@huishouden/pwa-kit/i18n';

/** How far back adherence is counted. */
export const HISTORY_DAYS = 30;
/** How many days of the dose log are listed. */
const LOG_DAYS = 14;

interface Entry {
  at: number;
  med: Med;
  text: string;
  tone: 'given' | 'skipped' | 'missed';
}

export function History({ store, people, selected, onSelect, nameOf, onPrint, empty }: {
  store: HealthStore;
  people: Person[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  nameOf: (email: string) => string;
  onPrint: (personId: string) => void;
  empty: React.ReactNode;
}) {
  const t = useT();
  const { now } = useClock();
  if (people.length === 0) return <>{empty}</>;
  const shown = selected ? people.filter((p) => p.id === selected) : people;
  const today = toYmd(now);
  const from = ymdToTime(addDays(today, -(HISTORY_DAYS - 1)));
  return (
    <div className="space-y-4">
      <PersonChips people={people} selected={selected} onSelect={onSelect} />
      {shown.map((p) => {
        const meds = store.data.meds.filter((m) => m.personId === p.id && (!m.endDate || ymdToTime(m.endDate) >= from));
        const doses = store.data.doses.filter((d) => d.personId === p.id);
        const scheduled = meds.filter((m) => !m.asNeeded);
        const stats = scheduled.map((m) => ({ med: m, a: adherenceOf(m, doses, from, now, now) }));
        const missed = stats.reduce((n, s) => n + s.a.missed, 0);
        const given = stats.reduce((n, s) => n + s.a.given, 0);
        const overall = given + missed ? given / (given + missed) : null;
        return (
          <section key={p.id} aria-label={t('history.of', { name: p.name })} className={`${cardClass} p-5 sm:p-6`}>
            <div className="flex flex-wrap items-center gap-3">
              <Avatar person={p} people={people} size={44} />
              <h2 className="min-w-0 flex-1 basis-40 text-xl font-semibold text-ink">{p.name}</h2>
              <button type="button" className={ghostButton} onClick={() => onPrint(p.id)}>
                <Printer size={18} /> {t('medicines.printList')}
              </button>
            </div>
            <div className="mt-4 flex flex-wrap gap-x-10 gap-y-3">
              <Figure label={t('history.givenRate', { days: HISTORY_DAYS })} value={overall === null ? '–' : numberFormat({ style: 'percent', maximumFractionDigits: 0 }).format(overall)} />
              <Figure label={t('history.missedCount', { days: HISTORY_DAYS })} value={String(missed)} attention={missed > 0} />
            </div>
            {stats.length > 0 && (
              <table className="mt-4 w-full text-left text-base">
                <caption className={`${overline} pb-1 text-left`}>{t('history.byMedicine')}</caption>
                <thead>
                  <tr className="border-b border-line text-sm text-muted">
                    <th className="py-1.5 font-medium">{t('history.medicine')}</th>
                    <th className="py-1.5 pl-2 text-right font-medium">{t('dose.given')}</th>
                    <th className="py-1.5 pl-2 text-right font-medium">{t('history.missed')}</th>
                    <th className="py-1.5 pl-2 text-right font-medium">{t('dose.skipped')}</th>
                    <th className="py-1.5 pl-2 text-right font-medium">{t('history.rate')}</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.map(({ med, a }) => (
                    <tr key={med.id} className="border-b border-line last:border-0">
                      <td className="py-2 text-ink">{medLabel(med)}</td>
                      <td className="py-2 pl-2 text-right tabular-nums">{a.given}</td>
                      <td className={`py-2 pl-2 text-right tabular-nums ${a.missed ? 'font-medium text-attention' : ''}`}>{a.missed}</td>
                      <td className="py-2 pl-2 text-right tabular-nums">{a.skipped}</td>
                      <td className="py-2 pl-2 text-right tabular-nums">{rateText(a)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <DoseLog meds={meds} doses={doses} now={now} nameOf={nameOf} />
          </section>
        );
      })}
    </div>
  );
}

function Figure({ label, value, attention }: { label: string; value: string; attention?: boolean }) {
  return (
    <div>
      <p className={`text-3xl font-semibold tabular-nums ${attention ? 'text-attention' : 'text-ink'}`}>{value}</p>
      <p className="text-sm text-muted">{label}</p>
    </div>
  );
}

/** The last two weeks day by day: every dose given or skipped (who and when) and every one missed. */
function DoseLog({ meds, doses, now, nameOf }: { meds: Med[]; doses: Dose[]; now: number; nameOf: (e: string) => string }) {
  const t = useT();
  const today = toYmd(now);
  const from = ymdToTime(addDays(today, -(LOG_DAYS - 1)));
  const byId = new Map(meds.map((m) => [m.id, m]));
  const entries: Entry[] = [];
  for (const r of rowsBetween(meds, doses, from, now, now)) {
    if (r.state === 'missed') entries.push({ at: r.slot.at, med: r.med, text: t('history.missedAt', { time: clockWords(r.slot.time) }), tone: 'missed' });
  }
  for (const d of doses) {
    const med = byId.get(d.medId);
    if (!med || d.at < from || d.at > now + DAY) continue;
    entries.push({
      at: d.at,
      med,
      text: `${t(d.status === 'skipped' ? 'history.skippedBy' : 'history.givenBy', { time: formatTime(d.at), name: nameOf(d.by) })}${d.note ? ` · ${d.note}` : ''}`,
      tone: d.status,
    });
  }
  entries.sort((a, b) => b.at - a.at);
  const days = new Map<string, Entry[]>();
  for (const e of entries) days.set(toYmd(e.at), [...(days.get(toYmd(e.at)) ?? []), e]);
  if (!entries.length) return <p className="mt-4 text-base text-muted">{t('history.none')}</p>;
  return (
    <div className="mt-5">
      <h3 className={overline}>{t('history.lastTwoWeeks')}</h3>
      <div className="mt-1 space-y-3">
        {[...days.entries()].map(([day, list]) => (
          <div key={day}>
            <p className="text-sm font-medium text-ink-soft">{capitalize(longDate(day, today))}</p>
            <ul className="mt-0.5 space-y-0.5">
              {list.map((e, i) => (
                <li key={i} className="flex gap-2 text-base">
                  <span className={`min-w-0 flex-1 ${e.tone === 'missed' ? 'text-attention' : 'text-ink'}`}>
                    {medLabel(e.med)} <span className={`text-sm ${e.tone === 'missed' ? 'font-medium' : 'text-muted'}`}>{e.text}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
