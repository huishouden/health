import { useEffect, useRef } from 'react';
import { localizeAgenda, syncPersonalAgenda } from '@huishouden/pwa-kit/agenda';
import { localizeTodos, syncPersonalTodos } from '@huishouden/pwa-kit/todos';
import { localizeReminders, syncPersonalReminders } from '@huishouden/pwa-kit/reminders';
import { reportError, setSensitiveWords } from '@huishouden/pwa-kit/observability';
import { appUrl } from '@huishouden/pwa-kit/site';
import type { Role } from '@huishouden/pwa-kit/roles';
import type { HealthData } from '../lib/demo';
import { agendaItems, APP, reminderItems, sensitiveWords, todoItems } from '../lib/publish';
import { schedulePublish } from '../lib/schedule-publish';
import { db } from './firebase';

/**
 * Keeps what Health publishes for the household current: the portal's agenda and to-dos and the
 * push reminders, all for named people only. Runs on every device that can see a person (their
 * carers, the admins), each syncing the items that name its member; a kid's device runs nothing.
 * Also keeps the names it holds out of every error report and usage count.
 */
export function useHealthSync(householdId: string, me: string, data: HealthData, ready: boolean, household: { members: string[]; roles?: Record<string, Role> }, role: Role | null) {
  useEffect(() => {
    setSensitiveWords(APP, sensitiveWords(data.people, data.meds, data.visits, data.conditions));
  }, [data.people, data.meds, data.visits, data.conditions]);

  const latest = useRef({ data, household });
  latest.current = { data, household };

  useEffect(() => {
    if (!ready || !role || role === 'kid') return;
    let cancelled = false;
    const run = async () => {
      const { data: d, household: h } = latest.current;
      const input = { people: d.people, meds: d.meds, doses: d.doses, visits: d.visits, contacts: d.contacts, household: h, now: Date.now(), url: (path: string) => appUrl(import.meta.env.BASE_URL, path) };
      // Every language's words, so each reader sees the agenda, to-dos and notifications in their own.
      // Reminders first: a medicine's reminders turned off must reach the sender before the app is
      // closed. Each on its own: one refused doesn't keep the others from publishing.
      const publish = async (what: string, sync: () => Promise<unknown>) => {
        try {
          await sync();
        } catch (e) {
          if (!cancelled) reportError(e, { where: `publish health ${what}` });
        }
      };
      await publish('reminders', async () => syncPersonalReminders(db, householdId, APP, await localizeReminders(() => reminderItems(input)), me));
      await publish('agenda', async () => syncPersonalAgenda(db, householdId, APP, await localizeAgenda(() => agendaItems(input)), { by: me }));
      await publish('to-dos', async () => syncPersonalTodos(db, householdId, APP, await localizeTodos(() => todoItems(input)), { by: me }));
    };
    const stop = schedulePublish(run);
    return () => {
      cancelled = true;
      stop();
    };
  }, [ready, role, householdId, me, data, household]);
}
