import { expect, test } from '@playwright/test';
import { seedRuleSets } from './fixtures';

// The Check screen's All Rules flow: pooled figure, per-Rule cards, strict view,
// and the mode surviving a reload. Selectors are roles, labels, and stable
// behaviour test ids, so renaming the screen's component does not touch this file.

// Google: 2 of 3 valid. Meta: 2 of 3 valid. Pooled 4 of 6 = 67%.
// Strict (rows passing both Rules): only row 1, so 1 of 3 = 33%.
const csv = [
  'campaign_name,ad_set_name',
  'brand_uk,broad_gamers',
  'perf_de,exact_parents',
  'brand_us,lookalike_students',
].join('\n');

test.beforeEach(async ({ page }) => {
  await seedRuleSets(page);
  await page.goto('/check');
  await page.getByTestId('select-shell-ruleset').selectOption('ruleset-paid');
  await expect(page.getByRole('button', { name: 'All Rules' })).toBeVisible();
});

test('All Rules pools counts across Rules and shows a per-Rule breakdown', async ({ page }) => {
  await page.getByRole('button', { name: 'All Rules' }).click();
  await expect(page.getByRole('button', { name: 'All Rules' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('Expected columns: campaign_name, ad_set_name')).toBeVisible();

  await page.getByLabel('CSV data').fill(csv);
  await page.getByRole('button', { name: 'Validate names' }).click();

  await expect(page.getByTestId('text-pooled-percent')).toHaveText('67%');
  await expect(page.getByText('4 of 6 names valid, pooled across 2 Rules.')).toBeVisible();

  const googleCard = page.getByTestId('card-rule-google_campaigns');
  await expect(googleCard).toContainText('Google Campaigns');
  await expect(googleCard).toContainText('67%');
  await expect(googleCard).toContainText('2 of 3 valid');
  await expect(page.getByTestId('card-rule-meta_ad_sets')).toContainText('2 of 3 valid');

  await expect(page.getByTestId('breakdown-platform')).toContainText('google');
  await expect(page.getByTestId('breakdown-entity-type')).toContainText('ad_set');

  // The strict per-row figure is different from the pooled one, and labelled as secondary.
  await expect(page.getByTestId('text-strict-summary')).toContainText('1 of 3 rows (33%)');
});

test('the seeded sample CSV already matches the Rule Set\'s mapped columns', async ({ page }) => {
  await page.getByRole('button', { name: 'All Rules' }).click();
  await expect(page.getByLabel('CSV data')).toHaveValue(/^campaign_name,ad_set_name\n/);

  await page.getByRole('button', { name: 'Validate names' }).click();
  // One valid, one bad value, one short name per Rule: 1 of 3 each, 2 of 6 pooled.
  await expect(page.getByTestId('text-pooled-percent')).toHaveText('33%');
  await expect(page.getByTestId('card-rule-google_campaigns')).toContainText('1 of 3 valid');
});

test('a Rule whose column is missing is reported by name', async ({ page }) => {
  await page.getByRole('button', { name: 'All Rules' }).click();
  await page.getByLabel('CSV data').fill('campaign_name\nbrand_uk\nperf_de');
  await page.getByRole('button', { name: 'Validate names' }).click();

  const metaCard = page.getByTestId('card-rule-meta_ad_sets');
  await expect(metaCard).toContainText('Missing column');
  await expect(metaCard).toContainText('The CSV has no ad_set_name column');
  await expect(page.getByTestId('text-pooled-percent')).toHaveText('50%');
});

test('All Rules mode survives a reload', async ({ page }) => {
  await page.getByRole('button', { name: 'All Rules' }).click();
  await expect(page.getByRole('button', { name: 'All Rules' })).toHaveAttribute('aria-pressed', 'true');

  await page.reload();
  await expect(page.getByRole('button', { name: 'All Rules' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('select-shell-ruleset')).toHaveValue('ruleset-paid');
  await expect(page.getByText('Expected columns: campaign_name, ad_set_name')).toBeVisible();
});
