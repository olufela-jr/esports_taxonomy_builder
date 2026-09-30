import { expect, test } from '@playwright/test';
import { seedRuleSets } from './fixtures';

// The Compliance board: the pooled figure, why names fail, which segments and
// values fail, the per-Rule grid, the drill, and the strict secondary view.
// Successor to check-all-rules.spec.ts, which covered the same numbers while
// this lived inside Check. Selectors are roles, labels, and stable behaviour
// test ids, so renaming the screen's component does not touch this file.

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
  await page.goto('/compliance');
  await page.getByTestId('select-shell-ruleset').selectOption('ruleset-paid');
  await expect(page.getByTestId('button-run-compliance')).toBeVisible();
});

test('the board pools counts across Rules and says why names fail', async ({ page }) => {
  await expect(page.getByText('Expected columns: campaign_name, ad_set_name')).toBeVisible();

  await page.getByLabel('CSV data').fill(csv);
  await page.getByTestId('button-run-compliance').click();

  // The same pooled figure the All Rules view reported for this CSV.
  await expect(page.getByTestId('text-compliance-percent')).toHaveText('67%');
  await expect(page.getByText('4 of 6 names valid, pooled across 2 Rules.')).toBeVisible();

  // Why: one cause, two names, grouped by code rather than by wording.
  const cause = page.getByTestId('row-cause-valueNotAllowed');
  await expect(cause).toContainText('Value is not in the allowed list');
  await expect(cause).toContainText('2');

  // Which segment, pooled across Rules.
  await expect(page.getByTestId('row-segment-seg-market')).toContainText('Market');
  await expect(page.getByTestId('row-segment-seg-targeting')).toContainText('Targeting');

  // Which value, with the engine's own suggestion.
  const value = page.getByTestId('row-value-seg-market-de');
  await expect(value).toContainText('de');
  await expect(value).toContainText('Did you mean "uk"?');

  await expect(page.getByTestId('breakdown-compliance-platform')).toContainText('google');
  await expect(page.getByTestId('breakdown-compliance-entity')).toContainText('ad_set');

  // The strict per-row figure is different from the pooled one, and secondary.
  await expect(page.getByTestId('text-strict-summary')).toContainText('1 of 3 rows (33%)');
});

test('the per-Rule grid reports each Rule and opens one in Check', async ({ page }) => {
  await page.getByLabel('CSV data').fill(csv);
  await page.getByTestId('button-run-compliance').click();

  const google = page.getByTestId('row-health-rule-google');
  await expect(google).toContainText('Google Campaigns');
  await expect(google).toContainText('2 / 3');
  await expect(google).toContainText('67%');
  await expect(page.getByTestId('row-health-rule-meta')).toContainText('2 / 3');

  // The board is the way in to checking one Rule on its own.
  await page.getByTestId('row-health-rule-meta').click();
  await expect(page).toHaveURL(/\/check$/);
  await expect(page.getByTestId('select-shell-rule')).toHaveValue('rule-meta');
});

test('a breakdown row drills down to the names underneath it', async ({ page }) => {
  await page.getByLabel('CSV data').fill(csv);
  await page.getByTestId('button-run-compliance').click();

  await page.getByTestId('row-value-seg-market-de').click();
  const drill = page.getByTestId('panel-drill');
  await expect(drill).toContainText('market = de');
  await expect(drill.getByTestId('row-drill-perf_de')).toBeVisible();
  await expect(drill.getByTestId('row-drill-lookalike_students')).toHaveCount(0);

  // A cause row gathers both Rules' failures.
  await page.getByTestId('row-cause-valueNotAllowed').click();
  await expect(drill.getByTestId('row-drill-perf_de')).toBeVisible();
  await expect(drill.getByTestId('row-drill-lookalike_students')).toBeVisible();

  await page.getByTestId('button-close-drill').click();
  await expect(drill).toHaveCount(0);
});

test('a Rule whose column is missing is skipped by name, not counted as a cause', async ({ page }) => {
  await page.getByLabel('CSV data').fill('campaign_name\nbrand_uk\nperf_de');
  await page.getByTestId('button-run-compliance').click();

  const meta = page.getByTestId('row-health-rule-meta');
  await expect(meta).toContainText('The CSV has no ad_set_name column');
  // Skipped, so it drags nothing into the pooled figure or the causes.
  await expect(page.getByTestId('text-compliance-percent')).toHaveText('50%');
  await expect(page.getByTestId('row-cause-unclassified')).toHaveCount(0);
});

test('the seeded sample CSV already matches the Rule Set\'s mapped columns', async ({ page }) => {
  await expect(page.getByLabel('CSV data')).toHaveValue(/^campaign_name,ad_set_name\n/);

  await page.getByTestId('button-run-compliance').click();
  // One valid, one bad value, one short name per Rule: 1 of 3 each, 2 of 6 pooled.
  await expect(page.getByTestId('text-compliance-percent')).toHaveText('33%');
  await expect(page.getByTestId('row-health-rule-google')).toContainText('1 / 3');
});

test('Compliance is its own action and survives a reload', async ({ page }) => {
  await expect(page.getByTestId('link-nav-compliance')).toBeVisible();

  await page.reload();
  await expect(page).toHaveURL(/\/compliance$/);
  await expect(page.getByTestId('select-shell-ruleset')).toHaveValue('ruleset-paid');
  await expect(page.getByText('Expected columns: campaign_name, ad_set_name')).toBeVisible();
});

test('Check points at the board instead of checking every Rule itself', async ({ page }) => {
  await page.getByTestId('link-nav-check').click();
  await expect(page.getByTestId('button-mode-all')).toHaveCount(0);

  await page.getByTestId('link-compliance-board').click();
  await expect(page).toHaveURL(/\/compliance$/);
});
