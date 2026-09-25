import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, query, runTransaction, setDoc, updateDoc, where } from 'firebase/firestore';

// The Security Rules are the app's only access control, so they get their own
// test against the Firestore emulator: `pnpm test:rules` (the emulator needs Java).
//
// Two tenants, acme and other. In acme: alice and carol are admins, uma is a
// standard user. bob is an admin of other. nobody is signed in with no claims.

let env: RulesTestEnvironment;

const ruleSet = {
  id: 'rs-1',
  name: 'Paid media',
  createdBy: 'alice',
  updatedBy: 'alice',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  rules: [],
};

// A shared definition under acme (v3 phase 2).
const definition = {
  id: 'def-1',
  name: 'Market',
  platforms: [],
  entries: [{ label: 'United Kingdom', code: 'uk' }],
  createdBy: 'alice',
  updatedBy: 'alice',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

// A pending request from uma, the standard user (v3 D41).
const valueRequest = {
  id: 'req-1',
  definitionId: 'def-1',
  label: 'Germany',
  code: 'de',
  note: '',
  requestedByName: 'Uma',
  status: 'pending',
  reason: '',
  createdBy: 'uma',
  updatedBy: 'uma',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const acmeTenant = {
  id: 'acme',
  name: 'Acme',
  config: { allowedDatasets: ['marketing'], platforms: [] },
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-taxo',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'tenants/acme'), acmeTenant);
    await setDoc(doc(db, 'tenants/acme/users/alice'), { uid: 'alice', email: 'alice@acme.test', role: 'admin', updatedAt: '2026-01-01T00:00:00.000Z' });
    await setDoc(doc(db, 'tenants/acme/users/uma'), { uid: 'uma', email: 'uma@acme.test', role: 'user', updatedAt: '2026-01-01T00:00:00.000Z' });
    await setDoc(doc(db, 'tenants/acme/rulesets/rs-1'), ruleSet);
    await setDoc(doc(db, 'tenants/acme/definitions/def-1'), definition);
    await setDoc(doc(db, 'tenants/acme/requests/req-1'), valueRequest);
    await setDoc(doc(db, 'tenants/other/rulesets/rs-9'), { ...ruleSet, id: 'rs-9', createdBy: 'bob', updatedBy: 'bob' });
    // The pre-v3 collection, left in place by the migration until it is deleted explicitly.
    await setDoc(doc(db, 'rulesets/rs-legacy'), { ...ruleSet, id: 'rs-legacy' });
  });
});

const alice = () => env.authenticatedContext('alice', { tenantId: 'acme', role: 'admin' }).firestore();
const carol = () => env.authenticatedContext('carol', { tenantId: 'acme', role: 'admin' }).firestore();
const uma = () => env.authenticatedContext('uma', { tenantId: 'acme', role: 'user' }).firestore();
const bob = () => env.authenticatedContext('bob', { tenantId: 'other', role: 'admin' }).firestore();
const nobody = () => env.authenticatedContext('nobody').firestore();
const anonymous = () => env.unauthenticatedContext().firestore();

const RS1 = 'tenants/acme/rulesets/rs-1';

describe('tenant isolation', () => {
  it('lets every member of the tenant read its Rule Sets and nobody else', async () => {
    await assertSucceeds(getDoc(doc(alice(), RS1)));
    await assertSucceeds(getDoc(doc(uma(), RS1)));
    await assertSucceeds(getDocs(collection(uma(), 'tenants/acme/rulesets')));
    // Another tenant's admin, a signed-in account with no claims, and no sign-in.
    await assertFails(getDoc(doc(bob(), RS1)));
    await assertFails(getDocs(collection(bob(), 'tenants/acme/rulesets')));
    await assertFails(getDoc(doc(nobody(), RS1)));
    await assertFails(getDoc(doc(anonymous(), RS1)));
  });

  it('denies the legacy /rulesets collection and any other path to everyone', async () => {
    await assertFails(getDoc(doc(alice(), 'rulesets/rs-legacy')));
    await assertFails(getDocs(collection(alice(), 'rulesets')));
    await assertFails(setDoc(doc(alice(), 'rulesets/rs-new'), { ...ruleSet, id: 'rs-new' }));
    await assertFails(getDoc(doc(alice(), 'anything/else')));
  });

  it('lets members read the tenant document and nobody write it', async () => {
    await assertSucceeds(getDoc(doc(alice(), 'tenants/acme')));
    await assertSucceeds(getDoc(doc(uma(), 'tenants/acme')));
    await assertFails(getDoc(doc(bob(), 'tenants/acme')));
    await assertFails(getDoc(doc(nobody(), 'tenants/acme')));
    await assertFails(updateDoc(doc(alice(), 'tenants/acme'), { name: 'Renamed' }));
    await assertFails(updateDoc(doc(alice(), 'tenants/acme'), { 'config.allowedDatasets': ['everything'] }));
    await assertFails(setDoc(doc(bob(), 'tenants/acme'), acmeTenant));
  });

  it('lets a user read their own users document, admins read any, and nobody write', async () => {
    await assertSucceeds(getDoc(doc(uma(), 'tenants/acme/users/uma')));
    await assertFails(getDoc(doc(uma(), 'tenants/acme/users/alice')));
    await assertFails(getDocs(collection(uma(), 'tenants/acme/users')));
    await assertSucceeds(getDoc(doc(alice(), 'tenants/acme/users/uma')));
    await assertSucceeds(getDocs(collection(alice(), 'tenants/acme/users')));
    await assertFails(getDoc(doc(bob(), 'tenants/acme/users/uma')));
    // Nobody promotes themselves or anyone else through the mirror.
    await assertFails(updateDoc(doc(uma(), 'tenants/acme/users/uma'), { role: 'admin' }));
    await assertFails(updateDoc(doc(alice(), 'tenants/acme/users/uma'), { role: 'admin' }));
  });
});

