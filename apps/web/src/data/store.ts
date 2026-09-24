// ALL Rule Set storage goes through this module. Two implementations share one
// interface: Firestore (the real thing) and an in-memory store for development
// and tests. Nothing else in the app touches Firestore or localStorage for
// Rule Sets.
//
// v3: a store is bound to one signed-in session (tenant and uid). Every
// Firestore path sits under tenants/{tenantId}, and every write stamps the
// caller's uid as updatedBy, which the Security Rules require.
import { collection, deleteDoc, doc, onSnapshot, runTransaction, setDoc, type Firestore } from 'firebase/firestore';
import { newId } from '@/lib/ids';
import { getFirebase } from '@/lib/firebase';
import { readLocalRuleSets, writeLocalRuleSets } from './migrations';
import type { Mode } from './mode';
import { seedRuleSets } from './seeds';
import type { RuleSet, RuleSetDraft } from './types';

export type { RuleSet, RuleSetDraft } from './types';

type Listener = (ruleSets: RuleSet[]) => void;

// Who the store writes as: the signed-in user's tenant and uid.
export type StoreSession = {
  tenantId: string;
  uid: string;
};

export type RuleSetStore = {
  kind: Mode;
  // The current list; [] until Firestore delivers its first snapshot.
  getSnapshot(): RuleSet[];
  // Calls the listener immediately with the current list, then on every change.
  subscribe(listener: Listener): () => void;
  create(draft: RuleSetDraft): Promise<RuleSet>;
  // baseUpdatedAt is the updatedAt the editor loaded. If the stored document
  // has moved on since (someone else saved first), the update is refused with
  // a ConflictError instead of overwriting their work. Resolves to the new
  // updatedAt so the editor can carry on from it.
  update(id: string, draft: RuleSetDraft, baseUpdatedAt: string): Promise<string>;
  remove(id: string): Promise<void>;
};

// A save was refused because the stored Rule Set is not the one the editor loaded.
export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

const CHANGED_MESSAGE = 'This Rule Set changed since you opened it. Reload it to see the latest version, then reapply your edits.';
const DELETED_MESSAGE = 'This Rule Set was deleted since you opened it.';

// Test and debug hooks. A Playwright fixture sets __taxoTestSeed before the app
// loads to get an in-memory store with exactly that data and no persistence;
// the created store is exposed as __taxoStore so tests read back through it.
declare global {
  interface Window {
    __taxoTestSeed?: RuleSet[];
    __taxoStore?: RuleSetStore;
  }
}

// The Rule Sets collection of one tenant.
export function ruleSetsPath(tenantId: string): string {
  return `tenants/${tenantId}/rulesets`;
}

function stamp(): string {
  return new Date().toISOString();
}

// ---- In-memory -----------------------------------------------------------------

export function createMemoryStore(initial: RuleSet[], session: StoreSession, persist?: (ruleSets: RuleSet[]) => void): RuleSetStore {
  let ruleSets = initial;
  const listeners = new Set<Listener>();

  function commit(next: RuleSet[]) {
    ruleSets = next;
    persist?.(next);
    listeners.forEach((listener) => listener(next));
  }

  return {
    kind: 'memory',
    getSnapshot: () => ruleSets,
    subscribe(listener) {
      listeners.add(listener);
      listener(ruleSets);
      return () => { listeners.delete(listener); };
    },
    async create(draft) {
      const now = stamp();
      const ruleSet: RuleSet = { ...draft, id: newId(), createdBy: session.uid, updatedBy: session.uid, createdAt: now, updatedAt: now };
      commit([ruleSet, ...ruleSets]);
      return ruleSet;
    },
    async update(id, draft, baseUpdatedAt) {
      const current = ruleSets.find((item) => item.id === id);
      if (!current) throw new ConflictError(DELETED_MESSAGE);
      if (current.updatedAt !== baseUpdatedAt) throw new ConflictError(CHANGED_MESSAGE);
      const updatedAt = stamp();
      commit(ruleSets.map((item) => (item.id === id ? { ...item, ...draft, updatedBy: session.uid, updatedAt } : item)));
      return updatedAt;
    },
    async remove(id) {
      commit(ruleSets.filter((item) => item.id !== id));
    },
  };
}

