import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { isImported, type CalendarMatch } from '@huishouden/pwa-kit/calendar';
import { CalendarImportDialog, CalendarSuggestions, calendarAvailable, useCalendarSearch, useCalendarSuggestions } from '@huishouden/pwa-kit/react/calendar';
import { atTime, toHhmm } from '@huishouden/pwa-kit/time';
import { followUpDay, visitCalendarWords, visitTitle } from '@huishouden/pwa-kit/visit';
import type { User } from 'firebase/auth';
import type { Contact } from '@huishouden/pwa-kit/contacts';
import { ContactDialog } from '@huishouden/pwa-kit/react/contacts';
import { useClock } from '@huishouden/pwa-kit/react/clock';
import { cardClass, primaryButton, Toast, type ToastState } from '@huishouden/pwa-kit/react/ui';
import { useUrlParam } from '@huishouden/pwa-kit/react/url-state';
import { AppFrame, AppOpening } from '@huishouden/pwa-kit/react/frame';
import { personName } from '@huishouden/pwa-kit/people';
import { clearSharedImages, readSharedImages } from '@huishouden/pwa-kit/shared-images';
import { toYmd } from '@huishouden/pwa-kit/time';
import type { Condition, Med, Person, Visit } from './lib/model';
import { fromCalendar } from './lib/visits';
import { VisitDialog, type VisitDraft } from './components/VisitDialog';
import { Visits } from './screens/Visits';
import { guardFor, medLabel, supplyLeft } from './lib/meds';
import { APP } from './lib/publish';
import { CONTACT_ROLES, roleLabel } from './lib/contacts';
import { useT } from './i18n';
import { canAddPeople, canAddVisit, canChangeVisit, canEdit, canKeepConditions, canKeepNotes, canReadConditions } from './lib/people';
import type { HealthStore } from './data/actions';
import { auth } from './data/firebase';
import { healthFrame, useHealthTab, type Account, type TabId } from './components/healthFrame';
import { Photos } from './components/Avatar';
import { PersonDialog } from './components/PersonDialog';
import { MedDialog } from './components/MedDialog';
import { CountDialog, DoseDialog } from './components/DoseDialog';
import { listModel, PrintList } from './components/PrintList';
import { Today } from './screens/Today';
import { Medicines } from './screens/Medicines';
import { History } from './screens/History';
import { People } from './screens/People';
import { Conditions } from './screens/Conditions';
import { ConditionDialog } from './components/ConditionDialog';
import { compareText } from '@huishouden/pwa-kit/i18n';

export { CONTACT_ROLES } from './lib/contacts';

interface Props extends Omit<Account, 'user'> {
  store: HealthStore;
  user: User | null;
  toast: ToastState | null;
  notify: (message: string, undo?: () => void) => void;
  clearToast: () => void;
  banner?: ReactNode;
  deviceSettings?: ReactNode;
}

type Target = { med: Med; slot?: string; slotAt?: number };

const param = (k: string) => new URLSearchParams(location.search).get(k);


