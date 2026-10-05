import { useState, type ReactNode } from 'react';
import { CalendarClock, ChevronDown, Pencil, Pill, Plus } from 'lucide-react';
import type { Contact } from '@huishouden/pwa-kit/contacts';
import { useClock } from '@huishouden/pwa-kit/react/clock';
import { useHome } from '@huishouden/pwa-kit/react/home';
import { cardClass, Chip, ghostButton, primaryButton } from '@huishouden/pwa-kit/react/ui';
import { conditionStatusLabel, partialDateWords, severityLabel, specialtyLabel, type SpecialtyGroup } from '@huishouden/pwa-kit/condition';
import { formatDayShort } from '@huishouden/pwa-kit/time';
import { visitTitle } from '@huishouden/pwa-kit/visit';
import { formatList } from '@huishouden/pwa-kit/i18n';
import type { Condition, Person } from '../lib/model';
import { conditionGroups, householdGroups, medsFor, visitsFor } from '../lib/conditions';
import { canKeepConditions, canReadConditions } from '../lib/people';
import { medLabel } from '../lib/meds';
import { nameFromHome } from '../lib/contacts';
import type { HealthStore } from '../data/actions';
import { Avatar, PersonChips } from '../components/Avatar';
import { useT } from '../i18n';

export interface ConditionsProps {
  store: HealthStore;
  /** Everyone the member sees in Health; only those whose conditions they may read are shown. */
  people: Person[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  highlight?: string | null;
  onAdd: (personId: string) => void;
  onEdit: (c: Condition) => void;
  onShowVisit: (personId: string, visitId: string) => void;
  empty: ReactNode;
}

const STATUS_CLASS: Record<Condition['status'], string> = {
  active: 'border-primary bg-tint text-link',
  managed: 'border-line text-ink-soft',
  resolved: 'border-line bg-sunken text-muted',
};

/** Each person's conditions by medical area, or the household's by area ("By area"), for the people whose conditions this member reads. */
export function Conditions({ store, people, selected, onSelect, highlight, onAdd, onEdit, onShowVisit, empty }: ConditionsProps) {
  const t = useT();
  const [byArea, setByArea] = useState(false);
  const { role, me } = store;
  const readable = people.filter((p) => canReadConditions(p, role, me));
  if (readable.length === 0) return <>{people.length ? <p className="p-2 text-lg text-muted">{t('conditions.notShared')}</p> : empty}</>;
  const shown = selected ? readable.filter((p) => p.id === selected) : readable;
  const household = !selected && readable.length > 1;
  return (
    <div className="space-y-4">
      <PersonChips people={readable} selected={selected} onSelect={onSelect} />
      {household && (
        <div role="group" aria-label={t('conditions.view')} className="flex flex-wrap gap-2">
          <Chip active={!byArea} onClick={() => setByArea(false)}>
            {t('conditions.byPerson')}
          </Chip>
          <Chip active={byArea} onClick={() => setByArea(true)}>
            {t('conditions.byArea')}
          </Chip>
        </div>
      )}
      {household && byArea ? (
        <section aria-label={t('conditions.householdTitle')} className={`${cardClass} p-5 sm:p-6`}>
          <h2 className="text-xl font-semibold text-ink">{t('conditions.householdTitle')}</h2>
          <Groups groups={householdGroups(store.data.conditions, shown.map((p) => p.id))} store={store} people={people} highlight={highlight} withPerson onEdit={onEdit} onShowVisit={onShowVisit} />
        </section>
      ) : (
        shown.map((p) => {
          const groups = conditionGroups(store.data.conditions, p.id);
          const keeps = canKeepConditions(p, role, me);
          return (
            <section key={p.id} aria-label={t('conditions.of', { name: p.name })} className={`${cardClass} p-5 sm:p-6`}>
              <div className="flex flex-wrap items-center gap-3">
                <Avatar person={p} people={people} size={44} />
                <h2 className="min-w-0 flex-1 basis-40 text-xl font-semibold text-ink">{p.name}</h2>
                {keeps && (
                  <button type="button" className={primaryButton} onClick={() => onAdd(p.id)}>
                    <Plus size={18} /> {t('conditions.add')}
                  </button>
                )}
              </div>
              {groups.length === 0 ? (
                <p className="mt-3 text-base text-muted">{keeps ? t('conditions.emptyEditable') : t('conditions.empty')}</p>
              ) : (
                <Groups groups={groups} store={store} people={people} highlight={highlight} onEdit={keeps ? onEdit : undefined} onShowVisit={onShowVisit} />
              )}
            </section>
          );
        })
      )}
    </div>
  );
}

function Groups({ groups, store, people, highlight, withPerson, onEdit, onShowVisit }: {
  groups: SpecialtyGroup<Condition>[];
  store: HealthStore;
  people: Person[];
  highlight?: string | null;
  /** The household view: each condition says whose it is. */
  withPerson?: boolean;
  onEdit?: (c: Condition) => void;
  onShowVisit: (personId: string, visitId: string) => void;
}) {
  const t = useT();
  if (!groups.length) return <p className="mt-3 text-base text-muted">{t('conditions.empty')}</p>;
  return (
    <div className="mt-3 space-y-2">
      {groups.map((g) => {
        const resolved = g.conditions.length - g.current;
        return (
          <details key={g.specialty} className="group rounded-2xl border border-line" open={g.current > 0 || g.conditions.some((c) => c.id === highlight)}>
            <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-x-2 px-4 py-2.5 select-none">
              <span className="text-lg font-semibold text-ink">{specialtyLabel(g.specialty)}</span>
              <span className="rounded-full bg-sunken px-2.5 py-0.5 text-sm font-medium text-ink-soft">{g.conditions.length}</span>
              {resolved > 0 && <span className="text-sm text-muted">{t('conditions.resolvedCount', { count: resolved })}</span>}
              <ChevronDown size={18} aria-hidden="true" className="ml-auto text-muted transition-transform group-open:rotate-180" />
            </summary>
            <ul className="divide-y divide-line border-t border-line px-4">
              {g.conditions.map((c) => (
                <ConditionRow
                  key={c.id}
                  condition={c}
                  store={store}
                  person={people.find((p) => p.id === c.personId)}
                  people={people}
                  withPerson={withPerson}
                  highlight={highlight === c.id}
                  onEdit={onEdit && (people.find((p) => p.id === c.personId) ? () => onEdit(c) : undefined)}
                  onShowVisit={onShowVisit}
                />
              ))}
            </ul>
          </details>
        );
      })}
    </div>
  );
}

function ConditionRow({ condition: c, store, person, people, withPerson, highlight, onEdit, onShowVisit }: {
  condition: Condition;
  store: HealthStore;
  person: Person | undefined;
  people: Person[];
  withPerson?: boolean;
  highlight: boolean;
  onEdit?: () => void;
  onShowVisit: (personId: string, visitId: string) => void;
}) {
  const t = useT();
  const { now } = useClock();
  const home = useHome();
  const { contacts, meds, visits } = store.data;
  const contact = (id?: string): Contact | undefined => (id ? contacts.find((x) => x.id === id) : undefined);
  const doctor = contact(c.doctorId);
  const clinic = contact(c.clinicId);
  const treating = medsFor(c, meds);
  const about = visitsFor(c, visits, now);
  const editable = !!onEdit && !!person && canKeepConditions(person, store.role, store.me);
  const when = [
    c.diagnosed ? t('conditions.diagnosed', { date: partialDateWords(c.diagnosed) }) : '',
    doctor ? t('conditions.by', { name: nameFromHome(doctor, { home }) }) : '',
    clinic && clinic.id !== doctor?.id ? t('conditions.at', { place: nameFromHome(clinic, { home }) }) : c.place ? t('conditions.at', { place: c.place }) : '',
  ].filter(Boolean);
  return (
    <li id={`condition-${c.id}`} className={`flex items-start gap-3 py-3 ${highlight ? 'rounded-xl bg-tint px-2' : ''}`}>
      {withPerson && <Avatar person={person} people={people} size={36} />}
      <div className="min-w-0 flex-1 space-y-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-lg leading-snug font-semibold text-ink [overflow-wrap:anywhere]">{c.name}</span>
          {withPerson && person && <span className="text-base text-muted">{t('today.forName', { name: person.name })}</span>}
          <span className={`rounded-full border px-2.5 py-0.5 text-sm font-medium ${STATUS_CLASS[c.status]}`}>{conditionStatusLabel(c.status)}</span>
          {c.severity && <span className="text-sm text-muted">{severityLabel(c.severity)}</span>}
        </p>
        {when.length > 0 && <p className="text-base text-ink-soft">{when.join(' · ')}</p>}
        {c.status === 'resolved' && c.resolved && <p className="text-sm text-muted">{t('conditions.resolvedOn', { date: partialDateWords(c.resolved) })}</p>}
        {treating.length > 0 && (
          <p className="flex items-start gap-1.5 text-base text-ink-soft">
            <Pill size={16} aria-hidden="true" className="mt-1 shrink-0 text-muted" /> {t('conditions.treatedWith', { meds: formatList(treating.map(medLabel)) })}
          </p>
        )}
        {about.length > 0 && (
          <p className="flex flex-wrap items-center gap-x-2 text-base">
            <CalendarClock size={16} aria-hidden="true" className="shrink-0 text-muted" />
            {about.slice(0, 3).map((v) => (
              <button key={v.id} type="button" className="min-h-11 text-link underline-offset-2 hover:underline" onClick={() => onShowVisit(v.personId, v.id)}>
                {t('conditionDialog.visitLine', { title: visitTitle(v), date: formatDayShort(v.at) })}
              </button>
            ))}
          </p>
        )}
        {c.notes && <p className="text-sm text-ink-soft [overflow-wrap:anywhere] whitespace-pre-line">{c.notes}</p>}
        {c.icd10 && <p className="text-sm text-muted">{t('conditions.icd10', { code: c.icd10 })}</p>}
      </div>
      {editable && (
        <button type="button" className={ghostButton} aria-label={t('a11y.edit', { name: c.name })} onClick={onEdit}>
          <Pencil size={18} aria-hidden="true" />
        </button>
      )}
    </li>
  );
}
