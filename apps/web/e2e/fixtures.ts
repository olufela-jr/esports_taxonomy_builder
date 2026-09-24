import type { Page } from '@playwright/test';

// Seed data for the browser tests, injected through the store module's test hook
// rather than any storage key: `window.__taxoTestSeed` makes the app start an
// in-memory store with exactly this data and no persistence, and the store is
// exposed as `window.__taxoStore` so tests read back through it. Every Playwright
// test starts with a fresh browser context, so nothing leaks between tests.

// A two-Rule Rule Set with tags, so tests can pick a Rule that is not the first.
export const paidMediaRuleSet = {
  id: 'ruleset-paid',
  name: 'Paid media (test)',
  createdBy: 'you',
  updatedBy: 'you',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  rules: [
    {
      id: 'rule-google',
      key: 'google_campaigns',
      name: 'Google Campaigns',
      tags: { platform: 'google', entityType: 'campaign' },
      delimiter: '_',
      source: { dataset: 'marketing', table: 'campaigns', nameColumn: 'campaign_name' },
      segments: [
        { id: 'seg-type', kind: 'enum', key: 'campaign_type', label: 'Campaign Type', required: true, allowedValues: [{ label: 'brand', code: 'brand' }, { label: 'perf', code: 'perf' }] },
        { id: 'seg-market', kind: 'enum', key: 'market', label: 'Market', required: true, allowedValues: [{ label: 'uk', code: 'uk' }, { label: 'us', code: 'us' }] },
      ],
    },
    {
      id: 'rule-meta',
      key: 'meta_ad_sets',
      name: 'Meta Ad Sets',
      tags: { platform: 'meta', entityType: 'ad_set' },
      delimiter: '_',
      source: { dataset: 'marketing', table: 'ad_sets', nameColumn: 'ad_set_name' },
      segments: [
        { id: 'seg-targeting', kind: 'enum', key: 'targeting', label: 'Targeting', required: true, allowedValues: [{ label: 'broad', code: 'broad' }, { label: 'exact', code: 'exact' }] },
        { id: 'seg-audience', kind: 'freeform', key: 'audience', label: 'Audience', required: true, maxLength: 20, illegalChars: [' '] },
      ],
    },
  ],
};

// A second, single-Rule set created by someone else, so tests can switch Rule
// Sets, watch the Rule fall back, and prove the role rather than the creator
// decides who edits.
export const globalRuleSet = {
  id: 'ruleset-global',
  name: 'Global campaign standard',
  createdBy: 'maya',
  updatedBy: 'maya',
  createdAt: '2026-09-01T09:00:00.000Z',
  updatedAt: '2026-09-01T15:42:00.000Z',
  rules: [
    {
      id: 'rule-initiative',
      key: 'initiative_name',
      name: 'Initiative Name',
      delimiter: '-',
      source: { dataset: 'marketing_dw', table: 'initiatives', nameColumn: 'initiative_id' },
      segments: [
        { id: 'seg-region', kind: 'enum', key: 'region', label: 'Region', required: true, allowedValues: [{ label: 'na', code: 'na' }, { label: 'emea', code: 'emea' }] },
        { id: 'seg-initiative', kind: 'freeform', key: 'initiative', label: 'Initiative', required: true, maxLength: 32, illegalChars: [' '] },
      ],
    },
  ],
};

// UI selection state (Rule Set, Rule, last action, check mode) is per-browser and
// stays in localStorage; one test asserts on it directly.
export const UI_STATE_KEY = 'campaign-tool-ui-state-v4';

// role: the local user is an admin unless a test asks for a standard user.
export async function seedRuleSets(page: Page, ruleSets: unknown[] = [paidMediaRuleSet, globalRuleSet], role: 'admin' | 'user' = 'admin') {
  await page.addInitScript(({ seed, role }) => {
    window.__taxoTestSeed = seed;
    window.__taxoTestRole = role;
  }, { seed: ruleSets as never, role });
}

// The Rule Sets as the app currently holds them, read back through the store.
export async function readRuleSets(page: Page): Promise<Array<{ id: string; name: string; updatedAt: string; rules: Array<{ id: string; segments: Array<{ allowedValues?: Array<{ label: string; code: string }> }> }> }>> {
  return page.evaluate(() => {
    const store = window.__taxoStore;
    if (!store) throw new Error('The app did not expose __taxoStore; was it started with a test seed?');
    return JSON.parse(JSON.stringify(store.getSnapshot()));
  });
}
