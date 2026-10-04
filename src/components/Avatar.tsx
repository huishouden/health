import { createContext, useContext } from 'react';
import { Chip } from '@huishouden/pwa-kit/react/ui';
import type { Person } from '../lib/model';
import { useT } from '../i18n';

/** Each person's photo (a data URL) by person id, provided once by the app. */
export const Photos = createContext<ReadonlyMap<string, string>>(new Map());

const COLOURS = ['#2d6a4f', '#94452f', '#5b7a99', '#8a6f9e', '#6f8f72', '#a8735a'];

/** A person's round mark: their photo, or their initial on a muted colour of their own. */
export function Avatar({ person, people, size = 40 }: { person: Person | undefined; people: Person[]; size?: number }) {
  const photo = useContext(Photos).get(person?.id ?? '');
  if (photo) return <img src={photo} alt="" width={size} height={size} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} aria-hidden="true" />;
  const i = Math.max(0, people.findIndex((p) => p.id === person?.id));
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, backgroundColor: COLOURS[i % COLOURS.length], fontSize: Math.round(size * 0.42) }}
      aria-hidden="true"
    >
      {(person?.name.trim()[0] ?? '?').toUpperCase()}
    </span>
  );
}

/** "Everyone" plus one chip per person, when there is more than one. */
export function PersonChips({ people, selected, onSelect }: { people: Person[]; selected: string | null; onSelect: (id: string | null) => void }) {
  const t = useT();
  if (people.length < 2) return null;
  return (
    <div role="group" aria-label={t('tab.people')} className="flex flex-wrap gap-2 print:hidden">
      <Chip active={selected === null} onClick={() => onSelect(null)}>
        {t('people.everyone')}
      </Chip>
      {people.map((p) => (
        <Chip key={p.id} active={selected === p.id} onClick={() => onSelect(p.id)}>
          {p.name}
        </Chip>
      ))}
    </div>
  );
}
