// ALL Rule Set storage goes through this module. Two implementations share one
// interface: Firestore (the real thing) and an in-memory store for development
// and tests. Nothing else in the app touches Firestore or localStorage for
// Rule Sets.
import { collection, deleteDoc, doc, onSnapshot, setDoc, updateDoc, type Firestore } from 'firebase/firestore';
import { newId } from '@/lib/ids';
import { getFirebase, isFirebaseConfigured } from '@/lib/firebase';
import { ConfigurationError } from '@/lib/config-error';
import { readLocalRuleSets, writeLocalRuleSets } from './migrations';
import { seedRuleSets } from './seeds';
import type { RuleSet, RuleSetDraft } from './types';

export type { RuleSet, RuleSetDraft } from './types';

type Listener = (ruleSets: RuleSet[]) => void;

export type RuleSetStore = {
  kind: 'memory' | 'firestore';
  // The current list; [] until Firestore delivers its first snapshot.
  getSnapshot(): RuleSet[];
  // Calls the listener immediately with the current list, then on every change.
  subscribe(listener: Listener): () => void;
  create(draft: RuleSetDraft, ownerId: string): Promise<RuleSet>;
  update(id: string, draft: RuleSetDraft): Promise<void>;
  remove(id: string): Promise<void>;
};

// Test and debug hooks. A Playwright fixture sets __taxoTestSeed before the app
// loads to get an in-memory store with exactly that data and no persistence;
// the created store is exposed as __taxoStore so tests read back through it.
declare global {
  interface Window {
    __taxoTestSeed?: RuleSet[];
    __taxoStore?: RuleSetStore;
  }
}

const COLLECTION = 'rulesets';

function stamp(): string {
  return new Date().toISOString();
}

// ---- In-memory -----------------------------------------------------------------

export function createMemoryStore(initial: RuleSet[], persist?: (ruleSets: RuleSet[]) => void): RuleSetStore {
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
    async create(draft, ownerId) {
      const now = stamp();
      const ruleSet: RuleSet = { ...draft, id: newId(), ownerId, createdAt: now, updatedAt: now };
      commit([ruleSet, ...ruleSets]);
      return ruleSet;
    },
    async update(id, draft) {
      commit(ruleSets.map((item) => (item.id === id ? { ...item, ...draft, updatedAt: stamp() } : item)));
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
// signed-in user under the Security Rules).
export function createFirestoreStore(db: Firestore): RuleSetStore {
  let snapshot: RuleSet[] = [];
  const listeners = new Set<Listener>();
  let stopListening: (() => void) | null = null;

  function ensureListening() {
    if (stopListening) return;
    stopListening = onSnapshot(
      collection(db, COLLECTION),
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
    async create(draft, ownerId) {
      const now = stamp();
      const ruleSet: RuleSet = { ...draft, id: newId(), ownerId, createdAt: now, updatedAt: now };
      await setDoc(doc(db, COLLECTION, ruleSet.id), ruleSet);
      return ruleSet;
    },
    async update(id, draft) {
      await updateDoc(doc(db, COLLECTION, id), { ...draft, updatedAt: stamp() });
    },
    async remove(id) {
      await deleteDoc(doc(db, COLLECTION, id));
    },
  };
}

// ---- Selection -----------------------------------------------------------------

// Picks the store for this runtime:
// 1. A test seed on window: in-memory, no persistence (Playwright).
// 2. Firebase configured (and not overridden by VITE_STORE=memory): Firestore.
// 3. Development without Firebase: in-memory, hydrated from and persisted to
//    localStorage so local work survives a refresh.
// 4. Production without Firebase: refuse to start.
export function createStore(): RuleSetStore {
  if (window.__taxoTestSeed) {
    const store = createMemoryStore(window.__taxoTestSeed);
    window.__taxoStore = store;
    return store;
  }

  const forceMemory = import.meta.env.VITE_STORE === 'memory';
  if (isFirebaseConfigured() && !forceMemory) {
    return createFirestoreStore(getFirebase().db);
  }

  if (import.meta.env.PROD) {
    throw new ConfigurationError(
      'Firebase is not configured for this production build. Set the VITE_FIREBASE_* variables at build time; the in-memory store is for development and tests only.',
    );
  }

  const store = createMemoryStore(readLocalRuleSets() ?? seedRuleSets, writeLocalRuleSets);
  window.__taxoStore = store;
  return store;
}
