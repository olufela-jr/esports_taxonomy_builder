import { describe, expect, it } from 'vitest';
import { inviteScope, isSuperuser, superFromAuth } from './tenant';
import { createTenant, parseConfig, updateTenant, type TenantDocument, type TenantPorts } from './tenants';

async function codeOf(run: () => Promise<unknown> | unknown): Promise<string> {
  try {
    await run();
  } catch (error) {
    return (error as { code: string }).code;
  }
  return 'no error';
}

function fakePorts(initial: TenantDocument[] = []) {
  const tenants = new Map(initial.map((tenant) => [tenant.id, tenant]));
  const ports: TenantPorts = {
    now: () => '2026-09-30T12:00:00.000Z',
    store: {
      async getTenant(id) { return tenants.get(id) ?? null; },
      async writeTenant(tenant) { tenants.set(tenant.id, tenant); },
    },
  };
  return { ports, tenants };
}

const sam = { uid: 'sam', token: { superuser: true } };
const alice = { uid: 'alice', token: { tenantId: 'acme', role: 'admin' } };
const uma = { uid: 'uma', token: { tenantId: 'acme', role: 'user' } };
const both = { uid: 'fela', token: { tenantId: 'esports', role: 'admin', superuser: true } };

describe('the superuser claim', () => {
  it('is a separate boolean claim, true only when exactly true', async () => {
    expect(isSuperuser(sam)).toBe(true);
    expect(isSuperuser(both)).toBe(true);
    expect(isSuperuser(alice)).toBe(false);
    expect(isSuperuser({ uid: 'x', token: { superuser: 'true' } })).toBe(false);
    expect(isSuperuser(undefined)).toBe(false);
    expect(superFromAuth(sam)).toEqual({ uid: 'sam' });
    expect(await codeOf(() => superFromAuth(alice))).toBe('permission-denied');
    expect(await codeOf(() => superFromAuth(undefined))).toBe('unauthenticated');
  });

  it('scopes an invite to an admin\'s own tenant, or any tenant for the super user', async () => {
    expect(inviteScope(alice, undefined)).toEqual({ uid: 'alice', tenantId: 'acme', role: 'admin' });
    // An admin cannot name another tenant; the body is ignored.
    expect(inviteScope(alice, 'other')).toEqual({ uid: 'alice', tenantId: 'acme', role: 'admin' });
    expect(inviteScope(sam, 'other')).toEqual({ uid: 'sam', tenantId: 'other', role: 'admin' });
    expect(inviteScope(both, 'other')).toEqual({ uid: 'fela', tenantId: 'other', role: 'admin' });
    // The super user with a tenant of their own and no tenant named acts there.
    expect(inviteScope(both, undefined)).toEqual({ uid: 'fela', tenantId: 'esports', role: 'admin' });
    expect(await codeOf(() => inviteScope(sam, undefined))).toBe('permission-denied');
    expect(await codeOf(() => inviteScope(sam, 'Bad Id'))).toBe('invalid-argument');
    expect(await codeOf(() => inviteScope(uma, undefined))).toBe('permission-denied');
    expect(await codeOf(() => inviteScope(undefined, 'acme'))).toBe('unauthenticated');
  });
});

describe('createTenant', () => {
  it('creates a tenant with a validated config', async () => {
    const { ports, tenants } = fakePorts();
    const tenant = await createTenant(ports, sam, { id: 'north-wind', name: ' North Wind ', config: { allowedDatasets: ['marketing_dw', 'marketing_dw', 'ads'], platforms: ['Google', 'meta'] } });
    expect(tenant).toEqual({ id: 'north-wind', name: 'North Wind', config: { allowedDatasets: ['ads', 'marketing_dw'], platforms: ['google', 'meta'] }, createdAt: '2026-09-30T12:00:00.000Z', updatedAt: '2026-09-30T12:00:00.000Z' });
    expect(tenants.get('north-wind')).toEqual(tenant);
    // No config at all is an empty one.
    expect((await createTenant(ports, sam, { id: 'bare', name: 'Bare' })).config).toEqual({ allowedDatasets: [], platforms: [] });
  });

  it('refuses non-super callers, bad ids, blank names, bad datasets, unknown platforms and duplicates', async () => {
    const { ports } = fakePorts([{ id: 'acme', name: 'Acme', config: { allowedDatasets: [], platforms: [] }, createdAt: 'x', updatedAt: 'x' }]);
    expect(await codeOf(() => createTenant(ports, alice, { id: 'new', name: 'New' }))).toBe('permission-denied');
    expect(await codeOf(() => createTenant(ports, sam, { id: 'New Co', name: 'New' }))).toBe('invalid-argument');
    expect(await codeOf(() => createTenant(ports, sam, { id: 'new', name: '  ' }))).toBe('invalid-argument');
    expect(await codeOf(() => createTenant(ports, sam, { id: 'new', name: 'New', config: { allowedDatasets: ['my-dataset'] } }))).toBe('invalid-argument');
    expect(await codeOf(() => createTenant(ports, sam, { id: 'new', name: 'New', config: { platforms: ['myspace'] } }))).toBe('invalid-argument');
    expect(await codeOf(() => createTenant(ports, sam, { id: 'new', name: 'New', config: { platforms: 'google' } }))).toBe('invalid-argument');
    expect(await codeOf(() => createTenant(ports, sam, { id: 'acme', name: 'Again' }))).toBe('already-exists');
  });
});

describe('updateTenant', () => {
  const existing: TenantDocument = { id: 'acme', name: 'Acme', config: { allowedDatasets: ['marketing'], platforms: ['google'] }, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };

  it('changes the name or the config, keeps the rest', async () => {
    const { ports } = fakePorts([existing]);
    const renamed = await updateTenant(ports, sam, { id: 'acme', name: 'Acme Corp' });
    expect(renamed).toEqual({ ...existing, name: 'Acme Corp', updatedAt: '2026-09-30T12:00:00.000Z' });
    const reconfigured = await updateTenant(ports, sam, { id: 'acme', config: { allowedDatasets: ['ads'], platforms: [] } });
    expect(reconfigured).toMatchObject({ name: 'Acme Corp', config: { allowedDatasets: ['ads'], platforms: [] }, createdAt: existing.createdAt });
  });

  it('refuses a missing tenant and a non-super caller', async () => {
    const { ports } = fakePorts([existing]);
    expect(await codeOf(() => updateTenant(ports, sam, { id: 'ghost', name: 'x' }))).toBe('not-found');
    expect(await codeOf(() => updateTenant(ports, alice, { id: 'acme', name: 'x' }))).toBe('permission-denied');
  });

  it('parseConfig sorts and deduplicates datasets and lowercases platforms', () => {
    expect(parseConfig({ allowedDatasets: ['b', 'a', 'b'], platforms: ['META'] })).toEqual({ allowedDatasets: ['a', 'b'], platforms: ['meta'] });
  });
});
