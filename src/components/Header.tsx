import { useEffect } from 'react';
import type { User } from 'firebase/auth';
import { AppBar } from '@huishouden/pwa-kit/react/app-bar';
import { SectionTabs, type Tab } from '@huishouden/pwa-kit/react/ui';
import { trackView } from '@huishouden/pwa-kit/observability';
import { PORTAL_URL } from '../lib/portal';
import { useT } from '../i18n';

export type { Tab } from '@huishouden/pwa-kit/react/ui';

interface Props {
  tabs: Tab[];
  tab: string;
  onTab: (id: string) => void;
  /** Undefined while the session is being restored: show neither the avatar nor Sign in. */
  user: User | null | undefined;
  onSignIn: () => void;
  onSignOut: () => void;
  signingIn?: boolean;
}

const VERSION = `${import.meta.env.VITE_APP_VERSION} (${import.meta.env.VITE_BUILD_SHA})`;

/** The kit's Huishouden app bar with Health's sections as its tabs. */
export function Header({ tabs, tab, onTab, user, onSignIn, onSignOut, signingIn }: Props) {
  const t = useT();
  // Counts which tabs are used (anonymous, per visit; see the portal's /privacy page).
  useEffect(() => {
    trackView(tab);
  }, [tab]);
  return (
    <AppBar app={t('app.name')} glyph="pill" portalUrl={PORTAL_URL} version={VERSION} user={user} signingIn={signingIn} onSignIn={onSignIn} onSignOut={onSignOut}>
      <SectionTabs tabs={tabs} tab={tab} onTab={onTab} />
    </AppBar>
  );
}
