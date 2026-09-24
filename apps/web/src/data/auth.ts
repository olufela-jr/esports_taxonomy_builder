// ALL sign-in state goes through this module, the way store.ts owns storage.
// Two implementations share one interface: Firebase Auth with Google sign-in
// (the real thing) and a fixed local user for the in-memory store, so
// development and tests need no Firebase.
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut as firebaseSignOut, type Auth } from 'firebase/auth';
import { getFirebase } from '@/lib/firebase';
import type { RuleSetStore } from './store';

export type User = {
  uid: string;
  name: string;
  email: string | null;
};

// undefined: not known yet (Firebase is restoring the session). null: signed out.
type Listener = (user: User | null | undefined) => void;

export type AuthSession = {
  kind: 'memory' | 'firebase';
  getUser(): User | null | undefined;
  // Calls the listener immediately with the current user, then on every change.
  subscribe(listener: Listener): () => void;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
};

// The in-memory store's user. Seed and fixture Rule Sets owned by "you" are editable.
export const LOCAL_USER: User = { uid: 'you', name: 'Local user', email: null };

// ---- In-memory -----------------------------------------------------------------

export function createMemoryAuth(): AuthSession {
  let user: User | null = LOCAL_USER;
  const listeners = new Set<Listener>();

  function set(next: User | null) {
    user = next;
    listeners.forEach((listener) => listener(next));
  }

  return {
    kind: 'memory',
    getUser: () => user,
    subscribe(listener) {
      listeners.add(listener);
      listener(user);
      return () => { listeners.delete(listener); };
    },
    async signIn() { set(LOCAL_USER); },
    async signOut() { set(null); },
  };
}

// ---- Firebase ------------------------------------------------------------------

export function createFirebaseAuth(auth: Auth): AuthSession {
  let user: User | null | undefined = undefined;
  const listeners = new Set<Listener>();

  onAuthStateChanged(auth, (firebaseUser) => {
    user = firebaseUser
      ? { uid: firebaseUser.uid, name: firebaseUser.displayName || firebaseUser.email || 'Signed in', email: firebaseUser.email }
      : null;
    listeners.forEach((listener) => listener(user));
  });

  return {
    kind: 'firebase',
    getUser: () => user,
    subscribe(listener) {
      listeners.add(listener);
      listener(user);
      return () => { listeners.delete(listener); };
    },
    async signIn() { await signInWithPopup(auth, new GoogleAuthProvider()); },
    async signOut() { await firebaseSignOut(auth); },
  };
}

// ---- Selection -----------------------------------------------------------------

// The session follows the store: Firebase Auth alongside Firestore, the local
// user alongside the in-memory store.
export function createAuth(storeKind: RuleSetStore['kind']): AuthSession {
  return storeKind === 'firestore' ? createFirebaseAuth(getFirebase().auth) : createMemoryAuth();
}
