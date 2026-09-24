import { describe, expect, it } from 'vitest';
import { collectDatasets, parsePlatforms, tenantDocument, transformRuleSet, verifyRuleSet, type LegacyRuleSet } from './v3-transform';

const legacy: LegacyRuleSet = {
  id: 'rs-1',
  name: 'Paid media',
  ownerId: 'alice',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-02-01T00:00:00.000Z',
  rules: [
    {
      id: 'rule-google',
      key: 'google_campaigns',
      name: 'Google Campaigns',
      tags: { platform: 'google', entityType: 'campaign' },
      delimiter: '_',
      source: { dataset: 'marketing', table: 'campaigns', nameColumn: 'campaign_name', filter: { column: 'status', in: ['active'] } },
      segments: [
        { id: 'seg-type', kind: 'enum', key: 'campaign_type', label: 'Campaign Type', required: true, allowedValues: ['brand', 'perf'] },
        { id: 'seg-audience', kind: 'freeform', key: 'audience', label: 'Audience', required: true, maxLength: 20, illegalChars: [' '] },
      ],
    },
    {
      id: 'rule-ad-groups',
      key: 'google_ad_groups',
      name: 'Google Ad Groups',
      delimiter: '_',
      parent: { ruleId: 'rule-google', inheritSegmentIds: ['seg-type'] },
      source: { dataset: 'marketing_dw', table: 'ad_groups', nameColumn: 'ad_group_name' },
      segments: [
        // Already an entry, as a document saved after C1 would hold.
        { id: 'seg-targeting', kind: 'enum', key: 'targeting', label: 'Targeting', required: true, allowedValues: [{ label: 'Broad match', code: 'broad' }, 'exact'] },
      ],
    },
  ],
};

describe('transformRuleSet', () => {
  const migrated = transformRuleSet(legacy);

  it('rewrites flat values as label = code entries and keeps entries as they are', () => {
    const [google, adGroups] = migrated.rules;
    expect(google.segments[0]).toMatchObject({ allowedValues: [{ label: 'brand', code: 'brand' }, { label: 'perf', code: 'perf' }] });
    expect(adGroups.segments[0]).toMatchObject({ allowedValues: [{ label: 'Broad match', code: 'broad' }, { label: 'exact', code: 'exact' }] });
    // Freeform segments are untouched.
    expect(google.segments[1]).toEqual(legacy.rules[0].segments[1]);
  });

  it('turns ownerId into createdBy and updatedBy and drops it', () => {
    expect(migrated.createdBy).toBe('alice');
    expect(migrated.updatedBy).toBe('alice');
    expect('ownerId' in migrated).toBe(false);
  });

  it('keeps ids, timestamps, tags, parent links and sources exactly', () => {
    expect(migrated.id).toBe('rs-1');
    expect(migrated.createdAt).toBe(legacy.createdAt);
    expect(migrated.updatedAt).toBe(legacy.updatedAt);
    expect(migrated.rules.map((rule) => rule.id)).toEqual(['rule-google', 'rule-ad-groups']);
    expect(migrated.rules[0].tags).toEqual({ platform: 'google', entityType: 'campaign' });
    expect(migrated.rules[0].source).toEqual(legacy.rules[0].source);
    expect(migrated.rules[1].parent).toEqual({ ruleId: 'rule-google', inheritSegmentIds: ['seg-type'] });
  });

  it('is idempotent: migrating a migrated document changes nothing', () => {
    expect(transformRuleSet(migrated)).toEqual(migrated);
  });

  it('prefers existing createdBy and updatedBy over ownerId', () => {
    const partly = transformRuleSet({ ...legacy, createdBy: 'carol', updatedBy: 'dave' });
    expect(partly.createdBy).toBe('carol');
    expect(partly.updatedBy).toBe('dave');
  });

  it('refuses a document that cannot be attributed', () => {
    const { ownerId: _ownerId, ...orphan } = legacy;
    expect(() => transformRuleSet(orphan)).toThrow(/cannot be attributed/);
  });
});

describe('collectDatasets and tenantDocument', () => {
  it('lists every dataset once, sorted, ignoring blanks', () => {
    const blank = { rules: [{ source: { dataset: '  ' } }, { source: { dataset: 'marketing' } }] };
    expect(collectDatasets([legacy, blank])).toEqual(['marketing', 'marketing_dw']);
  });

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

describe('verifyRuleSet', () => {
  it('passes a migrated document', () => {
    expect(verifyRuleSet(transformRuleSet(legacy))).toEqual([]);
  });

  it('reports flat values, a leftover ownerId and missing audit fields on an unmigrated document', () => {
    const issues = verifyRuleSet(legacy as unknown as ReturnType<typeof transformRuleSet>);
    expect(issues).toContain('createdBy is missing.');
    expect(issues).toContain('updatedBy is missing.');
    expect(issues).toContain('ownerId is still present.');
    expect(issues).toContain('Rule "Google Campaigns", segment "Campaign Type": 2 value(s) are not label/code entries.');
    expect(issues).toContain('Rule "Google Ad Groups", segment "Targeting": 1 value(s) are not label/code entries.');
  });

  it('reports the engine\'s authoring errors once the shape is right', () => {
    const unnamed = { ...transformRuleSet(legacy), name: '' };
    expect(verifyRuleSet(unnamed)).toEqual(['Give this Rule Set a name.']);
  });
});
