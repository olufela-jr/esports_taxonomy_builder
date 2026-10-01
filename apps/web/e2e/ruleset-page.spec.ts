import { expect, test } from '@playwright/test';
import { backToRuleSet, globalRuleSet, hierarchyRuleSet, openRule, readRuleSets, seedRuleSets } from './fixtures';

// The Rule Set page: Rules grouped by platform, children nested under their
// parent with inherited segments greyed, and one draft shared with each Rule's
// editor until Save.

test('Rules are grouped by platform, with children under their parent', async ({ page }) => {
  await seedRuleSets(page, [hierarchyRuleSet, globalRuleSet], 'admin');
  await page.goto('/rules/ruleset-paid');

  await expect(page.getByTestId('breadcrumbs')).toContainText('Rule Sets');
  await expect(page.getByTestId('breadcrumbs')).toContainText('Paid media (test)');
  const google = page.getByTestId('group-platform-google');
  await expect(google).toContainText('Google Ads');
  await expect(google.getByTestId('card-rule-node-rule-google')).toBeVisible();
  await expect(page.getByTestId('group-platform-meta').getByTestId('card-rule-node-rule-meta')).toBeVisible();

  // Google Ad Groups sits under Google Campaigns, its inherited segment greyed first.
  const parentNode = page.locator('li', { has: page.getByTestId('card-rule-node-rule-google') });
  await expect(parentNode.getByTestId('card-rule-node-rule-google-ad-groups')).toBeVisible();
  await expect(page.getByTestId('chips-node-1-seg-campaign_type')).toHaveAttribute('data-inherited', 'true');
  await expect(page.getByTestId('chips-node-1-seg-match')).not.toHaveAttribute('data-inherited', 'true');
  await expect(page.getByTestId('chips-node-1-delimiter').first()).toHaveText('_');

  // Clicking a Rule opens its editor at its own URL, which sets the context.
  await openRule(page, 1);
  await expect(page).toHaveURL(/\/rules\/ruleset-paid\/rule-google-ad-groups$/);
  await expect(page.getByTestId('breadcrumbs')).toContainText('Google Ad Groups');
  await expect(page.getByTestId('select-shell-rule')).toHaveValue('rule-google-ad-groups');
});

test('edits stay in the draft across the Rule Set page, a Rule and Build, until saved', async ({ page }) => {
  await seedRuleSets(page, [hierarchyRuleSet], 'admin');
  await page.goto('/rules/ruleset-paid');
  await page.getByTestId('input-ruleset-name').fill('Paid media, renamed');
  await openRule(page, 2);
  await page.getByTestId('input-rule-name-2').fill('Meta Ad Sets EU');
  await expect(page.getByTestId('text-unsaved')).toBeVisible();

  await page.getByTestId('link-nav-build').click();
  await page.getByTestId('link-nav-manage-rules').click();
  await page.getByTestId('card-ruleset-ruleset-paid').click();
  await expect(page.getByTestId('input-ruleset-name')).toHaveValue('Paid media, renamed');
  await expect(page.getByTestId('card-rule-node-rule-meta')).toContainText('Meta Ad Sets EU');

  await page.getByTestId('button-save-ruleset').click();
  await expect(page.getByTestId('text-save-confirmation')).toBeVisible();
  const saved = (await readRuleSets(page)).find((ruleSet) => ruleSet.id === 'ruleset-paid') as unknown as { name: string; rules: Array<{ name: string }> };
  expect(saved.name).toBe('Paid media, renamed');
  expect(saved.rules[2].name).toBe('Meta Ad Sets EU');
});

test('Add Rule opens the new Rule, and Remove takes it back out of the tree', async ({ page }) => {
  await seedRuleSets(page, [hierarchyRuleSet], 'admin');
  await page.goto('/rules/ruleset-paid');
  await page.getByTestId('button-add-rule').click();
  await expect(page.getByTestId('input-rule-name-3')).toHaveValue('Rule 4');
  await backToRuleSet(page);
  await expect(page.getByTestId('group-platform-none')).toContainText('Rule 4');

  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByTestId('button-remove-rule-3').click();
  await expect(page.getByTestId('group-platform-none')).toHaveCount(0);
});
