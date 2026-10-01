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

// A child Rule under Google Campaigns inheriting its first segment, for the
// hierarchy tests (Author's parent picker, Build's parent step).
export const googleAdGroupsRule = {
  id: 'rule-google-ad-groups',
  key: 'google_ad_groups',
  name: 'Google Ad Groups',
  tags: { platform: 'google', entityType: 'ad_group' },
  delimiter: '_',
  parent: { ruleId: 'rule-google', inheritSegmentIds: ['seg-type'] },
  source: { dataset: 'marketing', table: 'ad_groups', nameColumn: 'ad_group_name' },
  segments: [
    { id: 'seg-match', kind: 'enum', key: 'match', label: 'Match type', required: true, allowedValues: [{ label: 'Broad', code: 'brd' }, { label: 'Exact', code: 'exa' }] },
  ],
};

export const hierarchyRuleSet = { ...paidMediaRuleSet, rules: [paidMediaRuleSet.rules[0], googleAdGroupsRule, paidMediaRuleSet.rules[1]] };

// Two shared definitions for the Dictionary tests: one for every platform, one
// scoped to search platforms.
export const marketDefinition = {
  id: 'def-market',
  name: 'Market',
  platforms: [],
  entries: [{ label: 'United Kingdom', code: 'uk' }, { label: 'United States', code: 'us' }],
  createdBy: 'maya',
  updatedBy: 'maya',
  createdAt: '2026-09-01T09:00:00.000Z',
  updatedAt: '2026-09-01T09:00:00.000Z',
};

export const objectiveDefinition = {
  id: 'def-objective',
  name: 'Campaign objective',
  platforms: ['google', 'microsoft'],
  entries: [{ label: 'Awareness', code: 'AWA' }],
  createdBy: 'maya',
  updatedBy: 'maya',
  createdAt: '2026-09-02T09:00:00.000Z',
  updatedAt: '2026-09-02T09:00:00.000Z',
};

// role: the local user is an admin unless a test asks for a standard user.
// definitions and requests seed the Dictionary; both default to empty.
export async function seedRuleSets(page: Page, ruleSets: unknown[] = [paidMediaRuleSet, globalRuleSet], role: 'admin' | 'user' = 'admin', definitions: unknown[] = [], requests: unknown[] = [], drafts: unknown[] = []) {
  await page.addInitScript(({ seed, role, definitions, requests, drafts }) => {
    window.__taxoTestSeed = seed;
    window.__taxoTestRole = role;
    window.__taxoTestDefinitions = definitions;
    window.__taxoTestRequests = requests;
    window.__taxoTestDrafts = drafts;
  }, { seed: ruleSets as never, role, definitions: definitions as never, requests: requests as never, drafts: drafts as never });
}

export async function readDrafts(page: Page): Promise<Array<{ id: string; ruleId: string; selections: Record<string, string[] | string>; parentName: string; blockedSegmentKey: string; requestId: string; status: string }>> {
  return page.evaluate(() => {
    const store = window.__taxoStore;
    if (!store) throw new Error('The app did not expose __taxoStore; was it started with a test seed?');
    return JSON.parse(JSON.stringify(store.drafts.getSnapshot()));
  });
}

export async function readDefinitions(page: Page): Promise<Array<{ id: string; name: string; platforms: string[]; entries: Array<{ label: string; code: string }> }>> {
  return page.evaluate(() => {
    const store = window.__taxoStore;
    if (!store) throw new Error('The app did not expose __taxoStore; was it started with a test seed?');
    return JSON.parse(JSON.stringify(store.definitions.getSnapshot()));
  });
}

export async function readRequests(page: Page): Promise<Array<{ id: string; definitionId: string; label: string; code: string; status: string; reason: string }>> {
  return page.evaluate(() => {
    const store = window.__taxoStore;
    if (!store) throw new Error('The app did not expose __taxoStore; was it started with a test seed?');
    return JSON.parse(JSON.stringify(store.requests.getSnapshot()));
  });
}

// Members of the local workspace besides the local user ("you"), and invites,
// for the Members screen. Both are separate init hooks so existing seeds are untouched.
export const umaMember = { uid: 'uma', email: 'uma@acme.test', name: 'Uma Ortiz', role: 'user', updatedAt: '2026-09-20T09:00:00.000Z' };
export const carolMember = { uid: 'carol', email: 'carol@acme.test', name: 'Carol Chen', role: 'admin', updatedAt: '2026-09-21T09:00:00.000Z' };
export const pendingInvite = { id: 'inv-new', email: 'new@acme.test', role: 'user', status: 'pending', invitedBy: 'you', acceptedBy: null, createdAt: '2026-09-22T09:00:00.000Z', updatedAt: '2026-09-22T09:00:00.000Z' };

