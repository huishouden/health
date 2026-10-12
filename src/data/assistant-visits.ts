import { collection, getDocs, query, where, type Firestore } from 'firebase/firestore';
import { PERSONAL_AGENDA, toAgendaItem } from '@huishouden/pwa-kit/agenda';
import { visitNoteDoc } from '@huishouden/pwa-kit/visit';
import { commitOps } from '@huishouden/pwa-kit/firestore';
import type { Role } from '@huishouden/pwa-kit/roles';
import type { HealthData } from '../lib/demo';
import { canKeepNotes } from '../lib/people';
import { fromAssistantItem } from '../lib/visits';

/**
 * The assistant's appointments from before Health had visits (`personalAgenda` items of app
 * `assistant`, `appointment:<person>:<id>`) become visits under the same id, with their notes, and
 * the old item goes. One query (the member's own assistant items), then one commit; `data()` is read
 * after the query, so what it decides on is current. Returns how many items it moved (each moved item's
 * old agenda item is deleted); items it can't move (another person's, not this member's to keep) stay.
 */
export async function moveAssistantVisits(db: Firestore, base: string, me: string, role: Role | null, data: () => Pick<HealthData, 'people' | 'visits'>, now: number): Promise<number> {
  const snap = await getDocs(query(collection(db, base, PERSONAL_AGENDA), where('app', '==', 'assistant'), where('audience', 'array-contains', me)));
  const d = data();
  const ops: { col: string; id: string; data: Record<string, unknown> | null }[] = [];
  let count = 0;
  for (const doc of snap.docs) {
    const moved = fromAssistantItem(toAgendaItem(doc.id, doc.data()), me);
    const person = moved && d.people.find((p) => p.id === moved.visit.personId);
    if (!moved || !person || !canKeepNotes(person, role, me)) continue;
    if (!d.visits.some((v) => v.id === moved.visit.id)) {
      const { id, ...visit } = moved.visit;
      ops.push({ col: `healthPeople/${person.id}/visits`, id, data: visit as unknown as Record<string, unknown> });
      if (moved.notes) ops.push({ col: `healthPeople/${person.id}/visitNotes`, id, data: { ...visitNoteDoc(person.id, moved.notes, me, now), via: 'assistant' } });
    }
    ops.push({ col: PERSONAL_AGENDA, id: doc.id, data: null });
    count++;
  }
  if (ops.length) await commitOps(db, base, ops);
  return count;
}
