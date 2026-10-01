import { describe, expect, it } from 'vitest';
import { decideAccessRequest, requestAccess, type AccessPorts, type AccessRequest } from './access';
import type { Account, Member } from './members';
import type { CallerAuth } from './tenant';
import type { TenantDocument } from './tenants';

const NOW = '2026-10-01T10:00:00.000Z';

// In-memory ports: accounts keyed by uid, members by tenant, requests by uid.
function fakePorts(accounts: Account[], options: { members?: Record<string, Member[]>; requests?: AccessRequest[]; tenants?: string[] } = {}) {
  const state = {
    accounts: [...accounts],
    members: structuredClone(options.members ?? {}),
    requests: new Map((options.requests ?? []).map((request) => [request.uid, { ...request }])),
    tenants: options.tenants ?? ['acme', 'north-wind'],
  };
  const ports: AccessPorts = {
    members: {
      now: () => NOW,
      newId: () => 'inv-1',
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
        async writeMember(tenantId, member) { (state.members[tenantId] ??= []).push(member); },
        async deleteMember() {},
        async listInvites() { return []; },
        async writeInvite() {},
        async pendingInvitesFor() { return []; },
      },
    },
    requests: {
      async getRequest(uid) { return state.requests.get(uid) ?? null; },
      async writeRequest(request) { state.requests.set(request.uid, request); },
    },
    tenants: {
      async getTenant(id) {
        return state.tenants.includes(id) ? ({ id, name: id, config: { allowedDatasets: [], platforms: [] }, createdAt: NOW, updatedAt: NOW } satisfies TenantDocument) : null;
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

const stranger: Account = { uid: 'sam', email: 'Sam@Elsewhere.test', name: 'Sam', claims: {} };
const samAuth: CallerAuth = { uid: 'sam', token: { email: 'Sam@Elsewhere.test', email_verified: true, name: 'Sam' } };
const superAuth: CallerAuth = { uid: 'root', token: { superuser: true } };
const pending: AccessRequest = { uid: 'sam', email: 'sam@elsewhere.test', name: 'Sam', status: 'pending', tenantId: null, role: null, decidedBy: null, createdAt: NOW, updatedAt: NOW };

describe('requestAccess', () => {
  it('records a pending request for a signed-in account with no workspace', async () => {
    const { ports, state } = fakePorts([stranger]);
    const outcome = await requestAccess(ports, samAuth);
    expect(outcome).toEqual({ status: 'requested', request: pending });
    expect(state.requests.get('sam')).toEqual(pending);
  });

  it('returns the request as it stands when asked again, declined included', async () => {
    const declined: AccessRequest = { ...pending, status: 'declined', decidedBy: 'root' };
    const { ports, state } = fakePorts([stranger], { requests: [declined] });
    expect(await requestAccess(ports, samAuth)).toEqual({ status: 'requested', request: declined });
    expect(state.requests.get('sam')?.status).toBe('declined');
  });

  it('tells a member they already have a workspace, and writes nothing', async () => {
    const { ports, state } = fakePorts([stranger]);
    expect(await requestAccess(ports, { uid: 'sam', token: { tenantId: 'acme', role: 'user', email: 'sam@elsewhere.test', email_verified: true } })).toEqual({ status: 'member' });
    expect(state.requests.size).toBe(0);
  });

  it('refuses a signed-out caller and an unverified email', async () => {
    const { ports } = fakePorts([stranger]);
    expect(await codeOf(() => requestAccess(ports, undefined))).toBe('unauthenticated');
    expect(await codeOf(() => requestAccess(ports, { uid: 'sam', token: { email: 'sam@elsewhere.test', email_verified: false } }))).toBe('failed-precondition');
  });
});

describe('decideAccessRequest', () => {
  it('approves into the chosen tenant and role: claims, mirror and request together', async () => {
    const account = { ...stranger };
    const { ports, state } = fakePorts([account], { requests: [pending] });
    const decided = await decideAccessRequest(ports, superAuth, { uid: 'sam', decision: 'approve', tenantId: 'north-wind', role: 'admin' });
    expect(decided).toEqual({ ...pending, status: 'approved', tenantId: 'north-wind', role: 'admin', decidedBy: 'root', updatedAt: NOW });
    expect(account.claims).toEqual({ tenantId: 'north-wind', role: 'admin' });
    expect(state.members['north-wind'].map((member) => member.uid)).toEqual(['sam']);
    expect(state.requests.get('sam')?.status).toBe('approved');
  });

  it('declines, and a declined request can still be approved later', async () => {
    const account = { ...stranger };
    const { ports, state } = fakePorts([account], { requests: [pending] });
    expect((await decideAccessRequest(ports, superAuth, { uid: 'sam', decision: 'decline' })).status).toBe('declined');
    expect(account.claims).toEqual({});
    expect((await decideAccessRequest(ports, superAuth, { uid: 'sam', decision: 'approve', tenantId: 'acme', role: 'user' })).status).toBe('approved');
    expect(state.requests.get('sam')?.tenantId).toBe('acme');
  });

  it('is for the super user only', async () => {
    const { ports } = fakePorts([stranger], { requests: [pending] });
    expect(await codeOf(() => decideAccessRequest(ports, undefined, { uid: 'sam', decision: 'decline' }))).toBe('unauthenticated');
    expect(await codeOf(() => decideAccessRequest(ports, { uid: 'alice', token: { tenantId: 'acme', role: 'admin' } }, { uid: 'sam', decision: 'decline' }))).toBe('permission-denied');
  });

  it('refuses a missing request, a bad decision, no workspace, an unknown tenant and a bad role', async () => {
    const { ports } = fakePorts([stranger], { requests: [pending] });
    expect(await codeOf(() => decideAccessRequest(ports, superAuth, { uid: 'nobody', decision: 'decline' }))).toBe('not-found');
    expect(await codeOf(() => decideAccessRequest(ports, superAuth, { uid: 'sam', decision: 'maybe' }))).toBe('invalid-argument');
    expect(await codeOf(() => decideAccessRequest(ports, superAuth, { uid: 'sam', decision: 'approve', role: 'user' }))).toBe('invalid-argument');
    expect(await codeOf(() => decideAccessRequest(ports, superAuth, { uid: 'sam', decision: 'approve', tenantId: 'ghost', role: 'user' }))).toBe('not-found');
    expect(await codeOf(() => decideAccessRequest(ports, superAuth, { uid: 'sam', decision: 'approve', tenantId: 'acme', role: 'owner' }))).toBe('invalid-argument');
  });

  it('refuses to approve twice, or an account that joined another workspace meanwhile', async () => {
    const approved: AccessRequest = { ...pending, status: 'approved', tenantId: 'acme', role: 'user', decidedBy: 'root' };
    const { ports: once } = fakePorts([stranger], { requests: [approved] });
    expect(await codeOf(() => decideAccessRequest(once, superAuth, { uid: 'sam', decision: 'approve', tenantId: 'acme', role: 'user' }))).toBe('failed-precondition');
    expect(await codeOf(() => decideAccessRequest(once, superAuth, { uid: 'sam', decision: 'decline' }))).toBe('failed-precondition');

    const joined: Account = { ...stranger, claims: { tenantId: 'acme', role: 'user' } };
    const { ports: elsewhere, state } = fakePorts([joined], { requests: [pending] });
    expect(await codeOf(() => decideAccessRequest(elsewhere, superAuth, { uid: 'sam', decision: 'approve', tenantId: 'north-wind', role: 'user' }))).toBe('failed-precondition');
    expect(state.requests.get('sam')?.status).toBe('pending');
  });
});
