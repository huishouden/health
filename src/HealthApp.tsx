import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { CalendarCheck, History as HistoryIcon, Pill, Users } from 'lucide-react';
import type { User } from 'firebase/auth';
import type { Contact } from '@huishouden/pwa-kit/contacts';
import { ContactDialog } from '@huishouden/pwa-kit/react/contacts';
import { useClock } from '@huishouden/pwa-kit/react/clock';
import { cardClass, primaryButton, Toast, type ToastState } from '@huishouden/pwa-kit/react/ui';
import { personName } from '@huishouden/pwa-kit/people';
import { toYmd } from '@huishouden/pwa-kit/time';
import type { Med, Person } from './lib/model';
import { guardFor, medLabel, supplyLeft } from './lib/meds';
import { APP } from './lib/publish';
import { canAddPeople, canEdit } from './lib/people';
import type { HealthStore } from './data/actions';
import { auth } from './data/firebase';
import { Header, type Tab } from './components/Header';
import { Photos } from './components/Avatar';
import { PersonDialog } from './components/PersonDialog';
import { MedDialog } from './components/MedDialog';
import { CountDialog, DoseDialog } from './components/DoseDialog';
import { listModel, PrintList } from './components/PrintList';
import { Today } from './screens/Today';
import { Medicines } from './screens/Medicines';
import { History } from './screens/History';
import { People } from './screens/People';

export type TabId = 'today' | 'medicines' | 'history' | 'people';

const TABS: Tab[] = [
  { id: 'today', label: 'Today', icon: CalendarCheck, primary: true },
  { id: 'medicines', label: 'Medicines', icon: Pill, primary: true },
  { id: 'history', label: 'History', icon: HistoryIcon, primary: true },
  { id: 'people', label: 'People', icon: Users, primary: true },
];

/** Doctors, pharmacies and the rest of the household's care, as one-tap roles in the contact dialog. */
export const CONTACT_ROLES = ['Doctor', 'Pharmacy', 'Specialist', 'Dentist', 'Home care'] as const;

interface Props {
  store: HealthStore;
  user: User | null;
  onSignIn: () => void;
  onSignOut: () => void;
  signingIn: boolean;
  toast: ToastState | null;
  notify: (message: string, undo?: () => void) => void;
  clearToast: () => void;
  banner?: ReactNode;
  deviceSettings?: ReactNode;
}

type Target = { med: Med; slot?: string; slotAt?: number };

const param = (k: string) => new URLSearchParams(location.search).get(k);

function initialTab(): TabId {
  const t = param('tab');
  return TABS.some((x) => x.id === t) ? (t as TabId) : 'today';
}

