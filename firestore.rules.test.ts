import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

// The Security Rules are the app's only access control, so they get their own
// test against the Firestore emulator: `pnpm test:rules` (the emulator needs Java).

let env: RulesTestEnvironment;

const ruleSet = {
  id: 'rs-1',
  name: 'Paid media',
  ownerId: 'alice',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  rules: [],
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
    await setDoc(doc(context.firestore(), 'rulesets/rs-1'), ruleSet);
  });
});

const alice = () => env.authenticatedContext('alice').firestore();
const bob = () => env.authenticatedContext('bob').firestore();
const anonymous = () => env.unauthenticatedContext().firestore();

describe('rulesets security rules', () => {
  it('lets any signed-in user read and nobody else', async () => {
    await assertSucceeds(getDoc(doc(alice(), 'rulesets/rs-1')));
    await assertSucceeds(getDoc(doc(bob(), 'rulesets/rs-1')));
    await assertFails(getDoc(doc(anonymous(), 'rulesets/rs-1')));
  });

  it('lets a user create only a well-formed Rule Set they own', async () => {
    const fresh = { ...ruleSet, id: 'rs-2', ownerId: 'bob' };
    await assertSucceeds(setDoc(doc(bob(), 'rulesets/rs-2'), fresh));
    // Claiming someone else as owner, a malformed document, a mismatched id, or no sign-in.
    await assertFails(setDoc(doc(alice(), 'rulesets/rs-3'), { ...fresh, id: 'rs-3' }));
    await assertFails(setDoc(doc(bob(), 'rulesets/rs-4'), { ...fresh, id: 'rs-4', rules: 'not a list' }));
    await assertFails(setDoc(doc(bob(), 'rulesets/rs-5'), { ...fresh, id: 'other' }));
    await assertFails(setDoc(doc(anonymous(), 'rulesets/rs-6'), { ...fresh, id: 'rs-6' }));
  });

  it('lets only the owner update, and never move ownership', async () => {
    await assertSucceeds(updateDoc(doc(alice(), 'rulesets/rs-1'), { name: 'Renamed', updatedAt: '2026-01-02T00:00:00.000Z' }));
    await assertFails(updateDoc(doc(bob(), 'rulesets/rs-1'), { name: 'Hijacked' }));
    await assertFails(updateDoc(doc(alice(), 'rulesets/rs-1'), { ownerId: 'bob' }));
    await assertFails(updateDoc(doc(anonymous(), 'rulesets/rs-1'), { name: 'Anonymous' }));
  });

  it('lets only the owner delete', async () => {
    await assertFails(deleteDoc(doc(bob(), 'rulesets/rs-1')));
    await assertFails(deleteDoc(doc(anonymous(), 'rulesets/rs-1')));
    await assertSucceeds(deleteDoc(doc(alice(), 'rulesets/rs-1')));

    let stillExists = true;
    await env.withSecurityRulesDisabled(async (context) => {
      stillExists = (await getDoc(doc(context.firestore(), 'rulesets/rs-1'))).exists();
    });
    expect(stillExists).toBe(false);
  });
});
