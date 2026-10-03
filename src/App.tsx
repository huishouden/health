import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { signInSilently } from '@huishouden/pwa-kit/auth';
import { markJoined, saveMyProfile, watchHousehold, type Household, type HouseholdState } from '@huishouden/pwa-kit/household';
import { auth, db, googleClientId, signInWithGoogle, signOutEverywhere } from './data/firebase';
import { useLiveStore } from './data/useLiveStore';
import { useDemoStore } from './data/useDemoStore';
import { DEMO_NOW } from './lib/demo';
import { ClockProvider } from '@huishouden/pwa-kit/react/clock';
import { HealthApp } from './HealthApp';
import { Header } from './components/Header';
import { cardClass, primaryButton, SampleBanner, useToast } from '@huishouden/pwa-kit/react/ui';
import { PORTAL_URL } from './lib/portal';
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
      if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') setSignInError("Couldn't sign in. Try again.");
    } finally {
      setSigningIn(false);
    }
  }, []);
  const signOut = useCallback(() => void signOutEverywhere(), []);

  const frame = { onSignIn: signIn, onSignOut: signOut, signingIn };

  if (user === undefined) return <Plain user={null} {...frame} hideSignIn />;
  if (user === null) return <DemoApp {...frame} signInError={signInError} />;
  return <SignedIn key={user.uid} user={user} {...frame} />;
}

interface FrameProps {
  onSignIn: () => void;
  onSignOut: () => void;
  signingIn: boolean;
}

function SignedIn({ user, ...frame }: FrameProps & { user: User }) {
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
  if (state.status === 'loading') return <Plain user={user} {...frame}>Finding your household.</Plain>;
  if (state.status === 'error')
    return (
      <Plain user={user} {...frame}>
        Couldn't reach the household. Check the connection; the app retries on its own.
      </Plain>
    );
  return (
    <Plain user={user} {...frame}>
      <h2 className="text-2xl font-semibold text-stone-800">Not in a household yet</h2>
      <p className="mt-2">
        {user.email} isn't a member of a Huishouden household. Ask someone in your household to invite this address from the Huishouden home screen, then open
        Health again. If you use another Google account for the household, sign out and sign in with that one.
      </p>
      <a className={`${primaryButton} mt-5`} href={PORTAL_URL}>
        Open Huishouden
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
  const { toast, notify, clear } = useToast();
  const store = useDemoStore(read);
  const banner = <SampleBanner text="An invented household: a grandmother, a child and a parent. Nothing is saved. Sign in to use your household’s own." notice={signInError ?? undefined} />;
  return <HealthApp store={store} user={null} {...frame} toast={toast} notify={notify} clearToast={clear} banner={banner} />;
}

function Plain({ user, children, hideSignIn, ...frame }: FrameProps & { user: User | null; children?: ReactNode; hideSignIn?: boolean }) {
  return (
    <div className="flex min-h-dvh flex-col bg-cream font-sans text-stone-800 antialiased">
      <Header tabs={[]} tab="" onTab={() => {}} user={hideSignIn ? undefined : user} {...frame} />
      <main className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6">
        {children && <div className={`${cardClass} max-w-2xl p-6 text-lg text-stone-600`}>{children}</div>}
      </main>
    </div>
  );
}
