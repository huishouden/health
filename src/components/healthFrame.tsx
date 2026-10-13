import { CalendarCheck, CalendarClock, History as HistoryIcon, Pill, Stethoscope, Users } from 'lucide-react';
import type { User } from 'firebase/auth';
import { AppOpening, type AppFrameProps, type OpeningPhase } from '@huishouden/pwa-kit/react/frame';
import { trackView } from '@huishouden/pwa-kit/observability';
import type { Tab } from '@huishouden/pwa-kit/react/ui';
import { useUrlTab } from '@huishouden/pwa-kit/react/url-state';
import { PORTAL_URL } from '../lib/portal';
import { useT } from '../i18n';

/** The tabs, in order: the one list the type, the address (`useUrlTab`) and the content follow. */
export const TAB_IDS = ['today', 'medicines', 'visits', 'conditions', 'history', 'people'] as const;
export type TabId = (typeof TAB_IDS)[number];

// The phone's bottom bar: Today, Medicines, Visits, History; Conditions and People under More.
// Conditions only for those who read someone's (helper carers and kids never see the tab).
export const tabs = (t: ReturnType<typeof useT>, conditions: boolean): Tab[] => [
  { id: 'today', label: t('tab.today'), icon: CalendarCheck, primary: true },
  { id: 'medicines', label: t('tab.medicines'), icon: Pill, primary: true },
  { id: 'visits', label: t('tab.visits'), icon: CalendarClock, primary: true },
  ...(conditions ? [{ id: 'conditions', label: t('tab.conditions'), icon: Stethoscope }] : []),
  { id: 'history', label: t('tab.history'), icon: HistoryIcon, primary: true },
  { id: 'people', label: t('tab.people'), icon: Users },
];

/** The tab on screen, in the address (`?tab=medicines`), so a reload and Back return to it. */
export const useHealthTab = () => useUrlTab(TAB_IDS, 'today');

/** Who is signed in and the app bar's sign-in controls. `user` is undefined while the session restores. */
export interface Account {
  user: User | null | undefined;
  signingIn: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
}

const VERSION = `${import.meta.env.VITE_APP_VERSION} (${import.meta.env.VITE_BUILD_SHA})`;

/**
 * Health's frame (the kit's `AppFrame`): the same props while the app opens and once it has loaded,
 * so nothing moves between them. The frame never prints (the kit's tailwind.css); the page prints on
 * white without its padding. Without `tab`, no tabs (a note outside the app's sections).
 */
export function healthFrame(
  t: ReturnType<typeof useT>,
  account: Account,
  tab?: { id: TabId; conditions: boolean; choose: (id: TabId) => void },
): AppFrameProps {
  return {
    app: t('app.name'),
    glyph: 'pill',
    portalUrl: PORTAL_URL,
    version: VERSION,
    ...account,
    onView: trackView,
    layout: 'page',
    className: 'print:bg-white',
    mainClassName: 'print:p-0',
    ...(tab && { tabs: tabs(t, tab.conditions), tab: tab.id, onTab: (id: string) => tab.choose(id as TabId) }),
  };
}

/**
 * The app while it opens: the kit's opening frame with Health's tabs and the one in the address.
 * Who may read conditions is known only once the data arrives: the tab shows here only when the
 * address is on it, so it never appears and then vanishes for someone who can't see it.
 */
export function HealthOpening({ phase, ...account }: Account & { phase: OpeningPhase }) {
  const t = useT();
  const [tab, setTab] = useHealthTab();
  return <AppOpening {...healthFrame(t, account, { id: tab, conditions: tab === 'conditions', choose: setTab })} phase={phase} />;
}
