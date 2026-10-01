import { expect, test, type Page } from '@playwright/test';
import { hierarchyRuleSet, marketDefinition, objectiveDefinition, openRule, openSegment, seedRuleSets } from './fixtures';

// The Definitions page: Global definitions and Local lists in one list, with
// scope, platform and search filters, and the Rules that use each list.

// Google Campaigns reads Market from the Global definition; its Campaign Type
// is a Local list that Google Ad Groups inherits.
const usingMarket = {
  ...hierarchyRuleSet,
  rules: hierarchyRuleSet.rules.map((rule) => (rule.id === 'rule-google'
    ? { ...rule, segments: rule.segments.map((segment) => (segment.id === 'seg-market' ? { ...segment, allowedValues: [], definitionId: 'def-market' } : segment)) }
    : rule)),
};
const metaOnly = { ...marketDefinition, id: 'def-meta', name: 'Meta placement', platforms: ['meta'], entries: [{ label: 'Feed', code: 'feed' }] };

async function seed(page: Page, role: 'admin' | 'user' = 'admin') {
  await seedRuleSets(page, [usingMarket], role, [marketDefinition, objectiveDefinition, metaOnly]);
}

test('Global and Local lists share one list, with badges, usage counts and a scope filter', async ({ page }) => {
  await seed(page);
  await page.goto('/definitions');

  await expect(page.getByTestId('badge-scope-def-market')).toHaveText('Global');
  await expect(page.getByTestId('card-definition-def-objective')).toContainText('Google Ads');
  await expect(page.getByTestId('badge-scope-local-seg-type')).toHaveText('Local');
  await expect(page.getByTestId('card-definition-local-seg-type')).toContainText('Paid media (test) / Google Campaigns');
  // Market is a Global now, so it has no Local row.
  await expect(page.getByTestId('card-definition-local-seg-market')).toHaveCount(0);

  await expect(page.getByTestId('text-usage-def-market')).toHaveText('Used by 1 Rule');
  await expect(page.getByTestId('text-usage-def-objective')).toHaveText('Not used yet');
  // The child inherits Campaign Type, so the Local list serves two Rules.
  await expect(page.getByTestId('text-usage-local-seg-type')).toHaveText('Used by 2 Rules');

  await page.getByTestId('button-scope-global').click();
  await expect(page.getByTestId('card-definition-local-seg-type')).toHaveCount(0);
  await expect(page.getByTestId('card-definition-def-market')).toBeVisible();
  await page.getByTestId('button-scope-local').click();
  await expect(page.getByTestId('card-definition-def-market')).toHaveCount(0);
  await expect(page.getByTestId('card-definition-local-seg-match')).toBeVisible();
});

test('a platform shows its Global definitions, unrestricted ones by default, and its Rules\' Local lists', async ({ page }) => {
  await seed(page);
  await page.goto('/definitions');
  await page.getByTestId('select-definitions-platform').selectOption('google');

  await expect(page.getByTestId('card-definition-def-objective')).toBeVisible();
  await expect(page.getByTestId('card-definition-def-market')).toBeVisible();
  await expect(page.getByTestId('card-definition-def-meta')).toHaveCount(0);
  await expect(page.getByTestId('card-definition-local-seg-type')).toBeVisible();
  await expect(page.getByTestId('card-definition-local-seg-targeting')).toHaveCount(0);

  await expect(page.getByTestId('checkbox-include-unrestricted')).toBeChecked();
  await page.getByTestId('checkbox-include-unrestricted').uncheck();
  await expect(page.getByTestId('card-definition-def-market')).toHaveCount(0);
  await expect(page.getByTestId('card-definition-def-objective')).toBeVisible();
});

test('search narrows the list by name or Rule', async ({ page }) => {
  await seed(page);
  await page.goto('/definitions');
  await page.getByTestId('input-definitions-search').fill('match');
  await expect(page.getByTestId('card-definition-local-seg-match')).toBeVisible();
  await expect(page.getByTestId('card-definition-def-market')).toHaveCount(0);
  await expect(page.getByTestId('card-definition-local-seg-type')).toHaveCount(0);
  await page.getByTestId('input-definitions-search').fill('nothing like this');
  await expect(page.getByTestId('text-definitions-empty')).toContainText('Nothing matches');
});

test('usage links open the segment in its Rule, and a Local list offers Edit in rule', async ({ page }) => {
  await seed(page);
  await page.goto('/definitions');
  await page.getByTestId('card-definition-local-seg-type').click();
  await expect(page).toHaveURL(/\/definitions\/local\/ruleset-paid\/seg-type$/);
  await expect(page.getByTestId('row-local-value-brand')).toBeVisible();
  await expect(page.getByTestId('section-definition-usage')).toContainText('Used by 2 Rules');
  await expect(page.getByTestId('section-definition-usage')).toContainText('inherited');

  await page.getByTestId('link-usage-rule-google-ad-groups').click();
  await expect(page).toHaveURL(/\/rules\/ruleset-paid\/rule-google-ad-groups\/segments\/seg-type$/);
  await expect(page.getByTestId('text-drawer-inherited')).toContainText('Google Campaigns');

  await page.goto('/definitions/local/ruleset-paid/seg-type');
  await page.getByTestId('link-local-edit').click();
  await expect(page).toHaveURL(/\/rules\/ruleset-paid\/rule-google\/segments\/seg-type$/);
  await expect(page.getByTestId('input-segment-label-0-0')).toHaveValue('Campaign Type');
});

test('a Global chip\'s drawer opens that definition in Definitions', async ({ page }) => {
  await seed(page);
  await page.goto('/rules/ruleset-paid');
  await openRule(page, 0);
  await openSegment(page, 'market');
  await page.getByTestId('link-drawer-definition').click();
  await expect(page).toHaveURL(/\/definitions\/def-market$/);
  await expect(page.getByTestId('input-definition-name')).toHaveValue('Market');
  await expect(page.getByTestId('card-definition-def-market')).toHaveClass(/border-primary/);
});

test('a standard user sees both kinds of list, with usage as plain text', async ({ page }) => {
  await seed(page, 'user');
  await page.goto('/definitions/local/ruleset-paid/seg-type');
  await expect(page.getByTestId('view-local-definition')).toBeVisible();
  await expect(page.getByTestId('text-usage-rule-rule-google')).toBeVisible();
  await expect(page.getByTestId('link-usage-rule-google')).toHaveCount(0);
  await expect(page.getByTestId('link-local-edit')).toHaveCount(0);

  await page.getByTestId('card-definition-def-market').click();
  await expect(page.getByTestId('view-definition')).toBeVisible();
  await expect(page.getByTestId('form-request')).toBeVisible();
});
