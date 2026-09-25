// ALL storage goes through this module. Two implementations share one
// interface: Firestore (the real thing) and an in-memory store for development
// and tests. Nothing else in the app touches Firestore or localStorage.
//
// v3: a store is bound to one signed-in session (tenant and uid) and holds the
// tenant's collections: Rule Sets and, from phase 2, shared definitions, plus a
// read-only view of the tenant document. Every Firestore path sits under
// tenants/{tenantId}, and every write stamps the caller's uid as updatedBy,
// which the Security Rules require.
import { collection, deleteDoc, doc, onSnapshot, runTransaction, setDoc, type Firestore } from 'firebase/firestore';
import { newId } from '@/lib/ids';
import { getFirebase } from '@/lib/firebase';
import { readLocalDefinitions, readLocalRuleSets, writeLocalDefinitions, writeLocalRuleSets } from './migrations';
import type { Mode } from './mode';
import { seedDefinitions, seedRuleSets } from './seeds';
import type { Audit, Definition, DefinitionDraft, RuleSet, RuleSetDraft, Tenant } from './types';

export type { Definition, DefinitionDraft, RuleSet, RuleSetDraft, Tenant } from './types';

// Who the store writes as: the signed-in user's tenant and uid.
export type StoreSession = {
  tenantId: string;
  uid: string;
};

// Every stored document: its own fields plus the audit fields and an id.
type Stored = Audit & { id: string };

// One collection of one tenant. T is the stored document, Draft what an editor
// hands over (the document minus id and audit fields).
export type Collection<T extends Stored, Draft> = {
  // The current list; [] until Firestore delivers its first snapshot.
  getSnapshot(): T[];
  // Calls the listener immediately with the current list, then on every change.
  subscribe(listener: (items: T[]) => void): () => void;
  create(draft: Draft): Promise<T>;
  // baseUpdatedAt is the updatedAt the editor loaded. If the stored document
  // has moved on since (someone else saved first), the update is refused with
  // a ConflictError instead of overwriting their work. Resolves to the new
  // updatedAt so the editor can carry on from it.
  update(id: string, draft: Draft, baseUpdatedAt: string): Promise<string>;
  remove(id: string): Promise<void>;
};

// The tenant document, read only: the app needs its platform list.
export type TenantReader = {
  getSnapshot(): Tenant | null;
  subscribe(listener: (tenant: Tenant | null) => void): () => void;
};

export type Store = {
  kind: Mode;
  ruleSets: Collection<RuleSet, RuleSetDraft>;
  definitions: Collection<Definition, DefinitionDraft>;
  tenant: TenantReader;
};

// A save was refused because the stored document is not the one the editor loaded.
export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

const CHANGED_MESSAGE = 'This changed since you opened it. Reload it to see the latest version, then reapply your edits.';
const DELETED_MESSAGE = 'This was deleted since you opened it.';

// Test and debug hooks. A Playwright fixture sets __taxoTestSeed (Rule Sets)
// and optionally __taxoTestDefinitions before the app loads to get an in-memory
// store with exactly that data and no persistence; the created store is
// exposed as __taxoStore so tests read back through it.
declare global {
  interface Window {
    __taxoTestSeed?: RuleSet[];
    __taxoTestDefinitions?: Definition[];
    __taxoStore?: Store;
  }
}

export function ruleSetsPath(tenantId: string): string {
  return `tenants/${tenantId}/rulesets`;
}

export function definitionsPath(tenantId: string): string {
  return `tenants/${tenantId}/definitions`;
}

function stamp(): string {
  return new Date().toISOString();
}

function byNewestFirst(a: Stored, b: Stored): number {
  return b.createdAt.localeCompare(a.createdAt);
}

// ---- In-memory -----------------------------------------------------------------

function memoryCollection<T extends Stored, Draft>(initial: T[], session: StoreSession, persist?: (items: T[]) => void): Collection<T, Draft> {
  let items = initial;
  const listeners = new Set<(items: T[]) => void>();

  function commit(next: T[]) {
    items = next;
    persist?.(next);
    listeners.forEach((listener) => listener(next));
  }

  return {
    getSnapshot: () => items,
    subscribe(listener) {
      listeners.add(listener);
      listener(items);
      return () => { listeners.delete(listener); };
    },
    async create(draft) {
      const now = stamp();
      const item = { ...draft, id: newId(), createdBy: session.uid, updatedBy: session.uid, createdAt: now, updatedAt: now } as unknown as T;
      commit([item, ...items]);
      return item;
    },
    async update(id, draft, baseUpdatedAt) {
      const current = items.find((item) => item.id === id);
      if (!current) throw new ConflictError(DELETED_MESSAGE);
      if (current.updatedAt !== baseUpdatedAt) throw new ConflictError(CHANGED_MESSAGE);
      const updatedAt = stamp();
      commit(items.map((item) => (item.id === id ? ({ ...item, ...draft, updatedBy: session.uid, updatedAt } as T) : item)));
      return updatedAt;
    },
    async remove(id) {
      commit(items.filter((item) => item.id !== id));
    },
  };
}

