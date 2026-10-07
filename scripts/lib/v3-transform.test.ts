import { describe, expect, it } from 'vitest';
import { parsePlatforms, tenantDocument } from './v3-transform';

describe('tenantDocument and parsePlatforms', () => {
  it('builds the tenant document with the platforms given', () => {
    expect(tenantDocument('acme', 'Acme', ['marketing'], '2026-09-24T00:00:00.000Z', ['google', 'meta']).config).toEqual({
      allowedDatasets: ['marketing'],
      platforms: ['google', 'meta'],
    });
  });

  it('parses a --platforms value into known ids and refuses unknown ones', () => {
    expect(parsePlatforms(' Google, meta ,google,')).toEqual(['google', 'meta']);
    expect(parsePlatforms('')).toEqual([]);
    expect(() => parsePlatforms('google, facebook')).toThrow('Unknown platform(s): facebook.');
  });

  it('builds the tenant document with the datasets and no platforms yet', () => {
    expect(tenantDocument('acme', 'Acme', ['marketing'], '2026-09-24T00:00:00.000Z')).toEqual({
      id: 'acme',
      name: 'Acme',
      config: { allowedDatasets: ['marketing'], platforms: [] },
      createdAt: '2026-09-24T00:00:00.000Z',
      updatedAt: '2026-09-24T00:00:00.000Z',
    });
  });
});