describe('rulesets by role', () => {
  it('lets an admin create only a well-formed Rule Set stamped as their own', async () => {
    const fresh = { ...ruleSet, id: 'rs-2', createdBy: 'alice', updatedBy: 'alice' };
    await assertSucceeds(setDoc(doc(alice(), 'tenants/acme/rulesets/rs-2'), fresh));
    // A standard user, another tenant's admin, or an admin in a tenant that is not theirs.
    await assertFails(setDoc(doc(uma(), 'tenants/acme/rulesets/rs-3'), { ...fresh, id: 'rs-3', createdBy: 'uma', updatedBy: 'uma' }));
    await assertFails(setDoc(doc(bob(), 'tenants/acme/rulesets/rs-4'), { ...fresh, id: 'rs-4', createdBy: 'bob', updatedBy: 'bob' }));
    await assertFails(setDoc(doc(alice(), 'tenants/other/rulesets/rs-5'), { ...fresh, id: 'rs-5' }));
    // Claiming someone else as creator or last editor, a mismatched id, a malformed document, missing audit fields, or no sign-in.
    await assertFails(setDoc(doc(alice(), 'tenants/acme/rulesets/rs-6'), { ...fresh, id: 'rs-6', createdBy: 'uma' }));
    await assertFails(setDoc(doc(alice(), 'tenants/acme/rulesets/rs-7'), { ...fresh, id: 'rs-7', updatedBy: 'uma' }));
    await assertFails(setDoc(doc(alice(), 'tenants/acme/rulesets/rs-8'), { ...fresh, id: 'other' }));
    await assertFails(setDoc(doc(alice(), 'tenants/acme/rulesets/rs-9'), { ...fresh, id: 'rs-9', rules: 'not a list' }));
    const { updatedBy: _updatedBy, ...unstamped } = { ...fresh, id: 'rs-10' };
    await assertFails(setDoc(doc(alice(), 'tenants/acme/rulesets/rs-10'), unstamped));
    await assertFails(setDoc(doc(anonymous(), 'tenants/acme/rulesets/rs-11'), { ...fresh, id: 'rs-11' }));
  });

  it('lets only an admin update, stamped as themselves, and never move createdBy', async () => {
    await assertSucceeds(updateDoc(doc(alice(), RS1), { name: 'Renamed', updatedAt: '2026-01-02T00:00:00.000Z', updatedBy: 'alice' }));
    // A second admin must stamp themselves; leaving alice's stamp in place is refused.
    await assertFails(updateDoc(doc(carol(), RS1), { name: 'Carol, unstamped', updatedAt: '2026-01-03T00:00:00.000Z' }));
    await assertSucceeds(updateDoc(doc(carol(), RS1), { name: 'Carol, stamped', updatedAt: '2026-01-03T00:00:00.000Z', updatedBy: 'carol' }));
    await assertFails(updateDoc(doc(alice(), RS1), { createdBy: 'carol', updatedBy: 'alice' }));
    await assertFails(updateDoc(doc(alice(), RS1), { id: 'rs-moved', updatedBy: 'alice' }));
    await assertFails(updateDoc(doc(uma(), RS1), { name: 'User edit', updatedBy: 'uma' }));
    await assertFails(updateDoc(doc(bob(), RS1), { name: 'Hijacked', updatedBy: 'bob' }));
    await assertFails(updateDoc(doc(nobody(), RS1), { name: 'No claims', updatedBy: 'nobody' }));
    await assertFails(updateDoc(doc(anonymous(), RS1), { name: 'Anonymous' }));
  });

  it('lets an admin update through a read-then-write transaction, as the store does', async () => {
    const asAdmin = alice();
    await assertSucceeds(runTransaction(asAdmin, async (transaction) => {
      const current = await transaction.get(doc(asAdmin, RS1));
      expect(current.exists()).toBe(true);
      transaction.update(doc(asAdmin, RS1), { name: 'Transactional', updatedAt: '2026-01-03T00:00:00.000Z', updatedBy: 'alice' });
    }));
    const asUser = uma();
    await assertFails(runTransaction(asUser, async (transaction) => {
      await transaction.get(doc(asUser, RS1));
      transaction.update(doc(asUser, RS1), { name: 'User edit', updatedBy: 'uma' });
    }));
  });

  it('lets only an admin of the tenant delete', async () => {
    await assertFails(deleteDoc(doc(uma(), RS1)));
    await assertFails(deleteDoc(doc(bob(), RS1)));
    await assertFails(deleteDoc(doc(nobody(), RS1)));
    await assertFails(deleteDoc(doc(anonymous(), RS1)));
    await assertSucceeds(deleteDoc(doc(alice(), RS1)));

    let stillExists = true;
    await env.withSecurityRulesDisabled(async (context) => {
      stillExists = (await getDoc(doc(context.firestore(), RS1))).exists();
    });
    expect(stillExists).toBe(false);
  });
});

