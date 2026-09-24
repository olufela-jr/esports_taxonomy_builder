import { ConfigurationError } from '@/lib/config-error';
import { isFirebaseConfigured } from '@/lib/firebase';

// The runtime mode is decided once, before anyone signs in, and both the
// session (auth.ts) and the store (store.ts) follow it:
// 1. A test seed on window: in-memory, no persistence (Playwright).
// 2. Firebase configured (and not overridden by VITE_STORE=memory): Firestore
//    behind Firebase Auth.
// 3. Development without Firebase: in-memory, persisted to localStorage.
// 4. Production without Firebase: refuse to start.
export type Mode = 'memory' | 'firestore';

export function detectMode(): Mode {
  if (window.__taxoTestSeed) return 'memory';

  const forceMemory = import.meta.env.VITE_STORE === 'memory';
  if (isFirebaseConfigured() && !forceMemory) return 'firestore';

  if (import.meta.env.PROD) {
    throw new ConfigurationError(
      'Firebase is not configured for this production build. Set the VITE_FIREBASE_* variables at build time; the in-memory store is for development and tests only.',
    );
  }
  return 'memory';
}
