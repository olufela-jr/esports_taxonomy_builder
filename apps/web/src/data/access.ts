// ALL access-request calls go through this module: a signed-in account with
// no workspace asking for one, and the super user deciding which workspace and
// role it gets. Requests live at accessRequests/{uid} (outside tenants/, since
// the person asking has none). Only the Functions write them
// (functions/src/access.ts holds the rules); the requester follows their own
// and the super user reads the queue straight from Firestore, as the Security
// Rules allow. Memory mode keeps one shared list so both screens work in
// development and Playwright.
import { collection, doc, onSnapshot, type Firestore } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { getFirebase } from '@/lib/firebase';
import type { Role } from './auth';
import type { Mode } from './mode';

export type AccessRequestStatus = 'pending' | 'approved' | 'declined';

export type AccessRequest = {
  uid: string;
  email: string;
  name: string;
  status: AccessRequestStatus;
  // Set when approved: where the person went and as what.
  tenantId: string | null;
  role: Role | null;
  decidedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RequestOutcome =
  | { status: 'member' }
  | { status: 'requested'; request: AccessRequest };

// Used from the "No workspace yet" screen, before any store exists.
export type AccessRequester = {
  request(): Promise<RequestOutcome>;
  // Calls the listener with the caller's own request (null while there is none), then on every change.
  watch(uid: string, listener: (request: AccessRequest | null) => void): () => void;
};

// The super user's queue: every request, newest first.
export type AccessQueue = {
  getSnapshot(): AccessRequest[];
  subscribe(listener: (requests: AccessRequest[]) => void): () => void;
  approve(uid: string, tenantId: string, role: Role): Promise<AccessRequest>;
  decline(uid: string): Promise<AccessRequest>;
};

// Test hook: access requests a memory-mode session starts with.
declare global {
  interface Window {
    __taxoTestAccessRequests?: AccessRequest[];
  }
}

function newestFirst(a: AccessRequest, b: AccessRequest): number {
  return b.createdAt.localeCompare(a.createdAt);
}

// ---- Shared workspace ------------------------------------------------------------

function createFirestoreRequester(db: Firestore): AccessRequester {
  const { functions } = getFirebase();
  const request = httpsCallable<Record<string, never>, RequestOutcome>(functions, 'requestAccess');
  return {
    async request() { return (await request({})).data; },
    watch(uid, listener) {
      return onSnapshot(
        doc(db, 'accessRequests', uid),
        (snapshot) => listener(snapshot.exists() ? (snapshot.data() as AccessRequest) : null),
        (error) => console.error('Access request subscription failed', error),
      );
    },
  };
}

function createFirestoreQueue(db: Firestore): AccessQueue {
  const { functions } = getFirebase();
  const decide = httpsCallable<{ uid: string; decision: 'approve' | 'decline'; tenantId?: string; role?: Role }, AccessRequest>(functions, 'decideAccessRequest');
  let snapshot: AccessRequest[] = [];
  const listeners = new Set<(requests: AccessRequest[]) => void>();
  let stopListening: (() => void) | null = null;

  function ensureListening() {
    if (stopListening) return;
    stopListening = onSnapshot(
      collection(db, 'accessRequests'),
      (result) => {
        snapshot = result.docs.map((item) => item.data() as AccessRequest).sort(newestFirst);
        listeners.forEach((listener) => listener(snapshot));
      },
      (error) => {
        console.error('Access requests subscription failed', error);
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
    async approve(uid, tenantId, role) { return (await decide({ uid, decision: 'approve', tenantId, role })).data; },
    async decline(uid) { return (await decide({ uid, decision: 'decline' })).data; },
  };
}

// ---- Memory mode: one list both screens share, with the Function's guards ---------

let memoryRequests: AccessRequest[] | null = null;
const memoryListeners = new Set<() => void>();

function memoryList(): AccessRequest[] {
  memoryRequests ??= [...(window.__taxoTestAccessRequests ?? [])].sort(newestFirst);
  return memoryRequests;
}

function commitMemory(next: AccessRequest[]) {
  memoryRequests = [...next].sort(newestFirst);
  memoryListeners.forEach((listener) => listener());
}

function createMemoryRequester(): AccessRequester {
  return {
    async request() {
      const existing = memoryList().find((item) => item.uid === 'you');
      if (existing) return { status: 'requested', request: existing };
      const now = new Date().toISOString();
      const request: AccessRequest = { uid: 'you', email: 'you@local.test', name: 'Local user', status: 'pending', tenantId: null, role: null, decidedBy: null, createdAt: now, updatedAt: now };
      commitMemory([request, ...memoryList()]);
      return { status: 'requested', request };
    },
    watch(uid, listener) {
      const notify = () => listener(memoryList().find((item) => item.uid === uid) ?? null);
      memoryListeners.add(notify);
      notify();
      return () => { memoryListeners.delete(notify); };
    },
  };
}

function createMemoryQueue(): AccessQueue {
  const find = (uid: string) => {
    const request = memoryList().find((item) => item.uid === uid);
    if (!request) throw new Error('There is no access request for that account.');
    if (request.status === 'approved') throw new Error(`${request.email} has already been approved.`);
    return request;
  };
  const replace = (updated: AccessRequest) => {
    commitMemory(memoryList().map((item) => (item.uid === updated.uid ? updated : item)));
    return updated;
  };
  return {
    getSnapshot: memoryList,
    subscribe(listener) {
      const notify = () => listener(memoryList());
      memoryListeners.add(notify);
      notify();
      return () => { memoryListeners.delete(notify); };
    },
    async approve(uid, tenantId, role) {
      const request = find(uid);
      if (!tenantId) throw new Error('Pick the workspace to add them to.');
      return replace({ ...request, status: 'approved', tenantId, role, decidedBy: 'you', updatedAt: new Date().toISOString() });
    },
    async decline(uid) {
      const request = find(uid);
      if (request.status === 'declined') return request;
      return replace({ ...request, status: 'declined', decidedBy: 'you', updatedAt: new Date().toISOString() });
    },
  };
}

export function createAccessRequester(mode: Mode): AccessRequester {
  return mode === 'firestore' ? createFirestoreRequester(getFirebase().db) : createMemoryRequester();
}

export function createAccessQueue(mode: Mode): AccessQueue {
  return mode === 'firestore' ? createFirestoreQueue(getFirebase().db) : createMemoryQueue();
}