// ---- Firestore -----------------------------------------------------------------

function byNewestFirst(a: RuleSet, b: RuleSet): number {
  return b.createdAt.localeCompare(a.createdAt);
}

// Listening starts with the first subscriber and stops with the last, so nothing
// is read before sign-in and nothing stays open after sign-out (reads need a
// signed-in tenant member under the Security Rules).
export function createFirestoreStore(db: Firestore, session: StoreSession): RuleSetStore {
  const path = ruleSetsPath(session.tenantId);
  let snapshot: RuleSet[] = [];
  const listeners = new Set<Listener>();
  let stopListening: (() => void) | null = null;

  function ensureListening() {
    if (stopListening) return;
    stopListening = onSnapshot(
      collection(db, path),
      (result) => {
        // The document shape is the RuleSet type; Security Rules enforce it on write.
        snapshot = result.docs.map((item) => item.data() as RuleSet).sort(byNewestFirst);
        listeners.forEach((listener) => listener(snapshot));
      },
      (error) => {
        // Firestore ends the listener on an error (permission denied after a
        // sign-out, for example); forget it so the next subscriber starts a new one.
        console.error('Rule Set subscription failed', error);
        stopListening = null;
      },
    );
  }

  function stopIfIdle() {
    if (listeners.size > 0 || !stopListening) return;
    stopListening();
    stopListening = null;
    snapshot = [];
  }

  return {
    kind: 'firestore',
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      ensureListening();
      listener(snapshot);
      return () => {
        listeners.delete(listener);
        stopIfIdle();
      };
    },
    async create(draft) {
      const now = stamp();
      const ruleSet: RuleSet = { ...draft, id: newId(), createdBy: session.uid, updatedBy: session.uid, createdAt: now, updatedAt: now };
      await setDoc(doc(db, path, ruleSet.id), ruleSet);
      return ruleSet;
    },
    async update(id, draft, baseUpdatedAt) {
      // A transaction so the check and the write are one atomic step on the server.
      const ref = doc(db, path, id);
      const updatedAt = stamp();
      await runTransaction(db, async (transaction) => {
        const current = await transaction.get(ref);
        if (!current.exists()) throw new ConflictError(DELETED_MESSAGE);
        if ((current.data() as RuleSet).updatedAt !== baseUpdatedAt) throw new ConflictError(CHANGED_MESSAGE);
        transaction.update(ref, { ...draft, updatedBy: session.uid, updatedAt });
      });
      return updatedAt;
    },
    async remove(id) {
      await deleteDoc(doc(db, path, id));
    },
  };
}

// ---- Selection -----------------------------------------------------------------

// One store per session, kept for the page's lifetime: signing out and back in
// as the same user reuses it (in memory mode the data must survive that), and
// a Firestore listener is never opened twice for one tenant.
const stores = new Map<string, RuleSetStore>();

// The store for the mode decided in mode.ts and the signed-in session. In
// memory mode a Playwright test seed wins over browser-local data, and neither
// persists past the session except the local development data, which
// round-trips through localStorage.
export function createStore(mode: Mode, session: StoreSession): RuleSetStore {
  const cacheKey = `${mode}:${session.tenantId}:${session.uid}`;
  const cached = stores.get(cacheKey);
  if (cached) return cached;

  let store: RuleSetStore;
  if (mode === 'firestore') {
    store = createFirestoreStore(getFirebase().db, session);
  } else {
    store = window.__taxoTestSeed
      ? createMemoryStore(window.__taxoTestSeed, session)
      : createMemoryStore(readLocalRuleSets() ?? seedRuleSets, session, writeLocalRuleSets);
    window.__taxoStore = store;
  }
  stores.set(cacheKey, store);
  return store;
}