export async function seedMembers(page: Page, members: unknown[], invites: unknown[] = []) {
  await page.addInitScript(({ members, invites }) => {
    window.__taxoTestMembers = members;
    window.__taxoTestInvites = invites;
  }, { members: members as never, invites: invites as never });
}

export async function readMembers(page: Page): Promise<Array<{ uid: string; name: string; role: string }>> {
  return page.evaluate(() => {
    const store = window.__taxoStore;
    if (!store) throw new Error('The app did not expose __taxoStore; was it started with a test seed?');
    return JSON.parse(JSON.stringify(store.members.getSnapshot()));
  });
}

export async function readInvites(page: Page): Promise<Array<{ id: string; email: string; role: string; status: string }>> {
  return page.evaluate(() => {
    const store = window.__taxoStore;
    if (!store) throw new Error('The app did not expose __taxoStore; was it started with a test seed?');
    return JSON.parse(JSON.stringify(store.invites.getSnapshot()));
  });
}

// A second tenant for the super user's directory, in memory mode.
export const northWindTenant = { id: 'north-wind', name: 'North Wind', config: { allowedDatasets: ['marketing_dw'], platforms: ['google'] }, createdAt: '2026-09-25T09:00:00.000Z', updatedAt: '2026-09-25T09:00:00.000Z' };

// Runs the local user as the super user (still admin of the local workspace
// unless the role hook says otherwise) with these extra tenants to look at.
export async function seedSuper(page: Page, tenants: unknown[] = [northWindTenant]) {
  await page.addInitScript((tenants) => {
    window.__taxoTestSuper = true;
    window.__taxoTestTenants = tenants;
  }, tenants as never);
}

// The Rule Sets as the app currently holds them, read back through the store.
export async function readRuleSets(page: Page): Promise<Array<{ id: string; name: string; updatedAt: string; rules: Array<{ id: string; segments: Array<{ allowedValues?: Array<{ label: string; code: string }> }> }> }>> {
  return page.evaluate(() => {
    const store = window.__taxoStore;
    if (!store) throw new Error('The app did not expose __taxoStore; was it started with a test seed?');
    return JSON.parse(JSON.stringify(store.ruleSets.getSnapshot()));
  });
}

// Access requests from accounts with no workspace yet. The local user's own
// request uses its uid, "you"; the others are strangers in the super user's queue.
export const samRequest = { uid: 'sam', email: 'sam@elsewhere.test', name: 'Sam Rivera', status: 'pending', tenantId: null, role: null, decidedBy: null, createdAt: '2026-09-29T09:00:00.000Z', updatedAt: '2026-09-29T09:00:00.000Z' };
export const tessRequest = { uid: 'tess', email: 'tess@elsewhere.test', name: 'Tess Okafor', status: 'declined', tenantId: null, role: null, decidedBy: 'you', createdAt: '2026-09-28T09:00:00.000Z', updatedAt: '2026-09-28T10:00:00.000Z' };

export async function seedAccessRequests(page: Page, requests: unknown[]) {
  await page.addInitScript((requests) => {
    window.__taxoTestAccessRequests = requests;
  }, requests as never);
}

// Runs the local user signed in but with no workspace (no tenant or role claim).
export async function seedNoWorkspace(page: Page) {
  await page.addInitScript(() => {
    window.__taxoTestNoWorkspace = true;
  });
}

// Manage Rules: open a Rule of the Rule Set page that is showing, by its
// place in the Rule Set, and go back up to the Rule Set page.
export async function openRule(page: Page, index: number) {
  await page.getByTestId(`link-rule-node-${index}`).click();
  await page.getByTestId(`card-rule-${index}`).waitFor();
}

export async function backToRuleSet(page: Page) {
  await page.getByTestId('crumb-1').click();
  await page.getByTestId('list-rule-groups').waitFor();
}

// In the Rule editor: open a segment in the drawer by clicking its chip.
export async function openSegment(page: Page, key: string) {
  await page.getByTestId(`chips-rule-seg-${key}`).click();
  await page.getByTestId('drawer-segment').waitFor();
}