const DEF1 = 'tenants/acme/definitions/def-1';

describe('definitions by role', () => {
  it('lets every member read the definitions and nobody outside the tenant', async () => {
    await assertSucceeds(getDoc(doc(alice(), DEF1)));
    await assertSucceeds(getDoc(doc(uma(), DEF1)));
    await assertSucceeds(getDocs(collection(uma(), 'tenants/acme/definitions')));
    await assertFails(getDoc(doc(bob(), DEF1)));
    await assertFails(getDocs(collection(bob(), 'tenants/acme/definitions')));
    await assertFails(getDoc(doc(nobody(), DEF1)));
    await assertFails(getDoc(doc(anonymous(), DEF1)));
  });

  it('lets an admin create only a well-formed definition stamped as their own', async () => {
    const fresh = { ...definition, id: 'def-2', name: 'Objective' };
    await assertSucceeds(setDoc(doc(alice(), 'tenants/acme/definitions/def-2'), fresh));
    await assertFails(setDoc(doc(uma(), 'tenants/acme/definitions/def-3'), { ...fresh, id: 'def-3', createdBy: 'uma', updatedBy: 'uma' }));
    await assertFails(setDoc(doc(bob(), 'tenants/acme/definitions/def-4'), { ...fresh, id: 'def-4', createdBy: 'bob', updatedBy: 'bob' }));
    await assertFails(setDoc(doc(alice(), 'tenants/acme/definitions/def-5'), { ...fresh, id: 'def-5', createdBy: 'uma' }));
    await assertFails(setDoc(doc(alice(), 'tenants/acme/definitions/def-6'), { ...fresh, id: 'def-6', updatedBy: 'uma' }));
    await assertFails(setDoc(doc(alice(), 'tenants/acme/definitions/def-7'), { ...fresh, id: 'other' }));
    await assertFails(setDoc(doc(alice(), 'tenants/acme/definitions/def-8'), { ...fresh, id: 'def-8', entries: 'not a list' }));
    await assertFails(setDoc(doc(alice(), 'tenants/acme/definitions/def-9'), { ...fresh, id: 'def-9', platforms: 'google' }));
    const { updatedBy: _updatedBy, ...unstamped } = { ...fresh, id: 'def-10' };
    await assertFails(setDoc(doc(alice(), 'tenants/acme/definitions/def-10'), unstamped));
    await assertFails(setDoc(doc(anonymous(), 'tenants/acme/definitions/def-11'), { ...fresh, id: 'def-11' }));
  });

  it('lets only an admin update, stamped as themselves, keeping id and createdBy', async () => {
    await assertSucceeds(updateDoc(doc(alice(), DEF1), { entries: [{ label: 'United Kingdom', code: 'uk' }, { label: 'Germany', code: 'de' }], updatedAt: '2026-01-02T00:00:00.000Z', updatedBy: 'alice' }));
    await assertFails(updateDoc(doc(carol(), DEF1), { name: 'Carol, unstamped', updatedAt: '2026-01-03T00:00:00.000Z' }));
    await assertSucceeds(updateDoc(doc(carol(), DEF1), { name: 'Carol, stamped', updatedAt: '2026-01-03T00:00:00.000Z', updatedBy: 'carol' }));
    await assertFails(updateDoc(doc(alice(), DEF1), { createdBy: 'carol', updatedBy: 'alice' }));
    await assertFails(updateDoc(doc(alice(), DEF1), { id: 'def-moved', updatedBy: 'alice' }));
    await assertFails(updateDoc(doc(uma(), DEF1), { name: 'User edit', updatedBy: 'uma' }));
    await assertFails(updateDoc(doc(bob(), DEF1), { name: 'Hijacked', updatedBy: 'bob' }));
    await assertFails(updateDoc(doc(anonymous(), DEF1), { name: 'Anonymous' }));
  });

  it('lets only an admin of the tenant delete a definition', async () => {
    await assertFails(deleteDoc(doc(uma(), DEF1)));
    await assertFails(deleteDoc(doc(bob(), DEF1)));
    await assertFails(deleteDoc(doc(nobody(), DEF1)));
    await assertFails(deleteDoc(doc(anonymous(), DEF1)));
    await assertSucceeds(deleteDoc(doc(alice(), DEF1)));
  });
});

