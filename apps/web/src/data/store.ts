// ALL storage goes through this module. Two implementations share one
// interface: Firestore (the real thing) and an in-memory store for development
// and tests. Nothing else in the app touches Firestore or localStorage.
//
// v3: a store is bound to one signed-in session (tenant and uid) and holds the
// tenant's collections: Rule Sets and, from phase 2, shared definitions, plus a
// read-only view of the tenant document. Every Firestore path sits under
// tenants/{tenantId}, and every write stamps the caller's uid as updatedBy,
// which the Security Rules require.
import { collection, deleteDoc, doc, onSnapshot, query, runTransaction, setDoc, where, type Firestore } from 'firebase/firestore';
import { newId } from '@/lib/ids';
import { LOCAL_TENANT_ID } from './auth';
import { getFirebase } from '@/lib/firebase';
import { readLocalDefinitions, readLocalDrafts, readLocalRequests, readLocalRuleSets, writeLocalDefinitions, writeLocalDrafts, writeLocalRequests, writeLocalRuleSets } from './migrations';
import type { Mode } from './mode';
import { seedDefinitions, seedRuleSets } from './seeds';
import type { Audit, BuildDraft, BuildDraftDraft, Definition, DefinitionDraft, Invite, RuleSet, RuleSetDraft, Tenant, TenantUser, ValueRequest, ValueRequestDraft } from './types';

export type { BuildDraft, BuildDraftDraft, Definition, DefinitionDraft, Invite, RuleSet, RuleSetDraft, Tenant, TenantUser, ValueRequest, ValueRequestDraft } from './types';

// Who the store writes as: the signed-in user's tenant, uid and role. The role
// decides what the requests subscription may ask for: an admin lists every
// request, a standard user only their own, which is all the rules let them read.
export type StoreSession = {
  tenantId: string;
  uid: string;
  // The caller's role in this tenant ('user' for a super user looking at a
  // tenant they are not a member of).
  role: 'admin' | 'user';
  // May list everything the rules let an admin list: an admin, or the super user.
  readAll: boolean;
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

// A read-only list of one tenant: the members mirror and the invites, which
// only the membership Functions write (through data/members.ts). A standard
// user's reader stays empty, since the rules let only admins list them.
export type ListReader<T> = {
  getSnapshot(): T[];
  subscribe(listener: (items: T[]) => void): () => void;
};

// The memory-mode list behind a ListReader, replaceable by the in-memory
// members service so the Members screen works without Firebase.
export type MemoryList<T> = ListReader<T> & { replace(items: T[]): void };

export type Store = {
  kind: Mode;
  ruleSets: Collection<RuleSet, RuleSetDraft>;
  definitions: Collection<Definition, DefinitionDraft>;
  requests: Collection<ValueRequest, ValueRequestDraft>;
  drafts: Collection<BuildDraft, BuildDraftDraft>;
  tenant: TenantReader;
  members: ListReader<TenantUser>;
  invites: ListReader<Invite>;
  // Memory mode only: the lists the in-memory members service writes.
  memory?: { members: MemoryList<TenantUser>; invites: MemoryList<Invite> };
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
    __taxoTestRequests?: ValueRequest[];
    __taxoTestDrafts?: BuildDraft[];
    __taxoTestMembers?: TenantUser[];
    __taxoTestInvites?: Invite[];
    __taxoStore?: Store;
  }
}

export function ruleSetsPath(tenantId: string): string {
  return `tenants/${tenantId}/rulesets`;
}

export function definitionsPath(tenantId: string): string {
  return `tenants/${tenantId}/definitions`;
}

export function requestsPath(tenantId: string): string {
  return `tenants/${tenantId}/requests`;
}

export function draftsPath(tenantId: string): string {
  return `tenants/${tenantId}/drafts`;
}

export function membersPath(tenantId: string): string {
  return `tenants/${tenantId}/users`;
}

export function invitesPath(tenantId: string): string {
  return `tenants/${tenantId}/invites`;
}

function byName(a: TenantUser, b: TenantUser): number {
  return (a.name || a.email || a.uid).localeCompare(b.name || b.email || b.uid);
}

function byNewestInvite(a: Invite, b: Invite): number {
  return b.createdAt.localeCompare(a.createdAt);
}

function stamp(): string {
  return new Date().toISOString();
}

function byNewestFirst(a: Stored, b: Stored): number {
  return b.createdAt.localeCompare(a.createdAt);
}

// ---- In-memory -----------------------------------------------------------------

