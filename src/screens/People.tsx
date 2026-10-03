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
  const { now } = useClock();
  const { role, household } = store;
  const contacts = [...store.data.contacts].sort((a, b) => a.name.localeCompare(b.name));
  const mayContacts = role === 'admin' || role === 'member';
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
      <section aria-label="People" className={`${cardClass} p-5 sm:p-6`}>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="min-w-0 flex-1 text-xl font-semibold text-stone-800">People</h2>
          {canAddPeople(role) && (
            <button type="button" className={primaryButton} onClick={onAdd}>
              <UserPlus size={18} /> Add person
            </button>
          )}
        </div>
        <p className="mt-1 text-sm text-stone-600">Each person's medicines are seen only by the household's admins, their carers and themselves.</p>
        {people.length === 0 ? (
          <p className="mt-3 text-base text-stone-600">Nobody yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-stone-200">
            {people.map((p) => {
              const age = ageOn(p, toYmd(now));
              const main = mainCarer(p, household);
              const others = p.carers.filter((c) => c !== main);
              return (
                <li key={p.id} className="flex items-start gap-3 py-3">
                  <Avatar person={p} people={people} size={48} />
                  <div className="min-w-0 flex-1">
                    <p className="text-lg font-medium text-stone-800">
                      {p.name}
                      {age !== null && <span className="font-normal text-stone-600"> · {age}</span>}
                    </p>
                    <p className="text-sm text-stone-600">
                      {p.email ? `Has an account: ${nameOf(p.email)}. ` : ''}
                      {main ? `Reminded first: ${nameOf(main)}` : 'Nobody is reminded'}
                      {others.length > 0 && `; also looking after: ${others.map(nameOf).join(', ')}`}
                    </p>
                    {p.allergies && <p className="text-sm text-stone-700">Allergies: {p.allergies}</p>}
                    {p.notes && <p className="text-sm text-stone-600">{p.notes}</p>}
                  </div>
                  {canEdit(p, role, store.me) && (
                    <button type="button" className={ghostButton} aria-label={`Edit ${p.name}`} onClick={() => onEdit(p)}>
                      <Pencil size={18} /> Edit
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {!canAddPeople(role) && <p className="mt-3 text-sm text-stone-600">Only admins and members add people. You see the people you look after.</p>}
      </section>

      <div className="grid gap-4">
        <section aria-label="Doctors and pharmacies" className={`${cardClass} p-5 sm:p-6`}>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className={`${overline} min-w-0 flex-1`}>Doctors and pharmacies</h2>
            {mayContacts && (
              <button type="button" className={secondaryButton} onClick={() => onContact(null)}>
                <Plus size={18} /> Add
              </button>
            )}
          </div>
          {contacts.length === 0 ? (
            <p className="mt-2 text-base text-stone-600">None yet. Add a doctor or pharmacy to show who prescribed each medicine and where it comes from.</p>
          ) : (
            <div className="mt-3 grid gap-3">
              {contacts.map((c) => (
                <ContactCard key={c.id} contact={c} role={c.role ?? ''} onEdit={mayContacts ? () => onContact(c) : undefined} onDelete={mayContacts && can(role, 'edit-others') ? () => onRemoveContact(c) : undefined} />
              ))}
            </div>
          )}
        </section>
        {deviceSettings}
      </div>
    </div>
  );
}