/** Everything inside the frame once there is data to show (live or sample). */
export function HealthApp({ store, user, onSignIn, onSignOut, signingIn, toast, notify, clearToast, banner, deviceSettings }: Props) {
  const { now } = useClock();
  const { data, actions, role, me } = store;
  const [tab, setTab] = useState<TabId>(initialTab);
  const [selected, setSelected] = useState<string | null>(() => param('person'));
  const [highlight] = useState<string | null>(() => param('med'));
  const [personDialog, setPersonDialog] = useState<{ person: Person | null } | null>(null);
  const [medDialog, setMedDialog] = useState<{ med: Med | null; personId: string } | null>(null);
  const [doseDialog, setDoseDialog] = useState<{ target: Target; warning?: string | null; initial?: 'given' | 'skipped' } | null>(null);
  const [count, setCount] = useState<Med | null>(null);
  const [contact, setContact] = useState<{ contact: Contact | null; role?: string } | null>(null);
  const [printFor, setPrintFor] = useState<string | null>(() => param('print'));

  useEffect(() => {
    document.title = 'Huishouden Health';
  }, []);

  const people = useMemo(() => [...data.people].sort((a, b) => a.createdAt - b.createdAt || a.name.localeCompare(b.name)), [data.people]);
  const photos = useMemo(() => new Map(data.photos.map((p) => [p.id, p.data])), [data.photos]);
  const nameOf = (email: string) => (email === me ? 'You' : store.names?.get(email) ?? personName(email, { email: me }));
  const personOf = (id: string) => people.find((p) => p.id === id);

  const setUrl = (changes: Record<string, string | null>) => {
    const url = new URL(location.href);
    for (const [k, v] of Object.entries(changes)) {
      if (v === null) url.searchParams.delete(k);
      else url.searchParams.set(k, v);
    }
    history.replaceState(null, '', url);
  };
  const chooseTab = (id: TabId) => {
    setTab(id);
    setUrl({ tab: id === 'today' ? null : id, med: null });
  };
  const choosePerson = (id: string | null) => {
    setSelected(id);
    setUrl({ person: id });
  };
  const print = (id: string | null) => {
    setPrintFor(id);
    setUrl({ print: id });
  };

  const mark = (t: Target, status: 'given' | 'skipped', at = now, note = '') => {
    const p = personOf(t.med.personId);
    const undo = actions.markDose({ med: t.med, slot: t.slot, at, status, note });
    notify(`${status === 'given' ? 'Given' : 'Skipped'}: ${medLabel(t.med)} for ${p?.name ?? ''}`.trim(), undo);
  };
  const onMark = (t: Target, status: 'given' | 'skipped') => {
    if (status === 'given') {
      const { warning } = guardFor(t.med, data.doses, now, nameOf, t.slot);
      if (warning) return setDoseDialog({ target: t, warning, initial: 'given' });
    }
    mark(t, status);
  };

  const empty = (
    <section className={`${cardClass} max-w-2xl p-6`}>
      {canAddPeople(role) ? (
        <>
          <h2 className="text-xl font-semibold text-ink">Whose medicines does the household look after?</h2>
          <p className="mt-2 text-lg text-muted">Add a person, then their medicines. Only the admins and the people you choose to look after them see them.</p>
          <button type="button" className={`${primaryButton} mt-4`} onClick={() => setPersonDialog({ person: null })}>
            Add a person
          </button>
        </>
      ) : role === 'kid' ? (
        <p className="text-lg text-muted">Medicines are looked after by the grown-ups.</p>
      ) : (
        <p className="text-lg text-muted">Nobody's medicines are shared with you yet. An admin can add you as someone who looks after them.</p>
      )}
    </section>
  );

  const printPerson = printFor ? personOf(printFor) : undefined;
  let content: ReactNode;
  if (!store.ready) content = <p className="p-2 text-lg text-muted">Loading medicines</p>;
  else if (printPerson) content = <PrintList list={listModel(printPerson, data.meds, data.doses, data.contacts, now)} now={now} onClose={() => print(null)} />;
  else if (tab === 'medicines')
    content = (
      <Medicines
        store={store}
        people={people}
        selected={selected}
        onSelect={choosePerson}
        highlight={highlight}
        onAdd={(personId) => setMedDialog({ med: null, personId })}
        onEdit={(m) => setMedDialog({ med: m, personId: m.personId })}
        onCount={setCount}
        onOrdered={(m) => notify(`Refill ordered: ${medLabel(m)}`, actions.refillOrdered(m))}
        onPrint={print}
        empty={empty}
      />
    );
  else if (tab === 'history') content = <History store={store} people={people} selected={selected} onSelect={choosePerson} nameOf={nameOf} onPrint={print} empty={empty} />;
  else if (tab === 'people')
    content = (
      <People
        store={store}
        people={people}
        nameOf={nameOf}
        onAdd={() => setPersonDialog({ person: null })}
        onEdit={(p) => setPersonDialog({ person: p })}
        onContact={(c, r) => setContact({ contact: c, role: r })}
        onRemoveContact={(c) => {
          actions.removeContact(c);
          notify(`Removed ${c.name}`, () => actions.restoreContact(c));
        }}
        deviceSettings={deviceSettings}
      />
    );
  else
    content = (
      <Today
        store={store}
        people={selected ? people.filter((p) => p.id === selected) : people}
        nameOf={nameOf}
        onMark={onMark}
        onOther={(t) => setDoseDialog({ target: t })}
        onUnmark={(d) => notify('Unmarked', actions.unmarkDoses([d]))}
        onShowMeds={(id) => {
          choosePerson(id);
          chooseTab('medicines');
        }}
        empty={empty}
      />
    );

  const medPerson = medDialog ? personOf(medDialog.personId) : undefined;
  const dosePerson = doseDialog ? personOf(doseDialog.target.med.personId) : undefined;

  return (
    <Photos.Provider value={photos}>
      <div className="flex min-h-dvh flex-col bg-page font-sans text-ink antialiased print:bg-white">
        <div className="print:hidden">
          <Header tabs={TABS} tab={tab} onTab={(id) => (print(null), chooseTab(id as TabId))} user={user} onSignIn={onSignIn} onSignOut={onSignOut} signingIn={signingIn} />
        </div>
        <main className="mx-auto flex w-full max-w-[1200px] flex-1 flex-col gap-4 px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6 sm:pt-6 sm:pb-6 print:p-0">
          {banner && <div className="print:hidden">{banner}</div>}
          {content}
        </main>

        {personDialog && (
          <PersonDialog
            person={personDialog.person}
            photo={personDialog.person ? photos.get(personDialog.person.id) : undefined}
            household={store.household}
            me={me}
            nameOf={nameOf}
            onClose={() => setPersonDialog(null)}
            onSave={(input, photo) => {
              const id = actions.savePerson(personDialog.person?.id ?? null, input);
              if (photo) actions.savePhoto(id, photo);
              else if (photo === null) actions.removePhoto(id);
              notify(personDialog.person ? `Saved ${input.name.trim()}` : `Added ${input.name.trim()}`);
            }}
            onDelete={
              personDialog.person && canEdit(personDialog.person, role, me)
                ? () => {
                    const bundle = actions.removePerson(personDialog.person!);
                    if (selected === bundle.person.id) choosePerson(null);
                    notify(`Removed ${bundle.person.name}`, () => actions.restorePerson(bundle));
                  }
                : undefined
            }
          />
        )}
        {medDialog && medPerson && (
          <MedDialog
            med={medDialog.med}
            person={medPerson}
            contacts={data.contacts}
            now={now}
            onClose={() => setMedDialog(null)}
            onSave={(input) => {
              actions.saveMed(medDialog.med?.id ?? null, input);
              notify(medDialog.med ? `Saved ${medLabel(input)}` : `Added ${medLabel(input)} for ${medPerson.name}`);
            }}
            onStop={medDialog.med && !(medDialog.med.endDate && medDialog.med.endDate < toYmd(now)) ? () => notify(`Stopped ${medLabel(medDialog.med!)}`, actions.stopMed(medDialog.med!)) : undefined}
            onRestart={medDialog.med?.endDate ? () => notify(`Taking ${medLabel(medDialog.med!)} again`, actions.restartMed(medDialog.med!)) : undefined}
            onDelete={medDialog.med ? () => notify(`Deleted ${medLabel(medDialog.med!)} and its history`, actions.deleteMed(medDialog.med!)) : undefined}
            onAddContact={(r) => setContact({ contact: null, role: r })}
          />
        )}
        {doseDialog && dosePerson && (
          <DoseDialog
            med={doseDialog.target.med}
            personName={dosePerson.name}
            slotAt={doseDialog.target.slotAt}
            now={now}
            warning={doseDialog.warning}
            initial={doseDialog.initial}
            onClose={() => setDoseDialog(null)}
            onSave={(status, at, note) => mark(doseDialog.target, status, at, note)}
          />
        )}
        {count && <CountDialog med={count} left={supplyLeft(count, data.doses)} onClose={() => setCount(null)} onSave={(n, refills) => notify(`Counted ${medLabel(count)}`, actions.countSupply(count, n, refills))} />}
        {contact && (
          <ContactDialog
            contact={contact.contact}
            app={APP}
            roles={CONTACT_ROLES}
            role={contact.role}
            namePlaceholder="Example Family Practice"
            searchPlaceholder="Practice or pharmacy and town"
            auth={user ? auth : null}
            canMarkPrivate={role === 'admin' || role === 'member'}
            onClose={() => setContact(null)}
            onSave={(input) => {
              actions.saveContact(contact.contact?.id ?? null, { ...input, private: contact.contact ? input.private : true });
              if (!contact.contact) notify(`Added ${input.name.trim()}`);
            }}
          />
        )}
        <div className="print:hidden">
          <Toast toast={toast} onDone={clearToast} />
        </div>
      </div>
    </Photos.Provider>
  );
}
