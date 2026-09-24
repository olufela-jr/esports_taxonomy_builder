import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, runTransaction, setDoc, updateDoc } from 'firebase/firestore';

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
