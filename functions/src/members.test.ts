import { describe, expect, it } from 'vitest';
import { acceptInvite, inviteMember, removeMember, revokeInvite, setMemberRole, type Account, type Invite, type Member, type Ports } from './members';
import type { Caller } from './tenant';

// In-memory ports: accounts keyed by uid, members and invites keyed by tenant.
function fakePorts(accounts: Account[], members: Record<string, Member[]> = {}, invites: Record<string, Invite[]> = {}) {
  const state = { accounts: [...accounts], members: structuredClone(members), invites: structuredClone(invites) };
  let counter = 0;
  const ports: Ports = {
    now: () => '2026-09-30T10:00:00.000Z',
    newId: () => `inv-${++counter}`,
    auth: {
      async accountByEmail(email) { return state.accounts.find((account) => account.email?.toLowerCase() === email) ?? null; },
      async accountById(uid) { return state.accounts.find((account) => account.uid === uid) ?? null; },
      async setClaims(uid, claims) {
        const account = state.accounts.find((item) => item.uid === uid);
        if (account) account.claims = claims;
      },
    },
    store: {
      async listMembers(tenantId) { return state.members[tenantId] ?? []; },
      async writeMember(tenantId, member) {
        const list = (state.members[tenantId] ??= []);
        const index = list.findIndex((item) => item.uid === member.uid);
        if (index === -1) list.push(member); else list[index] = member;
      },
      async deleteMember(tenantId, uid) { state.members[tenantId] = (state.members[tenantId] ?? []).filter((item) => item.uid !== uid); },
      async listInvites(tenantId) { return state.invites[tenantId] ?? []; },
      async writeInvite(tenantId, invite) {
        const list = (state.invites[tenantId] ??= []);
        const index = list.findIndex((item) => item.id === invite.id);
        if (index === -1) list.push(invite); else list[index] = invite;
      },
      async pendingInvitesFor(email) {
        return Object.entries(state.invites).flatMap(([tenantId, list]) => list.filter((invite) => invite.status === 'pending' && invite.email === email).map((invite) => ({ tenantId, invite })));
      },
    },
  };
  return { ports, state };
}

async function codeOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    return (error as { code: string }).code;
  }
  return 'no error';
}

const alice: Caller = { uid: 'alice', tenantId: 'acme', role: 'admin' };
const uma: Caller = { uid: 'uma', tenantId: 'acme', role: 'user' };
const NOW = '2026-09-30T10:00:00.000Z';
const aliceMember: Member = { uid: 'alice', email: 'alice@acme.test', name: 'Alice', role: 'admin', updatedAt: NOW };
const umaMember: Member = { uid: 'uma', email: 'uma@acme.test', name: 'Uma', role: 'user', updatedAt: NOW };
const aliceAccount: Account = { uid: 'alice', email: 'alice@acme.test', name: 'Alice', claims: { tenantId: 'acme', role: 'admin' } };
const umaAccount: Account = { uid: 'uma', email: 'uma@acme.test', name: 'Uma', claims: { tenantId: 'acme', role: 'user' } };

