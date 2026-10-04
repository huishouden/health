import { Pencil, Plus, UserPlus } from 'lucide-react';
import type { Contact } from '@huishouden/pwa-kit/contacts';
import { ContactCard } from '@huishouden/pwa-kit/react/contacts';
import { useClock } from '@huishouden/pwa-kit/react/clock';
import { cardClass, ghostButton, overline, primaryButton, secondaryButton } from '@huishouden/pwa-kit/react/ui';
import { can } from '@huishouden/pwa-kit/roles';
import { toYmd } from '@huishouden/pwa-kit/time';
import type { Person } from '../lib/model';
import { ageOn, canAddPeople, canEdit, mainCarer } from '../lib/people';
import type { HealthStore } from '../data/actions';
import { Avatar } from '../components/Avatar';
import { useT } from '../i18n';
import { compareText, formatList } from '@huishouden/pwa-kit/i18n';
import { roleLabel } from '../lib/contacts';

export function People({ store, people, nameOf, onAdd, onEdit, onContact, onRemoveContact, deviceSettings }: {
  store: HealthStore;
  people: Person[];
  nameOf: (email: string) => string;
  onAdd: () => void;
  onEdit: (p: Person) => void;
  onContact: (c: Contact | null, role?: string) => void;
  onRemoveContact: (c: Contact) => void;
  deviceSettings?: React.ReactNode;
}) {
  const t = useT();
  const { now } = useClock();
  const { role, household } = store;
  const contacts = [...store.data.contacts].sort((a, b) => compareText(a.name, b.name));
  const mayContacts = role === 'admin' || role === 'member';
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
      <section aria-label={t('tab.people')} className={`${cardClass} p-5 sm:p-6`}>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="min-w-0 flex-1 text-xl font-semibold text-ink">{t('tab.people')}</h2>
          {canAddPeople(role) && (
            <button type="button" className={primaryButton} onClick={onAdd}>
              <UserPlus size={18} /> {t('people.add')}
            </button>
          )}
        </div>
        <p className="mt-1 text-sm text-muted">{t('people.privacy')}</p>
        {people.length === 0 ? (
          <p className="mt-3 text-base text-muted">{t('people.none')}</p>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {people.map((p) => {
              const age = ageOn(p, toYmd(now));
              const main = mainCarer(p, household);
              const others = p.carers.filter((c) => c !== main);
              return (
                <li key={p.id} className="flex items-start gap-3 py-3">
                  <Avatar person={p} people={people} size={48} />
                  <div className="min-w-0 flex-1">
                    <p className="text-lg font-medium text-ink">
                      {p.name}
                      {age !== null && <span className="font-normal text-muted"> · {age}</span>}
                    </p>
                    <p className="text-sm text-muted">
                      {p.email ? `${t('people.hasAccount', { name: nameOf(p.email) })} ` : ''}
                      {main ? t('people.remindedFirst', { name: nameOf(main) }) : t('people.nobodyReminded')}
                      {others.length > 0 && `; ${t('people.alsoLooking', { names: formatList(others.map(nameOf)) })}`}
                    </p>
                    {p.allergies && <p className="text-sm text-ink-soft">{t('today.allergies', { allergies: p.allergies })}</p>}
                    {p.notes && <p className="text-sm text-muted">{p.notes}</p>}
                  </div>
                  {canEdit(p, role, store.me) && (
                    <button type="button" className={ghostButton} aria-label={t('a11y.edit', { name: p.name })} onClick={() => onEdit(p)}>
                      <Pencil size={18} /> {t('common.edit')}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {!canAddPeople(role) && <p className="mt-3 text-sm text-muted">{t('people.onlyStaff')}</p>}
      </section>

      <div className="grid gap-4">
        <section aria-label={t('people.doctors')} className={`${cardClass} p-5 sm:p-6`}>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className={`${overline} min-w-0 flex-1`}>{t('people.doctors')}</h2>
            {mayContacts && (
              <button type="button" className={secondaryButton} onClick={() => onContact(null)}>
                <Plus size={18} /> {t('common.add')}
              </button>
            )}
          </div>
          {contacts.length === 0 ? (
            <p className="mt-2 text-base text-muted">{t('people.doctorsEmpty')}</p>
          ) : (
            <div className="mt-3 grid gap-3">
              {contacts.map((c) => (
                <ContactCard key={c.id} contact={c} role={roleLabel(c.role ?? '')} onEdit={mayContacts ? () => onContact(c) : undefined} onDelete={mayContacts && can(role, 'edit-others') ? () => onRemoveContact(c) : undefined} />
              ))}
            </div>
          )}
        </section>
        {deviceSettings}
      </div>
    </div>
  );
}
