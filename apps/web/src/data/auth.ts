// ALL sign-in state goes through this module, the way store.ts owns storage.
// Two implementations share one interface: Firebase Auth with Google sign-in
// (the real thing) and a fixed local user for the in-memory store, so
// development and tests need no Firebase.
//
// v3: a user belongs to exactly one tenant and holds one role in it. Both
// come from custom claims on the ID token (`tenantId`, `role`), set
// server-side by the provisioning script; the app only reads them.
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut as firebaseSignOut, type Auth, type User as FirebaseUser } from 'firebase/auth';
import { getFirebase } from '@/lib/firebase';
import type { Mode } from './mode';

export type Role = 'admin' | 'user';

export type User = {
  uid: string;
  name: string;
  email: string | null;
  // null: the account has no workspace yet (claims not set). The app shows
  // the "no workspace" screen instead of the shell.
  tenantId: string | null;
  role: Role | null;
  // The super user (a separate claim): reads every tenant, creates tenants,
  // invites their first admin; writes inside a tenant only as an admin there.
  superuser: boolean;
};

// undefined: not known yet (Firebase is restoring the session). null: signed out.
type Listener = (user: User | null | undefined) => void;

export type AuthSession = {
  kind: Mode;
  getUser(): User | null | undefined;
  // Calls the listener immediately with the current user, then on every change.
  subscribe(listener: Listener): () => void;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  // Re-reads the claims (a fresh token) after provisioning, without a new sign-in.
  refreshClaims(): Promise<void>;
};

// Test hook: a Playwright fixture sets __taxoTestRole before the app loads to
// run the in-memory session as a standard user; admin otherwise.
declare global {
  interface Window {
    __taxoTestRole?: Role;
    __taxoTestSuper?: boolean;
    // A signed-in account with no workspace yet, for the "No workspace yet" screen.
    __taxoTestNoWorkspace?: boolean;
  }
}

// The in-memory store's tenant and user. Admin by default so development can
// author; seed and fixture Rule Sets all live in this one tenant.
export const LOCAL_TENANT_ID = 'local';

export function localUser(role: Role, superuser = false): User {
  return { uid: 'you', name: 'Local user', email: null, tenantId: LOCAL_TENANT_ID, role, superuser };
}

function isRole(value: unknown): value is Role {
  return value === 'admin' || value === 'user';
}

// The user as the app sees it, from the Firebase user and its token claims.
// Anything missing or malformed reads as "no workspace", never as a guess.
function userFromClaims(firebaseUser: FirebaseUser, claims: Record<string, unknown>): User {
  return {
    uid: firebaseUser.uid,
    name: firebaseUser.displayName || firebaseUser.email || 'Signed in',
    email: firebaseUser.email,
    tenantId: typeof claims.tenantId === 'string' && claims.tenantId ? claims.tenantId : null,
    role: isRole(claims.role) ? claims.role : null,
    superuser: claims.superuser === true,
  };
}

// ---- In-memory -----------------------------------------------------------------

export function createMemoryAuth(role: Role = window.__taxoTestRole ?? 'admin', superuser: boolean = window.__taxoTestSuper ?? false): AuthSession {
  const current = (): User => (window.__taxoTestNoWorkspace ? { ...localUser(role, superuser), email: 'you@local.test', tenantId: null, role: null } : localUser(role, superuser));
  let user: User | null = current();
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
    async signIn() { set(current()); },
    async signOut() { set(null); },
    async refreshClaims() { set(current()); },
  };
}

// ---- Firebase ------------------------------------------------------------------

export function createFirebaseAuth(auth: Auth): AuthSession {
  let user: User | null | undefined = undefined;
  const listeners = new Set<Listener>();

  function set(next: User | null | undefined) {
    user = next;
    listeners.forEach((listener) => listener(next));
  }

  // Reads the claims from the token; forceRefresh fetches a new token so
  // claims set since sign-in show up.
  async function load(firebaseUser: FirebaseUser | null, forceRefresh: boolean) {
    if (!firebaseUser) {
      set(null);
      return;
    }
    const token = await firebaseUser.getIdTokenResult(forceRefresh);
    set(userFromClaims(firebaseUser, token.claims));
  }

  onAuthStateChanged(auth, (firebaseUser) => { void load(firebaseUser, false); });

  return {
    kind: 'firestore',
    getUser: () => user,
    subscribe(listener) {
      listeners.add(listener);
      listener(user);
      return () => { listeners.delete(listener); };
    },
    async signIn() { await signInWithPopup(auth, new GoogleAuthProvider()); },
    async signOut() { await firebaseSignOut(auth); },
    async refreshClaims() { await load(auth.currentUser, true); },
  };
}

// ---- Selection -----------------------------------------------------------------

export function createAuth(mode: Mode): AuthSession {
  return mode === 'firestore' ? createFirebaseAuth(getFirebase().auth) : createMemoryAuth();
}
