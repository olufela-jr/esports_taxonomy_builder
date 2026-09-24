import { describe, expect, it } from 'vitest';
import { assertDatasetAllowed, readTenantConfig, tenantFromAuth, type DocumentReader } from './tenant';

// Reads the HttpsError code off whatever the guard throws.
function codeOf(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    return (error as { code: string }).code;
  }
  return 'no error';
}

describe('tenantFromAuth', () => {
  it('returns the tenant and role from the token claims', () => {
    expect(tenantFromAuth({ uid: 'alice', token: { tenantId: 'acme', role: 'admin' } })).toEqual({ uid: 'alice', tenantId: 'acme', role: 'admin' });
    expect(tenantFromAuth({ uid: 'uma', token: { tenantId: 'acme', role: 'user' } }).role).toBe('user');
  });

  it('refuses a call with no sign-in', () => {
    expect(codeOf(() => tenantFromAuth(undefined))).toBe('unauthenticated');
  });

  it('refuses a signed-in account with no tenant or an unknown role', () => {
    expect(codeOf(() => tenantFromAuth({ uid: 'nobody', token: {} }))).toBe('permission-denied');
    expect(codeOf(() => tenantFromAuth({ uid: 'nobody', token: { tenantId: '', role: 'admin' } }))).toBe('permission-denied');
    expect(codeOf(() => tenantFromAuth({ uid: 'nobody', token: { tenantId: 42, role: 'admin' } }))).toBe('permission-denied');
    expect(codeOf(() => tenantFromAuth({ uid: 'nobody', token: { tenantId: 'acme', role: 'owner' } }))).toBe('permission-denied');
    expect(codeOf(() => tenantFromAuth({ uid: 'nobody', token: { tenantId: 'acme' } }))).toBe('permission-denied');
  });
});

describe('assertDatasetAllowed', () => {
  const config = { allowedDatasets: ['marketing', 'marketing_dw'], platforms: [] };

  it('passes a whitelisted dataset', () => {
    expect(() => assertDatasetAllowed(config, 'marketing')).not.toThrow();
  });

  it('refuses a dataset outside the list, exactly matched', () => {
    expect(codeOf(() => assertDatasetAllowed(config, 'finance'))).toBe('permission-denied');
    expect(codeOf(() => assertDatasetAllowed(config, 'Marketing'))).toBe('permission-denied');
  });

  it('allows nothing without a config or with an empty list', () => {
    expect(codeOf(() => assertDatasetAllowed(undefined, 'marketing'))).toBe('permission-denied');
    expect(codeOf(() => assertDatasetAllowed({ allowedDatasets: [], platforms: [] }, 'marketing'))).toBe('permission-denied');
  });
});

describe('readTenantConfig', () => {
  function fakeDb(documents: Record<string, unknown>): DocumentReader {
    return {
      doc(path) {
        return {
          async get() {
            return { exists: path in documents, data: () => documents[path] };
          },
        };
      },
    };
  }

  it('reads the config from the tenant document', async () => {
    const db = fakeDb({ 'tenants/acme': { id: 'acme', config: { allowedDatasets: ['marketing'], platforms: ['google'] } } });
    expect(await readTenantConfig(db, 'acme')).toEqual({ allowedDatasets: ['marketing'], platforms: ['google'] });
  });

  it('returns undefined for a missing tenant or a malformed config', async () => {
    expect(await readTenantConfig(fakeDb({}), 'acme')).toBeUndefined();
    expect(await readTenantConfig(fakeDb({ 'tenants/acme': { id: 'acme' } }), 'acme')).toBeUndefined();
    expect(await readTenantConfig(fakeDb({ 'tenants/acme': { config: { allowedDatasets: 'marketing' } } }), 'acme')).toBeUndefined();
  });

  it('never reads another tenant\'s document', async () => {
    const db = fakeDb({ 'tenants/other': { config: { allowedDatasets: ['everything'], platforms: [] } } });
    expect(await readTenantConfig(db, 'acme')).toBeUndefined();
  });
});
