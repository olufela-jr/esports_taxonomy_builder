import { expect, test } from '@playwright/test';
import { hierarchyRuleSet, seedRuleSets } from './fixtures';

// v3 phase 2 step 6: a child Rule is built under a parent name, pasted or
// carried across from a build of the parent, with the inherited segments
// filled and locked; a bad parent name stops the flow.

test('a child is built under a pasted parent name; a non-compliant parent blocks it', async ({ page }) => {
  await seedRuleSets(page, [hierarchyRuleSet], 'admin');
  await page.goto('/build');
  await page.getByTestId('select-shell-ruleset').selectOption('ruleset-paid');
  await page.getByTestId('select-shell-rule').selectOption('rule-google-ad-groups');

  await expect(page.getByTestId('section-build-parent')).toBeVisible();
  await expect(page.getByTestId('section-build-segments')).toBeHidden();

  await page.getByTestId('input-build-parent').fill('nope_zz');
  await expect(page.getByTestId('status-build-parent-violations')).toContainText('Value is not in the allowed list');
  await expect(page.getByTestId('section-build-segments')).toBeHidden();

  await page.getByTestId('input-build-parent').fill('perf_uk');
  await expect(page.getByTestId('text-build-parent-ok')).toBeVisible();
  await expect(page.getByTestId('section-build-segments')).toBeVisible();
  await expect(page.getByTestId('select-build-campaign_type')).toBeDisabled();
  await expect(page.getByTestId('select-build-campaign_type')).toHaveValue('perf');
  await expect(page.getByTestId('badge-inherited-campaign_type')).toBeVisible();

  await page.getByTestId('select-build-match').selectOption('exa');
  await expect(page.getByTestId('text-build-preview')).toHaveText('perf_exa');
  await expect(page.getByTestId('button-copy-build-name')).toBeEnabled();
});

test('chaining from a parent build carries the name into the child and switches the persistent Rule', async ({ page }) => {
  await seedRuleSets(page, [hierarchyRuleSet], 'admin');
  await page.goto('/build');
  await page.getByTestId('select-shell-ruleset').selectOption('ruleset-paid');
  await page.getByTestId('select-shell-rule').selectOption('rule-google');

  await page.getByTestId('select-build-campaign_type').selectOption('brand');
  await page.getByTestId('select-build-market').selectOption('us');
  await expect(page.getByTestId('text-build-preview')).toHaveText('brand_us');
  await page.getByTestId('button-build-child-rule-google-ad-groups').click();

  await expect(page.getByTestId('select-shell-rule')).toHaveValue('rule-google-ad-groups');
  await expect(page.getByTestId('input-build-parent')).toHaveValue('brand_us');
  await expect(page.getByTestId('select-build-campaign_type')).toHaveValue('brand');
  await page.getByTestId('select-build-match').selectOption('brd');
  await expect(page.getByTestId('text-build-preview')).toHaveText('brand_brd');

  // The Rule selection made by chaining is the persistent context: it survives a refresh.
  await page.reload();
  await expect(page.getByTestId('select-shell-rule')).toHaveValue('rule-google-ad-groups');
  await expect(page.getByTestId('section-build-parent')).toBeVisible();
});
