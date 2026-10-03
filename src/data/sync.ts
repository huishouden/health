import { useEffect, useRef } from 'react';
import { syncPersonalAgenda } from '@huishouden/pwa-kit/agenda';
import { syncPersonalTodos } from '@huishouden/pwa-kit/todos';
import { syncPersonalReminders } from '@huishouden/pwa-kit/reminders';
import { reportError, setSensitiveWords } from '@huishouden/pwa-kit/observability';
import { appUrl } from '@huishouden/pwa-kit/site';
import type { Role } from '@huishouden/pwa-kit/roles';
import type { HealthData } from '../lib/demo';
import { agendaItems, APP, reminderItems, sensitiveWords, todoItems } from '../lib/publish';
import { db } from './firebase';

/** Waits this long after a change before publishing, so a run of taps writes once. */
const SETTLE_MS = 3_000;
/** And republishes this often while the app stays open (the shared tablet), so the reminders ahead stay a week deep. */
const REFRESH_MS = 30 * 60_000;

/**
 * Keeps what Health publishes for the household current: the portal's agenda and to-dos and the
 * push reminders, all for named people only. Runs on every device that can see a person (their
 * carers, the admins), each syncing the items that name its member; a kid's device runs nothing.
 * Also keeps the names it holds out of every error report and usage count.
 */
export function useHealthSync(householdId: string, me: string, data: HealthData, ready: boolean, household: { members: string[]; roles?: Record<string, Role> }, role: Role | null) {
  useEffect(() => {
    setSensitiveWords(APP, sensitiveWords(data.people, data.meds));
  }, [data.people, data.meds]);

  const latest = useRef({ data, household });
  latest.current = { data, household };

  useEffect(() => {
    if (!ready || !role || role === 'kid') return;
    let cancelled = false;
    const run = async () => {
      const { data: d, household: h } = latest.current;
      const input = { people: d.people, meds: d.meds, doses: d.doses, household: h, now: Date.now(), url: (path: string) => appUrl(import.meta.env.BASE_URL, path) };
      try {
        await syncPersonalAgenda(db, householdId, APP, agendaItems(input), { by: me });
        await syncPersonalTodos(db, householdId, APP, todoItems(input), { by: me });
        await syncPersonalReminders(db, householdId, APP, reminderItems(input), me);
      } catch (e) {
        if (!cancelled) reportError(e, { where: 'publish health' });
      }
    };
    const settle = setTimeout(run, SETTLE_MS);
    const refresh = setInterval(run, REFRESH_MS);
    return () => {
      cancelled = true;
      clearTimeout(settle);
      clearInterval(refresh);
    };
  }, [ready, role, householdId, me, data, household]);
}