/** Everything inside the frame once there is data to show (live or sample). */
export function HealthApp({ store, user, onSignIn, onSignOut, signingIn, toast, notify, clearToast, banner, deviceSettings }: Props) {
  const t = useT();
  const { now } = useClock();
  const { data, actions, role, me } = store;
  // The tab, the person, the visit and the printed list live in the address, so a reload (an update)
  // and Back return to them. A tab is a history entry; picking a person refines it in place.
  const [tab, setTab] = useHealthTab();
  const [selected, setPerson] = useUrlParam('person');
  const [highlight] = useState<string | null>(() => param('med'));
  const [shownVisit] = useUrlParam('visit');
  const [shownCondition] = useState<string | null>(() => param('condition'));
  const [conditionDialog, setConditionDialog] = useState<{ condition: Condition | null; personId: string } | null>(null);
  const [visitDialog, setVisitDialog] = useState<{ visit: Visit | null; draft?: VisitDraft } | null>(null);
  const [importing, setImporting] = useState(false);
  const [draftQueue, setDraftQueue] = useState<VisitDraft[]>([]);
  const calendarSearch = useCalendarSearch(auth, 'Health');
  const [personDialog, setPersonDialog] = useState<{ person: Person | null } | null>(null);
  const [medDialog, setMedDialog] = useState<{ med: Med | null; personId: string; images?: File[] } | null>(null);
  // Photos shared in from the gallery (Share → Health) wait here until there is a person to add a medicine for.
  const [sharedImages, setSharedImages] = useState<File[] | null>(null);
  const [doseDialog, setDoseDialog] = useState<{ target: Target; warning?: string | null; initial?: 'given' | 'skipped' } | null>(null);
  const [count, setCount] = useState<Med | null>(null);
  const [contact, setContact] = useState<{ contact: Contact | null; role?: string } | null>(null);
  const [printFor, setPrint] = useUrlParam('print');

  useEffect(() => {
    document.title = t('app.documentTitle');
  }, [t]);

  useEffect(() => {
    void readSharedImages().then((files) => {
      if (!files) return;
      clearSharedImages();
      if (files.length) setSharedImages(files);
    });
  }, []);

  const people = useMemo(() => [...data.people].sort((a, b) => a.createdAt - b.createdAt || compareText(a.name, b.name)), [data.people]);
  const photos = useMemo(() => new Map(data.photos.map((p) => [p.id, p.data])), [data.photos]);
  const nameOf = (email: string) => (email === me ? t('names.you') : store.names?.get(email) ?? personName(email, { email: me }));
  const personOf = (id: string) => people.find((p) => p.id === id);
  const addable = people.filter((p) => canAddVisit(p, role, me));
  const readsConditions = people.some((p) => canReadConditions(p, role, me));
  const imported = data.visits.map((v) => ({ title: visitTitle(v), at: v.at, calendarEventId: v.calendarEventId, calendarLink: v.calendarLink }));
  // New calendar events that name someone in Health (whose it is is never assumed: one naming nobody waits for Import from calendar).
  const suggested = useCalendarSuggestions({
    auth,
    words: visitCalendarWords(),
    isImported: (m) => isImported(m, imported) || !fromCalendar(m, addable).person,
    app: 'Health',
  });

  /** Calendar events in as visits: whose each is when its words name them; the first naming nobody opens, filled in, to choose. */
  const importEvents = (list: CalendarMatch[]) => {
    let added = 0;
    const ask: VisitDraft[] = [];
    for (const m of list) {
      const { person, input } = fromCalendar(m, addable);
      if (person) {
        actions.saveVisit(null, { ...input, personId: person.id });
        added++;
      } else ask.push({ input });
    }
    if (added) notify(added === 1 ? t('common.added', { name: list.find((m) => fromCalendar(m, addable).person)!.title }) : t('toast.visitsAdded', { count: added }));
    // Each event that named nobody opens in turn, to choose whose it is.
    if (ask.length) {
      setVisitDialog({ visit: null, draft: ask[0] });
      setDraftQueue(ask.slice(1));
    }
  };
  const runImport = () => {
    setImporting(true);
    void calendarSearch.run(visitCalendarWords(), { limit: 25 });
  };
  // The shared label photos open Scan the label in a new medicine for the person on screen, or the first one the viewer may edit.
  useEffect(() => {
    if (!sharedImages) return;
    const person = people.find((p) => p.id === selected && canEdit(p, role, me)) ?? people.find((p) => canEdit(p, role, me));
    if (!person) {
      // Nobody here may add a medicine (a helper, a kid): say so rather than open on Today as if nothing was shared.
      if (people.length) {
        setSharedImages(null);
        notify(t('toast.shareNoEdit'));
      }
      return;
    }
    setSharedImages(null);
    chooseTab('medicines', { person: person.id });
    setMedDialog({ med: null, personId: person.id, images: sharedImages });
  }, [sharedImages, people, selected, role, me, notify, t]);

  // A new tab leaves the last one's deep link (`?med=`, `?visit=`, `?condition=`) and the printed list behind.
  const chooseTab = (id: TabId, also: Record<string, string | null> = {}) => setTab(id, { also: { med: null, visit: null, condition: null, print: null, ...also } });
  // Picking a person or the printed list refines the screen in place: Back leaves the tab, not each pick.
  const choosePerson = (id: string | null) => setPerson(id, { replace: true });
  const print = (id: string | null) => setPrint(id, { replace: true });

  const mark = (target: Target, status: 'given' | 'skipped', at = now, note = '') => {
    const p = personOf(target.med.personId);
    const undo = actions.markDose({ med: target.med, slot: target.slot, at, status, note });
    const med = medLabel(target.med);
    notify(p ? t(status === 'given' ? 'toast.givenFor' : 'toast.skippedFor', { med, name: p.name }) : t(status === 'given' ? 'toast.given' : 'toast.skipped', { med }), undo);
  };
  const onMark = (target: Target, status: 'given' | 'skipped') => {
    if (status === 'given') {
      const { warning } = guardFor(target.med, data.doses, now, nameOf, target.slot);
      if (warning) return setDoseDialog({ target, warning, initial: 'given' });
    }
    mark(target, status);
  };

  const empty = (
    <section className={`${cardClass} max-w-2xl p-6`}>
      {canAddPeople(role) ? (
        <>
          <h2 className="text-xl font-semibold text-ink">{t('empty.title')}</h2>
          <p className="mt-2 text-lg text-muted">{t('empty.body')}</p>
          <button type="button" className={`${primaryButton} mt-4`} onClick={() => setPersonDialog({ person: null })}>
            {t('empty.addPerson')}
          </button>
        </>
      ) : role === 'kid' ? (
        <p className="text-lg text-muted">{t('empty.kid')}</p>
      ) : (
        <p className="text-lg text-muted">{t('empty.noneShared')}</p>
      )}
    </section>
  );

  const printPerson = printFor ? personOf(printFor) : undefined;
  const account = { user, onSignIn, onSignOut, signingIn };
  // The first data still on its way: the opening frame, which counts no view yet; the Conditions tab
  // only when the address is on it, as while the session restored.
  // The toast stays mounted: a first load that fails says so there.
  if (!store.ready) return <AppOpening {...healthFrame(t, account, { id: tab, conditions: tab === 'conditions', choose: (id) => chooseTab(id) })} phase="data" after={<Toast toast={toast} onDone={clearToast} />} />;

  let content: ReactNode;
  if (printPerson) content = <PrintList list={listModel(printPerson, data.meds, data.doses, data.contacts, now, data.conditions)} now={now} onClose={() => print(null)} />;
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
        onOrdered={(m) => notify(t('toast.refillOrdered', { med: medLabel(m) }), actions.refillOrdered(m))}
        onPrint={print}
        empty={empty}
      />
    );
  else if (tab === 'visits')
    content = (
      <Visits
        store={store}
        people={people}
        selected={selected}
        onSelect={choosePerson}
        highlight={shownVisit}
        onAdd={(personId) => setVisitDialog({ visit: null, draft: { personId } })}
        onEdit={(v) => setVisitDialog({ visit: v })}
        onMark={(v, status) => {
          const undo = actions.markVisit(v, status);
          notify(t(status === 'attended' ? 'toast.attended' : status === 'missed' ? 'toast.missed' : 'toast.unmarked', { title: visitTitle(v) }), status ? undo : undefined);
        }}
        onBookFollowUp={(v) => {
          const day = followUpDay(v);
          setVisitDialog({
            visit: null,
            draft: {
              personId: v.personId,
              input: {
                kind: v.kind,
                title: v.title,
                at: day ? atTime(day, v.allDay ? undefined : toHhmm(v.at)) : v.at,
                allDay: v.allDay,
                minutes: v.minutes,
                contactId: v.contactId,
                location: v.location,
                link: v.link,
                prep: v.prep,
                medList: v.medList,
                conditionId: v.conditionId,
                specialty: v.specialty,
                remindBefore: v.remindBefore,
                followUp: v.followUp,
                followUpOf: v.id,
              },
            },
          });
        }}
        onFollowUpDone={(v) => notify(t('toast.followUpDone', { title: visitTitle(v) }), actions.followUpDone(v))}
        onPrint={print}
        nameOf={nameOf}
        onImport={calendarAvailable(user) ? runImport : undefined}
        suggestions={<CalendarSuggestions suggestions={suggested.suggestions} now={now} onAdd={(m) => importEvents([m])} onDismiss={suggested.dismiss} />}
        empty={empty}
      />
    );
  else if (tab === 'conditions' && readsConditions)
    content = (
      <Conditions
        store={store}
        people={people}
        selected={selected}
        onSelect={choosePerson}
        highlight={shownCondition}
        onAdd={(personId) => setConditionDialog({ condition: null, personId })}
        onEdit={(c) => setConditionDialog({ condition: c, personId: c.personId })}
        onShowVisit={(id, visitId) => chooseTab('visits', { person: id, visit: visitId })}
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
          notify(t('toast.removed', { name: c.name }), () => actions.restoreContact(c));
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
        onUnmark={(d) => notify(t('toast.unmarked'), actions.unmarkDoses([d]))}
        onShowMeds={(id) => chooseTab('medicines', { person: id })}
        onShowVisit={(id, visitId) => chooseTab('visits', { person: id, visit: visitId })}
        empty={empty}
      />
    );

  const medPerson = medDialog ? personOf(medDialog.personId) : undefined;
  const conditionPerson = conditionDialog ? personOf(conditionDialog.personId) : undefined;
  const dosePerson = doseDialog ? personOf(doseDialog.target.med.personId) : undefined;

  const dialogs = (
    <>
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
              notify(personDialog.person ? t('toast.saved', { name: input.name.trim() }) : t('common.added', { name: input.name.trim() }));
            }}
            onDelete={
              personDialog.person && canEdit(personDialog.person, role, me)
                ? () => {
                    const bundle = actions.removePerson(personDialog.person!);
                    if (selected === bundle.person.id) choosePerson(null);
                    notify(t('toast.removed', { name: bundle.person.name }), () => actions.restorePerson(bundle));
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
            images={medDialog.images}
            onClose={() => setMedDialog(null)}
            onSave={(input) => {
              actions.saveMed(medDialog.med?.id ?? null, input);
              notify(medDialog.med ? t('toast.saved', { name: medLabel(input) }) : t('toast.addedFor', { med: medLabel(input), name: medPerson.name }));
            }}
            onStop={medDialog.med && !(medDialog.med.endDate && medDialog.med.endDate < toYmd(now)) ? () => notify(t('toast.stopped', { med: medLabel(medDialog.med!) }), actions.stopMed(medDialog.med!)) : undefined}
            onRestart={medDialog.med?.endDate ? () => notify(t('toast.restarted', { med: medLabel(medDialog.med!) }), actions.restartMed(medDialog.med!)) : undefined}
            onDelete={medDialog.med ? () => notify(t('toast.deletedMed', { med: medLabel(medDialog.med!) }), actions.deleteMed(medDialog.med!)) : undefined}
            onAddContact={(r) => setContact({ contact: null, role: r })}
          />
        )}
        {conditionDialog && conditionPerson && canKeepConditions(conditionPerson, role, me) && (
          <ConditionDialog
            key={conditionDialog.condition?.id ?? `new-${conditionDialog.personId}`}
            condition={conditionDialog.condition}
            person={conditionPerson}
            contacts={data.contacts}
            meds={data.meds.filter((m) => m.personId === conditionPerson.id)}
            visits={data.visits.filter((v) => v.personId === conditionPerson.id)}
            now={now}
            onClose={() => setConditionDialog(null)}
            onSave={(input, visitIds) => {
              actions.saveCondition(conditionDialog.condition?.id ?? null, input, visitIds);
              notify(conditionDialog.condition ? t('toast.saved', { name: input.name.trim() }) : t('toast.addedFor', { med: input.name.trim(), name: conditionPerson.name }));
            }}
            onDelete={conditionDialog.condition ? () => notify(t('toast.removed', { name: conditionDialog.condition!.name }), actions.deleteCondition(conditionDialog.condition!)) : undefined}
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
        {count && <CountDialog med={count} left={supplyLeft(count, data.doses)} onClose={() => setCount(null)} onSave={(n, refills) => notify(t('toast.counted', { med: medLabel(count) }), actions.countSupply(count, n, refills))} />}
        {visitDialog && (
          <VisitDialog
            // Each queued calendar event mounts its own dialog, so none keeps the last one's fields.
            key={visitDialog.visit?.id ?? visitDialog.draft?.input?.calendarEventId ?? `new-${draftQueue.length}`}
            visit={visitDialog.visit}
            draft={visitDialog.draft}
            people={visitDialog.visit ? people.filter((p) => p.id === visitDialog.visit!.personId) : addable}
            contacts={data.contacts}
            conditions={data.conditions}
            notes={visitDialog.visit ? data.visitNotes.find((n) => n.id === visitDialog.visit!.id)?.text : undefined}
            canNotes={(id) => {
              const p = personOf(id);
              return !!p && canKeepNotes(p, role, me);
            }}
            now={now}
            onClose={() => {
              setVisitDialog(draftQueue.length ? { visit: null, draft: draftQueue[0] } : null);
              setDraftQueue((q) => q.slice(1));
            }}
            onSave={(input, notes) => {
              const p = personOf(input.personId);
              actions.saveVisit(visitDialog.visit?.id ?? null, input, notes);
              const title = visitTitle(input);
              notify(visitDialog.visit ? t('toast.saved', { name: title }) : t('toast.addedFor', { med: title, name: p?.name ?? '' }));
            }}
            onDelete={
              visitDialog.visit && personOf(visitDialog.visit.personId) && canChangeVisit(visitDialog.visit, personOf(visitDialog.visit.personId)!, role, me)
                ? () => notify(t('toast.removed', { name: visitTitle(visitDialog.visit!) }), actions.deleteVisit(visitDialog.visit!))
                : undefined
            }
            onAddContact={(r) => setContact({ contact: null, role: r })}
          />
        )}
        {importing && (
          <CalendarImportDialog
            state={calendarSearch.state}
            records={imported}
            intro={t('visits.importIntro')}
            noneFound={t('visits.importNone')}
            allImported={t('visits.importAll')}
            onRetry={runImport}
            onAdd={(list) => {
              importEvents(list);
              if (list.some((m) => !fromCalendar(m, addable).person)) setImporting(false);
            }}
            onClose={() => {
              setImporting(false);
              calendarSearch.reset();
            }}
          />
        )}
        {contact && (
          <ContactDialog
            contact={contact.contact}
            app={APP}
            roles={CONTACT_ROLES}
            role={contact.role}
            roleLabel={roleLabel}
            namePlaceholder={t('contacts.namePlaceholder')}
            searchPlaceholder={t('contacts.searchPlaceholder')}
            auth={user ? auth : null}
            canMarkPrivate={role === 'admin' || role === 'member'}
            onClose={() => setContact(null)}
            onSave={(input) => {
              actions.saveContact(contact.contact?.id ?? null, { ...input, private: contact.contact ? input.private : true });
              if (!contact.contact) notify(t('common.added', { name: input.name.trim() }));
            }}
          />
        )}
        <div className="print:hidden">
          <Toast toast={toast} onDone={clearToast} />
        </div>
    </>
  );

  return (
    <Photos.Provider value={photos}>
      <AppFrame
        {...healthFrame(t, account, { id: tab === 'conditions' && !readsConditions ? 'today' : tab, conditions: readsConditions, choose: (id) => chooseTab(id) })}
        after={dialogs}
      >
        {banner && <div className="print:hidden">{banner}</div>}
        {content}
      </AppFrame>
    </Photos.Provider>
  );
}