describe('inviteMember', () => {
  it('provisions an existing account at once and mirrors it', async () => {
    const dave: Account = { uid: 'dave', email: 'Dave@Acme.test', name: 'Dave', claims: {} };
    const { ports, state } = fakePorts([aliceAccount, dave], { acme: [aliceMember] });
    const outcome = await inviteMember(ports, alice, { email: ' dave@acme.test ', role: 'user' });
    expect(outcome).toEqual({ status: 'active', member: { uid: 'dave', email: 'Dave@Acme.test', name: 'Dave', role: 'user', updatedAt: NOW } });
    expect(dave.claims).toEqual({ tenantId: 'acme', role: 'user' });
    expect(state.members.acme.map((member) => member.uid)).toEqual(['alice', 'dave']);
  });

  it('stores an invite for an email with no account yet', async () => {
    const { ports, state } = fakePorts([aliceAccount], { acme: [aliceMember] });
    const outcome = await inviteMember(ports, alice, { email: 'New@Acme.test', role: 'admin' });
    expect(outcome.status).toBe('invited');
    expect(state.invites.acme).toEqual([{ id: 'inv-1', email: 'new@acme.test', role: 'admin', status: 'pending', invitedBy: 'alice', acceptedBy: null, createdAt: NOW, updatedAt: NOW }]);
  });

  it('refuses a standard user, a bad email, a bad role, a current member and a repeat invite', async () => {
    const { ports } = fakePorts([aliceAccount, umaAccount], { acme: [aliceMember, umaMember] }, { acme: [{ id: 'inv-0', email: 'waiting@acme.test', role: 'user', status: 'pending', invitedBy: 'alice', acceptedBy: null, createdAt: NOW, updatedAt: NOW }] });
    expect(await codeOf(() => inviteMember(ports, uma, { email: 'x@acme.test', role: 'user' }))).toBe('permission-denied');
    expect(await codeOf(() => inviteMember(ports, alice, { email: 'not an email', role: 'user' }))).toBe('invalid-argument');
    expect(await codeOf(() => inviteMember(ports, alice, { email: 'x@acme.test', role: 'owner' }))).toBe('invalid-argument');
    expect(await codeOf(() => inviteMember(ports, alice, { email: 'UMA@acme.test', role: 'admin' }))).toBe('already-exists');
    expect(await codeOf(() => inviteMember(ports, alice, { email: 'waiting@acme.test', role: 'user' }))).toBe('already-exists');
  });

  it('refuses an account that belongs to another workspace', async () => {
    const bob: Account = { uid: 'bob', email: 'bob@other.test', name: 'Bob', claims: { tenantId: 'other', role: 'admin' } };
    const { ports } = fakePorts([aliceAccount, bob], { acme: [aliceMember] });
    expect(await codeOf(() => inviteMember(ports, alice, { email: 'bob@other.test', role: 'user' }))).toBe('failed-precondition');
    expect(bob.claims).toEqual({ tenantId: 'other', role: 'admin' });
  });
});

describe('setMemberRole', () => {
  it('changes the claims and the mirror', async () => {
    const { ports, state } = fakePorts([aliceAccount, umaAccount], { acme: [aliceMember, umaMember] });
    const updated = await setMemberRole(ports, alice, { uid: 'uma', role: 'admin' });
    expect(updated.role).toBe('admin');
    expect(umaAccount.claims).toEqual({ tenantId: 'acme', role: 'admin' });
    expect(state.members.acme.find((member) => member.uid === 'uma')?.role).toBe('admin');
  });

  it('keeps the last admin, refuses outsiders, and needs an admin caller', async () => {
    const { ports } = fakePorts([aliceAccount, umaAccount], { acme: [aliceMember, umaMember] });
    expect(await codeOf(() => setMemberRole(ports, alice, { uid: 'alice', role: 'user' }))).toBe('failed-precondition');
    expect(await codeOf(() => setMemberRole(ports, alice, { uid: 'ghost', role: 'user' }))).toBe('not-found');
    expect(await codeOf(() => setMemberRole(ports, uma, { uid: 'alice', role: 'user' }))).toBe('permission-denied');
  });

  it('lets an admin step down once another admin exists', async () => {
    const carol: Member = { uid: 'carol', email: 'carol@acme.test', name: 'Carol', role: 'admin', updatedAt: NOW };
    const { ports } = fakePorts([aliceAccount], { acme: [aliceMember, carol] });
    expect((await setMemberRole(ports, alice, { uid: 'alice', role: 'user' })).role).toBe('user');
  });
});

