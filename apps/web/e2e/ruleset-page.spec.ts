import { expect, test } from '@playwright/test';
import { backToRuleSet, globalRuleSet, hierarchyRuleSet, openRule, readRuleSets, seedRuleSets } from './fixtures';

// The Rule Set page: a table of its Rules to find one in, and one draft
// shared with each Rule's page until Save.

test('Rules are listed in a table with platform and parent, and a filter finds one', async ({ page }) => {
  await seedRuleSets(page, [hierarchyRuleSet, globalRuleSet], 'admin');
  await page.goto('/rules/ruleset-paid');

  await expect(page.getByTestId('breadcrumbs')).toContainText('Rule Sets');
  await expect(page.getByTestId('breadcrumbs')).toContainText('Paid media (test)');
  await expect(page.getByTestId('cell-rule-platform-rule-google')).toHaveText('Google Ads');
  await expect(page.getByTestId('cell-rule-platform-rule-meta')).toHaveText('Meta');
  await expect(page.getByTestId('cell-rule-parent-rule-google-ad-groups')).toHaveText('Google Campaigns');
  await expect(page.getByTestId('cell-rule-parent-rule-google')).toHaveText('-');
  // A parent cannot be removed while a child inherits from it.
  await expect(page.getByTestId('button-remove-rule-0')).toBeDisabled();

  await page.getByTestId('input-find-rule').fill('meta');
  await expect(page.getByTestId('row-rule-rule-meta')).toBeVisible();
  await expect(page.getByTestId('row-rule-rule-google')).toHaveCount(0);
  await page.getByTestId('input-find-rule').fill('nothing like this');
  await expect(page.getByTestId('text-no-rule-match')).toBeVisible();
  await page.getByTestId('input-find-rule').fill('');

  // Clicking a Rule opens it on its own page, which sets the context.
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
  await expect(page.getByTestId('row-rule-rule-meta')).toContainText('Meta Ad Sets EU');

  await page.getByTestId('button-save-ruleset').click();
  await expect(page.getByTestId('text-save-confirmation')).toBeVisible();
  const saved = (await readRuleSets(page)).find((ruleSet) => ruleSet.id === 'ruleset-paid') as unknown as { name: string; rules: Array<{ name: string }> };
  expect(saved.name).toBe('Paid media, renamed');
  expect(saved.rules[2].name).toBe('Meta Ad Sets EU');
});

test('Add Rule opens the new Rule, and Remove takes it back out of the table', async ({ page }) => {
  await seedRuleSets(page, [hierarchyRuleSet], 'admin');
  await page.goto('/rules/ruleset-paid');
  await page.getByTestId('button-add-rule').click();
  await expect(page.getByTestId('input-rule-name-3')).toHaveValue('Rule 4');
  await backToRuleSet(page);
  await expect(page.getByTestId('table-rules')).toContainText('Rule 4');

  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByTestId('button-remove-rule-3').click();
  await expect(page.getByTestId('table-rules')).not.toContainText('Rule 4');
});
