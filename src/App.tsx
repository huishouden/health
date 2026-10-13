import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { signInSilently } from '@huishouden/pwa-kit/auth';
import { markJoined, saveMyProfile, watchHousehold, type Household, type HouseholdState } from '@huishouden/pwa-kit/household';
import { auth, db, googleClientId, signInWithGoogle, signOutEverywhere } from './data/firebase';
import { useLiveStore } from './data/useLiveStore';
import { useDemoStore } from './data/useDemoStore';
import { DEMO_NOW } from './lib/demo';
import { ClockProvider } from '@huishouden/pwa-kit/react/clock';
import { HealthApp, TAB_IDS, tabs, type TabId } from './HealthApp';
import { useUrlTab } from '@huishouden/pwa-kit/react/url-state';
import { Header } from './components/Header';
import { Frame } from './components/Frame';
import { cardClass, primaryButton, SampleBanner, ScreenSkeleton, useToast } from '@huishouden/pwa-kit/react/ui';
import { PORTAL_URL } from './lib/portal';
import { t, useT } from './i18n';
import { NotificationsCard } from '@huishouden/pwa-kit/react/push';

export default function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [signingIn, setSigningIn] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);

  useEffect(() => onAuthStateChanged(auth, (u) => setUser(u)), []);

  // Signs in without a click when the browser is signed in to Google and has used the app before.
  useEffect(() => {
    if (googleClientId) void signInSilently(auth, googleClientId);
  }, []);

  const signIn = useCallback(async () => {
    setSigningIn(true);
    setSignInError(null);
    try {
      await signInWithGoogle();
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') setSignInError(t('signIn.failed'));
    } finally {
      setSigningIn(false);
    }
  }, []);
  const signOut = useCallback(() => void signOutEverywhere(), []);

  const frame = { onSignIn: signIn, onSignOut: signOut, signingIn };

  if (user === undefined) return <Opening user={undefined} {...frame} />;
  if (user === null) return <DemoApp {...frame} signInError={signInError} />;
  return <SignedIn key={user.uid} user={user} {...frame} />;
}

interface FrameProps {
  onSignIn: () => void;
  onSignOut: () => void;
  signingIn: boolean;
}

function SignedIn({ user, ...frame }: FrameProps & { user: User }) {
  const t = useT();
  const email = (user.email ?? '').toLowerCase();
  const [state, setState] = useState<HouseholdState>({ status: 'loading' });
  useEffect(() => (email ? watchHousehold(db, email, setState) : undefined), [email]);
  const household = state.status === 'ready' ? state.household : null;
  useEffect(() => {
    if (household) markJoined(db, household, email).catch(() => {});
  }, [household, email]);
  // Members' names and photos come from their own sign-ins (shown in the portal and on entries).
  const householdId = household?.id;
  useEffect(() => {
    if (householdId) saveMyProfile(db, householdId, user).catch(() => {});
  }, [householdId, user]);

  if (state.status === 'ready') return <LiveApp householdId={state.household.id} household={state.household} user={user} {...frame} />;
  if (state.status === 'loading') return <Opening user={user} {...frame} label={t('household.finding')} />;
  if (state.status === 'error')
    return (
      <Plain user={user} {...frame}>
        {t('household.unreachable')}
      </Plain>
    );
  return (
    <Plain user={user} {...frame}>
      <h2 className="text-2xl font-semibold text-ink">{t('household.noneTitle')}</h2>
      <p className="mt-2">{t('household.none', { email: user.email ?? '' })}</p>
      <a className={`${primaryButton} mt-5`} href={PORTAL_URL}>
        {t('household.openPortal')}
      </a>
    </Plain>
  );
}

function LiveApp({ householdId, household, user, ...frame }: FrameProps & { householdId: string; household: Household; user: User }) {
  const { toast, notify, fail, clear } = useToast();
  const store = useLiveStore(householdId, (user.email ?? '').toLowerCase(), household, fail);
  const read = useCallback(() => Date.now(), []);
  return (
    <ClockProvider read={read}>
      <HealthApp
        store={store}
        user={user}
        {...frame}
        toast={toast}
        notify={notify}
        clearToast={clear}
        deviceSettings={
          <NotificationsCard
            db={db}
            householdId={householdId}
            user={user}
            app="health"
            vapidKey={import.meta.env.VITE_VAPID_PUBLIC_KEY}
            offText="Get a notification here when a medicine is due for someone you look after, and when a dose hasn't been marked."
            onText="On. This device tells you when a medicine is due for someone you look after, and when a dose hasn't been marked."
          />
        }
      />
    </ClockProvider>
  );
}

/** Signed out: the app with invented sample data, so it can be tried and screenshotted. */
function DemoApp({ signInError, ...frame }: FrameProps & { signInError: string | null }) {
  const loadedAt = useMemo(() => Date.now(), []);
  // The sample's clock starts at a fixed moment in 2031 and then runs normally.
  const read = useCallback(() => DEMO_NOW + (Date.now() - loadedAt), [loadedAt]);
  return (
    <ClockProvider read={read}>
      <DemoInner read={read} {...frame} signInError={signInError} />
    </ClockProvider>
  );
}

function DemoInner({ read, signInError, ...frame }: FrameProps & { read: () => number; signInError: string | null }) {
  const t = useT();
  const { toast, notify, clear } = useToast();
  const store = useDemoStore(read);
  const banner = <SampleBanner text={t('demo.banner')} notice={signInError ?? undefined} />;
  return <HealthApp store={store} user={null} {...frame} toast={toast} notify={notify} clearToast={clear} banner={banner} />;
}

/**
 * While the app opens (the session restoring, the household loading): the app's own frame and tabs
 * over the kit's placeholder, so nothing flashes or jumps before the first screen arrives.
 */
function Opening({ user, label, ...frame }: FrameProps & { user: User | null | undefined; label?: string }) {
  const t = useT();
  const [tab, setTab] = useUrlTab(TAB_IDS, 'today');
  // Who may read conditions is known only once the data arrives: the tab shows here only when the
  // address is on it, so it never appears and then vanishes for someone who can't see it.
  return (
    <Frame
      header={<Header tabs={tabs(t, tab === 'conditions')} tab={tab} onTab={(id) => setTab(id as TabId)} user={user} {...frame} opening />}
      main={<ScreenSkeleton label={label ?? t('app.loading')} />}
    />
  );
}

function Plain({ user, children, ...frame }: FrameProps & { user: User | null; children?: ReactNode }) {
  return <Frame header={<Header tabs={[]} tab="" onTab={() => {}} user={user} {...frame} />} main={children && <div className={`${cardClass} max-w-2xl p-6 text-lg text-muted`}>{children}</div>} />;
}