const REQ1 = 'tenants/acme/requests/req-1';

describe('requests by role', () => {
  it('lets a member submit their own pending request and nothing else', async () => {
    const fresh = { ...valueRequest, id: 'req-2', code: 'fr', label: 'France' };
    await assertSucceeds(setDoc(doc(uma(), 'tenants/acme/requests/req-2'), fresh));
    // Not as someone else, not already approved, not into another tenant, not malformed, not unstamped.
    await assertFails(setDoc(doc(uma(), 'tenants/acme/requests/req-3'), { ...fresh, id: 'req-3', createdBy: 'alice' }));
    await assertFails(setDoc(doc(uma(), 'tenants/acme/requests/req-4'), { ...fresh, id: 'req-4', status: 'approved' }));
    await assertFails(setDoc(doc(uma(), 'tenants/other/requests/req-5'), { ...fresh, id: 'req-5' }));
    await assertFails(setDoc(doc(uma(), 'tenants/acme/requests/req-6'), { ...fresh, id: 'req-6', status: 'later' }));
    await assertFails(setDoc(doc(uma(), 'tenants/acme/requests/req-7'), { ...fresh, id: 'req-7', updatedBy: 'alice' }));
    await assertFails(setDoc(doc(bob(), 'tenants/acme/requests/req-8'), { ...fresh, id: 'req-8', createdBy: 'bob', updatedBy: 'bob' }));
    await assertFails(setDoc(doc(anonymous(), 'tenants/acme/requests/req-9'), { ...fresh, id: 'req-9' }));
  });

  it('lets the requester read their own, admins read all, and nobody else', async () => {
    await assertSucceeds(getDoc(doc(uma(), REQ1)));
    await assertSucceeds(getDocs(query(collection(uma(), 'tenants/acme/requests'), where('createdBy', '==', 'uma'))));
    // An unfiltered list would expose other members' requests, so it is refused.
    await assertFails(getDocs(collection(uma(), 'tenants/acme/requests')));
    await assertSucceeds(getDoc(doc(alice(), REQ1)));
    await assertSucceeds(getDocs(collection(alice(), 'tenants/acme/requests')));
    await assertFails(getDoc(doc(bob(), REQ1)));
    await assertFails(getDoc(doc(nobody(), REQ1)));
    await assertFails(getDoc(doc(anonymous(), REQ1)));
  });

  it('lets only an admin decide a request, stamped as themselves, keeping the requester', async () => {
    await assertFails(updateDoc(doc(uma(), REQ1), { status: 'approved', updatedBy: 'uma' }));
    await assertFails(updateDoc(doc(alice(), REQ1), { status: 'approved' }));
    await assertFails(updateDoc(doc(alice(), REQ1), { status: 'approved', createdBy: 'alice', updatedBy: 'alice' }));
    await assertFails(updateDoc(doc(alice(), REQ1), { status: 'maybe', updatedBy: 'alice' }));
    await assertSucceeds(updateDoc(doc(alice(), REQ1), { status: 'rejected', reason: 'Use the existing code.', updatedAt: '2026-01-02T00:00:00.000Z', updatedBy: 'alice' }));
    await assertFails(updateDoc(doc(bob(), REQ1), { status: 'approved', updatedBy: 'bob' }));
  });

  it('lets only an admin delete a request', async () => {
    await assertFails(deleteDoc(doc(uma(), REQ1)));
    await assertFails(deleteDoc(doc(bob(), REQ1)));
    await assertSucceeds(deleteDoc(doc(alice(), REQ1)));
  });
});
