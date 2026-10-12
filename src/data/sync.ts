import { useEffect, useRef } from 'react';
import { reportError, setSensitiveWords } from '@huishouden/pwa-kit/observability';
import { appUrl } from '@huishouden/pwa-kit/site';
import type { Role } from '@huishouden/pwa-kit/roles';
import type { HealthData } from '../lib/demo';
import { APP, sensitiveWords } from '../lib/publish';
import { schedulePublish } from '../lib/schedule-publish';
import { db } from './firebase';
import { publishHealth } from './publish-run';

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
      await publishHealth(db, householdId, me, input, { onError: (e, what) => !cancelled && reportError(e, { where: `publish health ${what}` }) });
    };
    const stop = schedulePublish(run);
    return () => {
      cancelled = true;
      stop();
    };
  }, [ready, role, householdId, me, data, household]);
}