describe('removeMember', () => {
  it('clears the claims and deletes the mirror', async () => {
    const { ports, state } = fakePorts([aliceAccount, umaAccount], { acme: [aliceMember, umaMember] });
    expect(await removeMember(ports, alice, { uid: 'uma' })).toEqual({ uid: 'uma' });
    expect(umaAccount.claims).toEqual({});
    expect(state.members.acme.map((member) => member.uid)).toEqual(['alice']);
  });

  it('never removes the caller or the last admin', async () => {
    const { ports } = fakePorts([aliceAccount, umaAccount], { acme: [aliceMember, umaMember] });
    expect(await codeOf(() => removeMember(ports, alice, { uid: 'alice' }))).toBe('failed-precondition');
    const carol: Caller = { uid: 'carol', tenantId: 'acme', role: 'admin' };
    expect(await codeOf(() => removeMember(ports, carol, { uid: 'alice' }))).toBe('failed-precondition');
  });
});

describe('revokeInvite', () => {
  it('marks a pending invite revoked and leaves others alone', async () => {
    const pending: Invite = { id: 'inv-0', email: 'waiting@acme.test', role: 'user', status: 'pending', invitedBy: 'alice', acceptedBy: null, createdAt: NOW, updatedAt: NOW };
    const { ports, state } = fakePorts([aliceAccount], { acme: [aliceMember] }, { acme: [pending] });
    expect((await revokeInvite(ports, alice, { inviteId: 'inv-0' })).status).toBe('revoked');
    expect(state.invites.acme[0].status).toBe('revoked');
    expect(await codeOf(() => revokeInvite(ports, alice, { inviteId: 'nope' }))).toBe('not-found');
    expect(await codeOf(() => revokeInvite(ports, uma, { inviteId: 'inv-0' }))).toBe('permission-denied');
  });
});

describe('acceptInvite', () => {
  const pending: Invite = { id: 'inv-0', email: 'new@acme.test', role: 'user', status: 'pending', invitedBy: 'alice', acceptedBy: null, createdAt: NOW, updatedAt: NOW };

  it('claims the invite for a verified matching email, sets claims and mirrors the member', async () => {
    const newcomer: Account = { uid: 'n1', email: 'New@acme.test', name: 'Newcomer', claims: {} };
    const { ports, state } = fakePorts([newcomer], { acme: [aliceMember] }, { acme: [pending] });
    const outcome = await acceptInvite(ports, { uid: 'n1', token: { email: 'New@acme.test', email_verified: true } });
    expect(outcome).toEqual({ status: 'accepted', tenantId: 'acme', role: 'user' });
    expect(newcomer.claims).toEqual({ tenantId: 'acme', role: 'user' });
    expect(state.members.acme.find((member) => member.uid === 'n1')).toMatchObject({ email: 'New@acme.test', name: 'Newcomer', role: 'user' });
    expect(state.invites.acme[0]).toMatchObject({ status: 'accepted', acceptedBy: 'n1' });
  });

  it('does nothing without a matching pending invite or without a verified email', async () => {
    const { ports } = fakePorts([], {}, { acme: [pending] });
    expect(await acceptInvite(ports, { uid: 'x', token: { email: 'other@acme.test', email_verified: true } })).toEqual({ status: 'none' });
    expect(await acceptInvite(ports, { uid: 'x', token: { email: 'new@acme.test', email_verified: false } })).toEqual({ status: 'none' });
    expect(await acceptInvite(ports, { uid: 'x', token: { email: 'new@acme.test', email_verified: true } })).toMatchObject({ status: 'accepted' });
    // Claimed once: a second account with the same email finds nothing.
    expect(await acceptInvite(ports, { uid: 'y', token: { email: 'new@acme.test', email_verified: true } })).toEqual({ status: 'none' });
  });

  it('reports an existing membership and refuses no sign-in', async () => {
    const { ports } = fakePorts([]);
    expect(await acceptInvite(ports, { uid: 'alice', token: { tenantId: 'acme', role: 'admin' } })).toEqual({ status: 'member', tenantId: 'acme', role: 'admin' });
    expect(await codeOf(() => acceptInvite(ports, undefined))).toBe('unauthenticated');
  });
});