function memoryTenant(session: StoreSession): TenantReader {
  const now = '2026-09-24T00:00:00.000Z';
  const tenant: Tenant = { id: session.tenantId, name: 'Local workspace', config: { allowedDatasets: [], platforms: [] }, createdAt: now, updatedAt: now };
  return {
    getSnapshot: () => tenant,
    subscribe(listener) {
      listener(tenant);
      return () => {};
    },
  };
}

export function createMemoryStore(ruleSets: RuleSet[], definitions: Definition[], session: StoreSession, persist?: { ruleSets: (items: RuleSet[]) => void; definitions: (items: Definition[]) => void }): Store {
  return {
    kind: 'memory',
    ruleSets: memoryCollection<RuleSet, RuleSetDraft>(ruleSets, session, persist?.ruleSets),
    definitions: memoryCollection<Definition, DefinitionDraft>(definitions, session, persist?.definitions),
    tenant: memoryTenant(session),
  };
}

// ---- Firestore -----------------------------------------------------------------

// Listening starts with the first subscriber and stops with the last, so nothing
// is read before sign-in and nothing stays open after sign-out (reads need a
// signed-in tenant member under the Security Rules).
function firestoreCollection<T extends Stored, Draft>(db: Firestore, path: string, session: StoreSession): Collection<T, Draft> {
  let snapshot: T[] = [];
  const listeners = new Set<(items: T[]) => void>();
  let stopListening: (() => void) | null = null;

  function ensureListening() {
    if (stopListening) return;
    stopListening = onSnapshot(
      collection(db, path),
      (result) => {
        // The document shape is the stored type; Security Rules enforce it on write.
        snapshot = result.docs.map((item) => item.data() as T).sort(byNewestFirst);
        listeners.forEach((listener) => listener(snapshot));
      },
      (error) => {
        // Firestore ends the listener on an error (permission denied after a
        // sign-out, for example); forget it so the next subscriber starts a new one.
        console.error(`Subscription to ${path} failed`, error);
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
      const item = { ...draft, id: newId(), createdBy: session.uid, updatedBy: session.uid, createdAt: now, updatedAt: now } as unknown as T;
      await setDoc(doc(db, path, item.id), item);
      return item;
    },
    async update(id, draft, baseUpdatedAt) {
      // A transaction so the check and the write are one atomic step on the server.
      const ref = doc(db, path, id);
      const updatedAt = stamp();
      await runTransaction(db, async (transaction) => {
        const current = await transaction.get(ref);
        if (!current.exists()) throw new ConflictError(DELETED_MESSAGE);
        if ((current.data() as T).updatedAt !== baseUpdatedAt) throw new ConflictError(CHANGED_MESSAGE);
        transaction.update(ref, { ...draft, updatedBy: session.uid, updatedAt });
      });
      return updatedAt;
    },
    async remove(id) {
      await deleteDoc(doc(db, path, id));
    },
  };
}

function firestoreTenant(db: Firestore, session: StoreSession): TenantReader {
  let snapshot: Tenant | null = null;
  const listeners = new Set<(tenant: Tenant | null) => void>();
  let stopListening: (() => void) | null = null;

  function ensureListening() {
    if (stopListening) return;
    stopListening = onSnapshot(
      doc(db, `tenants/${session.tenantId}`),
      (result) => {
        snapshot = result.exists() ? (result.data() as Tenant) : null;
        listeners.forEach((listener) => listener(snapshot));
      },
      (error) => {
        console.error('Tenant subscription failed', error);
        stopListening = null;
      },
    );
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      ensureListening();
      listener(snapshot);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && stopListening) {
          stopListening();
          stopListening = null;
          snapshot = null;
        }
      };
    },
  };
}

export function createFirestoreStore(db: Firestore, session: StoreSession): Store {
  return {
    kind: 'firestore',
    ruleSets: firestoreCollection<RuleSet, RuleSetDraft>(db, ruleSetsPath(session.tenantId), session),
    definitions: firestoreCollection<Definition, DefinitionDraft>(db, definitionsPath(session.tenantId), session),
    tenant: firestoreTenant(db, session),
  };
}

// ---- Selection -----------------------------------------------------------------

// One store per session, kept for the page's lifetime: signing out and back in
// as the same user reuses it (in memory mode the data must survive that), and
// a Firestore listener is never opened twice for one tenant.
const stores = new Map<string, Store>();

// The store for the mode decided in mode.ts and the signed-in session. In
// memory mode a Playwright test seed wins over browser-local data, and neither
// persists past the session except the local development data, which
// round-trips through localStorage.
export function createStore(mode: Mode, session: StoreSession): Store {
  const cacheKey = `${mode}:${session.tenantId}:${session.uid}`;
  const cached = stores.get(cacheKey);
  if (cached) return cached;

  let store: Store;
  if (mode === 'firestore') {
    store = createFirestoreStore(getFirebase().db, session);
  } else {
    store = window.__taxoTestSeed
      ? createMemoryStore(window.__taxoTestSeed, window.__taxoTestDefinitions ?? [], session)
      : createMemoryStore(readLocalRuleSets() ?? seedRuleSets, readLocalDefinitions() ?? seedDefinitions, session, { ruleSets: writeLocalRuleSets, definitions: writeLocalDefinitions });
    window.__taxoStore = store;
  }
  stores.set(cacheKey, store);
  return store;
}
