import { initApp } from '@huishouden/pwa-kit/app';

// From VITE_FIREBASE_* build variables: CI sets them from repo variables; locally `bun run env:pull`.
// Auth kept in IndexedDB, observability, Google API tokens, and Firestore's persistent cache with the
// kit's outbox, so a dose marked just before the app closes is kept.
export const { app, auth, db, googleClientId, signInWithGoogle, signOutEverywhere } = initApp({ app: 'health', env: import.meta.env });