// visible: which stored items this session may see (the rules' read filter,
// applied here so memory mode behaves like Firestore for a standard user).
function memoryCollection<T extends Stored, Draft>(initial: T[], session: StoreSession, persist?: (items: T[]) => void, visible: (item: T) => boolean = () => true): Collection<T, Draft> {
  let items = initial;
  const listeners = new Set<(items: T[]) => void>();

  function commit(next: T[]) {
    items = next;
    persist?.(next);
    listeners.forEach((listener) => listener(next.filter(visible)));
  }

  return {
    getSnapshot: () => items.filter(visible),
    subscribe(listener) {
      listeners.add(listener);
      listener(items.filter(visible));
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

function memoryList<T>(initial: T[], sort: (a: T, b: T) => number): MemoryList<T> {
  let items = [...initial].sort(sort);
  const listeners = new Set<(items: T[]) => void>();
  return {
    getSnapshot: () => items,
    subscribe(listener) {
      listeners.add(listener);
      listener(items);
      return () => { listeners.delete(listener); };
    },
    replace(next) {
      items = [...next].sort(sort);
      listeners.forEach((listener) => listener(items));
    },
  };
}

// In memory mode the signed-in local user is always a member; a test seed may
// add others.
function memoryMembers(session: StoreSession, seed: TenantUser[] | undefined): TenantUser[] {
  const self: TenantUser = { uid: session.uid, email: null, name: 'Local user', role: session.role, updatedAt: '2026-09-24T00:00:00.000Z' };
  const others = (seed ?? []).filter((member) => member.uid !== session.uid);
  return [self, ...others];
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

// A standard user sees only their own requests; an admin sees every one.
function requestVisible(session: StoreSession): (request: ValueRequest) => boolean {
  return session.readAll ? () => true : (request) => request.createdBy === session.uid;
}

// Drafts follow the same visibility as requests: own, or all for an admin.
function draftVisible(session: StoreSession): (draft: BuildDraft) => boolean {
  return session.readAll ? () => true : (draft) => draft.createdBy === session.uid;
}

export function createMemoryStore(ruleSets: RuleSet[], definitions: Definition[], requests: ValueRequest[], drafts: BuildDraft[], session: StoreSession, persist?: { ruleSets: (items: RuleSet[]) => void; definitions: (items: Definition[]) => void; requests: (items: ValueRequest[]) => void; drafts: (items: BuildDraft[]) => void }, members?: TenantUser[], invites?: Invite[]): Store {
  // Admins see the whole list; a standard user's readers stay empty, as under the rules.
  const memberList = memoryList<TenantUser>(session.readAll ? memoryMembers(session, members) : [], byName);
  const inviteList = memoryList<Invite>(session.readAll ? invites ?? [] : [], byNewestInvite);
  return {
    kind: 'memory',
    ruleSets: memoryCollection<RuleSet, RuleSetDraft>(ruleSets, session, persist?.ruleSets),
    definitions: memoryCollection<Definition, DefinitionDraft>(definitions, session, persist?.definitions),
    requests: memoryCollection<ValueRequest, ValueRequestDraft>(requests, session, persist?.requests, requestVisible(session)),
    drafts: memoryCollection<BuildDraft, BuildDraftDraft>(drafts, session, persist?.drafts, draftVisible(session)),
    tenant: memoryTenant(session),
    members: memberList,
    invites: inviteList,
    memory: { members: memberList, invites: inviteList },
  };
}

// ---- Firestore -----------------------------------------------------------------

// Listening starts with the first subscriber and stops with the last, so nothing
// is read before sign-in and nothing stays open after sign-out (reads need a
// signed-in tenant member under the Security Rules).
// ownOnly: subscribe to the caller's own documents only (createdBy == uid),
// the filter the Security Rules require of a standard user listing requests.
function firestoreCollection<T extends Stored, Draft>(db: Firestore, path: string, session: StoreSession, ownOnly = false): Collection<T, Draft> {
  let snapshot: T[] = [];
  const listeners = new Set<(items: T[]) => void>();
  let stopListening: (() => void) | null = null;

  function ensureListening() {
    if (stopListening) return;
    stopListening = onSnapshot(
      ownOnly ? query(collection(db, path), where('createdBy', '==', session.uid)) : collection(db, path),
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

// enabled: false gives a reader that never listens (a standard user may not
// list members or invites under the rules).
function firestoreList<T>(db: Firestore, path: string, enabled: boolean, sort: (a: T, b: T) => number): ListReader<T> {
  let snapshot: T[] = [];
  const listeners = new Set<(items: T[]) => void>();
  let stopListening: (() => void) | null = null;

  function ensureListening() {
    if (stopListening || !enabled) return;
    stopListening = onSnapshot(
      collection(db, path),
      (result) => {
        snapshot = result.docs.map((item) => item.data() as T).sort(sort);
        listeners.forEach((listener) => listener(snapshot));
      },
      (error) => {
        console.error(`Subscription to ${path} failed`, error);
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
          snapshot = [];
        }
      };
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
    requests: firestoreCollection<ValueRequest, ValueRequestDraft>(db, requestsPath(session.tenantId), session, !session.readAll),
    drafts: firestoreCollection<BuildDraft, BuildDraftDraft>(db, draftsPath(session.tenantId), session, !session.readAll),
    tenant: firestoreTenant(db, session),
    members: firestoreList<TenantUser>(db, membersPath(session.tenantId), session.readAll, byName),
    invites: firestoreList<Invite>(db, invitesPath(session.tenantId), session.readAll, byNewestInvite),
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
  const cacheKey = `${mode}:${session.tenantId}:${session.uid}:${session.role}:${session.readAll}`;
  const cached = stores.get(cacheKey);
  if (cached) return cached;

  let store: Store;
  if (mode === 'firestore') {
    store = createFirestoreStore(getFirebase().db, session);
  } else if (session.tenantId !== LOCAL_TENANT_ID) {
    // A super user looking at another (memory) tenant: it starts empty.
    store = createMemoryStore([], [], [], [], session, undefined, [], []);
    window.__taxoStore = store;
  } else {
    store = window.__taxoTestSeed
      ? createMemoryStore(window.__taxoTestSeed, window.__taxoTestDefinitions ?? [], window.__taxoTestRequests ?? [], window.__taxoTestDrafts ?? [], session, undefined, window.__taxoTestMembers, window.__taxoTestInvites)
      : createMemoryStore(readLocalRuleSets() ?? seedRuleSets, readLocalDefinitions() ?? seedDefinitions, readLocalRequests() ?? [], readLocalDrafts() ?? [], session, { ruleSets: writeLocalRuleSets, definitions: writeLocalDefinitions, requests: writeLocalRequests, drafts: writeLocalDrafts });
    window.__taxoStore = store;
  }
  stores.set(cacheKey, store);
  return store;
}
