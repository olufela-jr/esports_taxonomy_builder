import { expect, test } from '@playwright/test';
import { marketDefinition, paidMediaRuleSet, readRuleSets, seedRuleSets } from './fixtures';

// v3 phase 2 step 3: a Rule's enum segment can take its values from a shared
// definition. Author offers the definitions that fit the Rule's platform,
// Build shows their labels and writes their codes, and the Dictionary refuses
// to delete a definition a Rule uses.

test('an admin points a segment at a definition, and Build offers its labels and writes its code', async ({ page }) => {
  await seedRuleSets(page, undefined, 'admin', [marketDefinition]);
  await page.goto('/author');
  await page.getByTestId('card-ruleset-ruleset-paid').click();

  // The Google Campaigns Rule's second segment, Market, moves from its own list to the shared Market.
  const source = page.getByTestId('select-segment-source-0-1');
  await expect(source).toHaveValue('');
  await source.selectOption('def-market');
  await expect(page.getByTestId('input-segment-values-0-1')).toHaveCount(0);
  await expect(page.getByTestId('text-segment-definition-0-1')).toContainText('United Kingdom');
  await page.getByTestId('button-save-ruleset').click();
  await expect(page.getByTestId('text-save-confirmation')).toBeVisible();

  const saved = (await readRuleSets(page)).find((ruleSet) => ruleSet.id === 'ruleset-paid');
  const market = saved?.rules[0].segments[1] as { definitionId?: string; allowedValues?: unknown[] };
  expect(market.definitionId).toBe('def-market');
  expect(market.allowedValues).toEqual([]);

  // Build resolves the definition: labels in the dropdown, the code in the name.
  await page.getByTestId('link-nav-build').click();
  await page.getByTestId('select-shell-rule').selectOption('rule-google');
  await page.getByTestId('select-build-campaign_type').selectOption('perf');
  const marketControl = page.getByTestId('select-build-market');
  await expect(marketControl.locator('option', { hasText: 'United States (us)' })).toHaveCount(1);
  await marketControl.selectOption('us');
  await expect(page.getByTestId('text-build-preview')).toHaveText('perf_us');
});

test('a Rule using a definition keeps it from being deleted, and a scoped definition is only offered on its platforms', async ({ page }) => {
  const usingMarket = {
    ...paidMediaRuleSet,
    rules: paidMediaRuleSet.rules.map((rule) => (rule.id === 'rule-google'
      ? { ...rule, segments: rule.segments.map((segment) => (segment.id === 'seg-market' ? { ...segment, allowedValues: [], definitionId: 'def-market' } : segment)) }
      : rule)),
  };
  const searchOnly = { ...marketDefinition, id: 'def-match', name: 'Match type', platforms: ['google', 'microsoft'], entries: [{ label: 'Broad', code: 'brd' }] };
  await seedRuleSets(page, [usingMarket], 'admin', [marketDefinition, searchOnly]);

  await page.goto('/dictionary');
  await page.getByTestId('card-definition-def-market').click();
  await expect(page.getByTestId('text-definition-dependents')).toContainText('Paid media (test) / Google Campaigns (Market)');
  await expect(page.getByTestId('button-delete-definition')).toBeDisabled();

  await page.getByTestId('link-nav-author').click();
  await page.getByTestId('card-ruleset-ruleset-paid').click();
  // The Google Rule may use the search-only definition; the Meta Rule is not offered it.
  await expect(page.getByTestId('select-segment-source-0-0').locator('option', { hasText: 'Match type' })).toHaveCount(1);
  await expect(page.getByTestId('select-segment-source-1-0').locator('option', { hasText: 'Match type' })).toHaveCount(0);
  await expect(page.getByTestId('select-segment-source-1-0').locator('option', { hasText: 'Market' })).toHaveCount(1);
});
