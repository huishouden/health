import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { PhotoPicker } from '@huishouden/pwa-kit/react/photo';
import { Checkbox, deleteButton, Dialog, Field, ghostButton, inputClass, primaryButton, selectClass } from '@huishouden/pwa-kit/react/ui';
import { householdRole, type Role } from '@huishouden/pwa-kit/roles';
import { isYmd } from '@huishouden/pwa-kit/time';
import { LIMITS, type Person } from '../lib/model';
import type { PersonInput } from '../lib/build';

export function PersonDialog({ person, photo, household, me, nameOf, onSave, onDelete, onClose }: {
  person: Person | null;
  photo?: string;
  household: { members: string[]; roles?: Record<string, Role> };
  me: string;
  nameOf: (email: string) => string;
  /** `photo`: a new data URL, null to remove, undefined unchanged. */
  onSave: (input: PersonInput, photo: string | null | undefined) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const roleOf = (e: string) => householdRole({ members: household.members, roles: household.roles ?? {} }, e);
  // Kids never see medicines, so they can't look after them.
  const candidates = household.members.filter((m) => roleOf(m) !== 'kid');
  const [name, setName] = useState(person?.name ?? '');
  const [birthDate, setBirthDate] = useState(person?.birthDate ?? '');
  const [email, setEmail] = useState(person?.email ?? '');
  const [carers, setCarers] = useState<string[]>(person?.carers ?? (roleOf(me) === 'admin' ? [] : [me]));
  const [allergies, setAllergies] = useState(person?.allergies ?? '');
  const [notes, setNotes] = useState(person?.notes ?? '');
  const [newPhoto, setNewPhoto] = useState<string | null | undefined>(undefined);
  const [confirm, setConfirm] = useState(false);
  // A member who isn't an admin must stay among the carers, or they could no longer see the person.
  const mustStay = roleOf(me) !== 'admin' && email !== me ? me : null;
  const valid = name.trim().length > 0 && (!birthDate || isYmd(birthDate));
  const shownPhoto = newPhoto === undefined ? photo : newPhoto;

  const toggle = (e: string, on: boolean) => setCarers((list) => (on ? [...list.filter((x) => x !== e), e] : list.filter((x) => x !== e)));
  const makeMain = (e: string) => setCarers((list) => [e, ...list.filter((x) => x !== e)]);

  const save = () => {
    if (!valid) return;
    const list = mustStay && !carers.includes(mustStay) ? [...carers, mustStay] : carers;
    onSave({ name, birthDate: birthDate || undefined, email: email || undefined, carers: list, allergies, notes }, newPhoto);
    onClose();
  };

  return (
    <Dialog
      title={person ? `Edit ${person.name}` : 'New person'}
      onClose={onClose}
      footer={
        <>
          {onDelete &&
            (confirm ? (
              <button type="button" className={deleteButton} onClick={() => (onDelete(), onClose())}>
                <Trash2 size={18} /> Remove with all medicines and history
              </button>
            ) : (
              <button type="button" className={deleteButton} onClick={() => setConfirm(true)}>
                <Trash2 size={18} /> Remove
              </button>
            ))}
          <button type="button" className={ghostButton} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={primaryButton} disabled={!valid} onClick={save}>
            Save
          </button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div className="flex items-center gap-4">
          <PhotoPicker
            photo={shownPhoto}
            label={`${name.trim() || 'Their'} photo`}
            size={72}
            fallback={<span className="inline-flex h-18 w-18 items-center justify-center rounded-full bg-forest-600 text-2xl font-semibold text-white">{(name.trim()[0] ?? '?').toUpperCase()}</span>}
            onSave={setNewPhoto}
            onRemove={shownPhoto ? () => setNewPhoto(null) : undefined}
          />
          <div className="grid flex-1 gap-3 sm:grid-cols-2">
            <Field label="Name">
              <input className={inputClass} value={name} maxLength={LIMITS.name} onChange={(e) => setName(e.target.value)} placeholder="Oma Ria" autoComplete="off" />
            </Field>
            <Field label="Birthday (optional)">
              <input className={inputClass} type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
            </Field>
          </div>
        </div>
        <Field label="Their own account" hint="When they are a member of the household, they see their own medicines.">
          <select className={selectClass} value={email} onChange={(e) => setEmail(e.target.value)}>
            <option value="">No account (a child, a grandparent)</option>
            {candidates.map((m) => (
              <option key={m} value={m}>
                {nameOf(m)}
              </option>
            ))}
          </select>
        </Field>
        <fieldset>
          <legend className="mb-1.5 block text-sm font-medium text-stone-700">Who looks after their medicines</legend>
          <p className="mb-2 text-sm text-stone-600">They see this person's medicines and mark doses. The first is reminded at each dose time; the others hear when a dose isn't marked.</p>
          <ul className="space-y-1">
            {candidates.map((m) => {
              const on = carers.includes(m) || m === mustStay;
              const main = carers[0] === m;
              return (
                <li key={m} className="flex flex-wrap items-center gap-2">
                  <Checkbox checked={on} onChange={(v) => (m === mustStay ? undefined : toggle(m, v))}>
                    {nameOf(m)}
                    {roleOf(m) === 'helper' ? ' (helper)' : ''} <span className="text-sm text-stone-600">{m}</span>
                  </Checkbox>
                  {on && (main ? <span className="text-sm text-forest-700">Reminded first</span> : <button type="button" className="min-h-11 rounded-xl px-2 text-sm text-stone-600 hover:bg-stone-100" onClick={() => makeMain(m)}>Remind first</button>)}
                </li>
              );
            })}
          </ul>
          <p className="mt-1 text-sm text-stone-600">Admins always see everyone's medicines.</p>
        </fieldset>
        <Field label="Allergies (optional)">
          <input className={inputClass} value={allergies} maxLength={LIMITS.allergies} onChange={(e) => setAllergies(e.target.value)} placeholder="Penicillin" autoComplete="off" />
        </Field>
        <Field label="Notes (optional)">
          <textarea className={`${inputClass} min-h-20`} value={notes} maxLength={LIMITS.notes} onChange={(e) => setNotes(e.target.value)} placeholder="How they take tablets, what helps" />
        </Field>
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}
