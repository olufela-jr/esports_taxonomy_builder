import { expect, test } from '@playwright/test';
import { hierarchyRuleSet, marketDefinition, openRule, openSegment, paidMediaRuleSet, readRuleSets, seedRuleSets } from './fixtures';

// The Rule editor: numbered segment chips in a sticky header, an example
// built by compose, and segments edited in a drawer beside the chips.

test('the chips number the segments in order, with the delimiter as its own chip', async ({ page }) => {
  await seedRuleSets(page, [hierarchyRuleSet], 'admin');
  await page.goto('/rules/ruleset-paid');
  await openRule(page, 0);

  await expect(page.getByTestId('chips-rule-index-campaign_type')).toHaveText('1');
  await expect(page.getByTestId('chips-rule-index-market')).toHaveText('2');
  await expect(page.getByTestId('chips-rule-seg-market')).toContainText('Market');
  await expect(page.getByTestId('chips-rule-delimiter')).toHaveText('_');

  // A child's chips start with what it inherits, greyed and numbered first.
  await page.getByTestId('crumb-1').click();
  await openRule(page, 1);
  await expect(page.getByTestId('chips-rule-seg-campaign_type')).toHaveAttribute('data-inherited', 'true');
  await expect(page.getByTestId('chips-rule-index-match')).toHaveText('2');
});

test('Show example is off by default and swaps the labels for a name from compose', async ({ page }) => {
  await seedRuleSets(page, [hierarchyRuleSet], 'admin');
  await page.goto('/rules/ruleset-paid');
  await openRule(page, 0);

  await expect(page.getByTestId('toggle-show-example')).not.toBeChecked();
  await expect(page.getByTestId('chips-rule-name')).toHaveCount(0);
  await page.getByTestId('toggle-show-example').check({ force: true });
  await expect(page.getByTestId('chips-rule-name')).toHaveText('brand_uk');
  await expect(page.getByTestId('chips-rule-seg-campaign_type')).toContainText('brand');
  await expect(page.getByTestId('chips-rule-errors')).toHaveCount(0);

  // Shuffling picks other allowed values; the name stays a valid one.
  for (let turn = 0; turn < 4; turn += 1) {
    await page.getByTestId('button-shuffle-example').click();
    await expect(page.getByTestId('chips-rule-name')).toHaveText(/^(brand|perf)_(uk|us)$/);
  }
  await page.getByTestId('toggle-show-example').uncheck({ force: true });
  await expect(page.getByTestId('chips-rule-seg-campaign_type')).toContainText('Campaign Type');
});

test('a chip opens its segment in a drawer beside the chips, at its own URL', async ({ page }) => {
  await seedRuleSets(page, [hierarchyRuleSet], 'admin');
  await page.goto('/rules/ruleset-paid');
  await openRule(page, 0);
  await openSegment(page, 'market');

  await expect(page).toHaveURL(/\/rules\/ruleset-paid\/rule-google\/segments\/seg-market$/);
  await expect(page.getByTestId('chips-rule-seg-market')).toHaveAttribute('data-selected', 'true');
  await expect(page.getByTestId('chips-rule-seg-campaign_type')).not.toHaveAttribute('data-selected', 'true');
  await expect(page.getByTestId('breadcrumbs')).toContainText('Rule Sets');
  await expect(page.getByTestId('breadcrumbs')).toContainText('Google Campaigns');
  await expect(page.getByTestId('crumb-3')).toHaveText('Market');
  await expect(page.getByTestId('drawer-segment')).toContainText('Segment 2 of 2');

  // Editing in the drawer shows on the chip straight away; the chips stay visible.
  await page.getByTestId('input-segment-label-0-1').fill('Region');
  await expect(page.getByTestId('chips-rule-seg-region')).toContainText('Region');
  await expect(page.getByTestId('chips-rule-seg-region')).toBeInViewport();

  await page.keyboard.press('Escape');
  await expect(page.getByTestId('drawer-segment')).toHaveCount(0);
  await expect(page).toHaveURL(/\/rules\/ruleset-paid\/rule-google$/);
});

test('an inherited chip opens read only, with a way to the Rule that owns it', async ({ page }) => {
  await seedRuleSets(page, [hierarchyRuleSet], 'admin');
  await page.goto('/rules/ruleset-paid');
  await openRule(page, 1);
  await openSegment(page, 'campaign_type');

  await expect(page.getByTestId('text-drawer-inherited')).toContainText('Inherited from Google Campaigns');
  await expect(page.getByTestId('input-segment-label-1-0')).toHaveCount(0);
  await page.getByTestId('link-drawer-owner').click();
  await expect(page).toHaveURL(/\/rules\/ruleset-paid\/rule-google\/segments\/seg-type$/);
  await expect(page.getByTestId('input-segment-label-0-0')).toHaveValue('Campaign Type');
});

test('a Global chip carries the badge, and its drawer links to Definitions instead of editing values', async ({ page }) => {
  const usingMarket = {
    ...paidMediaRuleSet,
    rules: paidMediaRuleSet.rules.map((rule) => (rule.id === 'rule-google'
      ? { ...rule, segments: rule.segments.map((segment) => (segment.id === 'seg-market' ? { ...segment, allowedValues: [], definitionId: 'def-market' } : segment)) }
      : rule)),
  };
  await seedRuleSets(page, [usingMarket], 'admin', [marketDefinition]);
  await page.goto('/rules/ruleset-paid');
  await openRule(page, 0);

  await expect(page.getByTestId('chips-rule-scope-market')).toHaveText('Global');
  await expect(page.getByTestId('chips-rule-scope-campaign_type')).toHaveText('Local');
  await openSegment(page, 'market');
  await expect(page.getByTestId('badge-drawer-scope')).toHaveText('Global');
  await expect(page.getByTestId('input-segment-values-0-1')).toHaveCount(0);
  await expect(page.getByTestId('link-drawer-definition')).toHaveAttribute('href', '/definitions/def-market');
});

test('segments are added, reordered by drag and removed, and the order is stored', async ({ page }) => {
  await seedRuleSets(page, [paidMediaRuleSet], 'admin');
  await page.goto('/rules/ruleset-paid');
  await openRule(page, 0);

  await page.getByTestId('button-add-segment-chip').click();
  await expect(page.getByTestId('chips-rule-index-segment_3')).toHaveText('3');
  await page.getByTestId('input-segment-label-0-2').fill('Channel');

  // Drag Channel onto Campaign Type: it moves to the front.
  await page.getByTestId('chips-rule-seg-channel').dragTo(page.getByTestId('chips-rule-seg-campaign_type'));
  await expect(page.getByTestId('chips-rule-index-channel')).toHaveText('1');
  await expect(page.getByTestId('chips-rule-index-campaign_type')).toHaveText('2');

  // Remove Market from its drawer: the chip leaves and the drawer closes.
  await openSegment(page, 'market');
  await page.getByTestId('button-remove-segment-0-2').click();
  await expect(page.getByTestId('chips-rule-seg-market')).toHaveCount(0);
  await expect(page.getByTestId('drawer-segment')).toHaveCount(0);

  await page.getByTestId('button-save-ruleset').click();
  await expect(page.getByTestId('text-save-confirmation')).toBeVisible();
  const saved = (await readRuleSets(page)).find((ruleSet) => ruleSet.id === 'ruleset-paid') as unknown as { rules: Array<{ segments: Array<{ key: string }> }> };
  expect(saved.rules[0].segments.map((segment) => segment.key)).toEqual(['channel', 'campaign_type']);
});
