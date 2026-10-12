import type { Firestore } from 'firebase/firestore';
import { localizeAgenda, syncPersonalAgenda } from '@huishouden/pwa-kit/agenda';
import { localizeTodos, syncPersonalTodos } from '@huishouden/pwa-kit/todos';
import { localizeReminders, syncPersonalReminders } from '@huishouden/pwa-kit/reminders';
import { agendaItems, APP, reminderItems, todoItems, type PublishInput } from '../lib/publish';

type PublishedStorage = NonNullable<Parameters<typeof syncPersonalAgenda>[4]['published']>;

export interface PublishHealthOptions {
  /** Where this device notes what it last published (default localStorage; null reads every time). */
  published?: PublishedStorage | null;
  /** One part refused or failed: the others still publish. */
  onError?: (e: unknown, what: 'reminders' | 'agenda' | 'to-dos') => void;
}

/**
 * One publish of what Health shows the household for `me`: the push reminders, the portal's agenda
 * and its to-dos, one query each (none when this device already published the same). Reminders
 * first: a medicine's reminders turned off must reach the sender before the app is closed. Each on
 * its own: one refused doesn't keep the others from publishing (its result is null). Every
 * language's words, so each reader sees them in their own.
 */
export async function publishHealth(db: Firestore, householdId: string, me: string, input: PublishInput, { published, onError }: PublishHealthOptions = {}) {
  const opts = published === undefined ? {} : { published };
  const part = async <R>(what: 'reminders' | 'agenda' | 'to-dos', sync: () => Promise<R>): Promise<R | null> => {
    try {
      return await sync();
    } catch (e) {
      onError?.(e, what);
      return null;
    }
  };
  const reminders = await part('reminders', async () => syncPersonalReminders(db, householdId, APP, await localizeReminders(() => reminderItems(input)), me, input.now, opts));
  const agenda = await part('agenda', async () => syncPersonalAgenda(db, householdId, APP, await localizeAgenda(() => agendaItems(input)), { by: me, now: input.now, ...opts }));
  const todos = await part('to-dos', async () => syncPersonalTodos(db, householdId, APP, await localizeTodos(() => todoItems(input)), { by: me, now: input.now, ...opts }));
  return { reminders, agenda, todos };
}
