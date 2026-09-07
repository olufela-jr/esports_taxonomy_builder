import type { Page } from '@playwright/test';

// A two-Rule Rule Set in the current stored shape (v2), with tags, so tests can
// pick a Rule that is not the default first one. Seeded into localStorage before
// the app loads; every Playwright test starts with a fresh browser context, so
// nothing leaks between tests.
export const paidMediaRuleSet = {
  id: 'ruleset-paid',
  name: 'Paid media (test)',
  ownerId: 'you',
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
        { id: 'seg-type', kind: 'enum', key: 'campaign_type', label: 'Campaign Type', required: true, allowedValues: ['brand', 'perf'] },
        { id: 'seg-market', kind: 'enum', key: 'market', label: 'Market', required: true, allowedValues: ['uk', 'us'] },
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
        { id: 'seg-targeting', kind: 'enum', key: 'targeting', label: 'Targeting', required: true, allowedValues: ['broad', 'exact'] },
        { id: 'seg-audience', kind: 'freeform', key: 'audience', label: 'Audience', required: true, maxLength: 20, illegalChars: [' '] },
      ],
    },
  ],
};

// A second, single-Rule set so tests can switch Rule Sets and watch the Rule fall back.
export const globalRuleSet = {
  id: 'ruleset-global',
  name: 'Global campaign standard',
  ownerId: 'maya',
  createdAt: '2024-09-10T09:00:00.000Z',
  updatedAt: '2025-02-21T15:42:00.000Z',
  rules: [
    {
      id: 'rule-initiative',
      key: 'initiative_name',
      name: 'Initiative Name',
      delimiter: '-',
      source: { dataset: 'marketing_dw', table: 'initiatives', nameColumn: 'initiative_id' },
      segments: [
        { id: 'seg-region', kind: 'enum', key: 'region', label: 'Region', required: true, allowedValues: ['na', 'emea'] },
        { id: 'seg-initiative', kind: 'freeform', key: 'initiative', label: 'Initiative', required: true, maxLength: 32, illegalChars: [' '] },
      ],
    },
  ],
};

export const RULESETS_KEY = 'campaign-naming-rulesets-v2';
export const UI_STATE_KEY = 'campaign-tool-ui-state-v4';

export async function seedRuleSets(page: Page, ruleSets: unknown[] = [paidMediaRuleSet, globalRuleSet]) {
  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, value);
    },
    { key: RULESETS_KEY, value: JSON.stringify(ruleSets) },
  );
}

export const byTestId = (page: Page, id: string) => page.getByTestId(id);
