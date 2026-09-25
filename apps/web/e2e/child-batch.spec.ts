import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { hierarchyRuleSet, seedRuleSets } from './fixtures';

// D34: a child batch across many parent names, pasted or carried across.

test('pasted parents are checked, a bad one is removed, narrowing trims one parent, and the CSV carries the parent column', async ({ page }) => {
  await seedRuleSets(page, [hierarchyRuleSet], 'admin');
  await page.goto('/build');
  await page.getByTestId('select-shell-ruleset').selectOption('ruleset-paid');
  await page.getByTestId('select-shell-rule').selectOption('rule-google-ad-groups');
  await page.getByTestId('button-build-mode-batch').click();
  await expect(page.getByTestId('text-child-batch-empty')).toBeVisible();

  await page.getByTestId('textarea-parent-lines').fill('perf_uk\nbad_zz\nbrand_us');
  await expect(page.getByTestId('row-parent-failure-bad_zz')).toContainText('Value is not in the allowed list');
  await expect(page.getByTestId('button-child-batch-generate')).toBeDisabled();
  await page.getByTestId('button-remove-parent-bad_zz').click();
  await expect(page.getByTestId('list-parent-failures')).toHaveCount(0);

  await page.getByTestId('button-batch-select-all-match').click();
  await expect(page.getByTestId('text-parent-count-perf_uk')).toContainText('2 rows');
  await expect(page.getByTestId('text-child-batch-total')).toContainText('4');

  // Narrow perf_uk to broad only; brand_us keeps both.
  await page.getByTestId('button-narrow-perf_uk').click();
  await page.getByTestId('checkbox-narrow-perf_uk-match-exa').uncheck();
  await expect(page.getByTestId('text-parent-count-perf_uk')).toContainText('1 row');
  await expect(page.getByTestId('text-child-batch-total')).toContainText('3');
  await page.getByTestId('checkbox-narrow-perf_uk-match-brd').uncheck();
  await expect(page.getByTestId('text-parent-count-perf_uk')).toContainText('narrowed to nothing');
  await expect(page.getByTestId('text-child-batch-total')).toContainText('2');
  await page.getByTestId('checkbox-narrow-perf_uk-match-brd').check();

  await page.getByTestId('button-child-batch-generate').click();
  await expect(page.getByTestId('preview-group-perf_uk')).toContainText('perf_brd');
  await expect(page.getByTestId('preview-group-brand_us')).toContainText('brand_exa');
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('link-child-batch-download').click();
  const csv = readFileSync((await (await downloadPromise).path()) ?? '', 'utf8');
  expect(csv).toBe('parent_name,campaign_type,match,name\nperf_uk,perf,brd,perf_brd\nbrand_us,brand,brd,brand_brd\nbrand_us,brand,exa,brand_exa\n');

  // The CSV pastes back as parent input as it is: the name is the first column, the rest is
  // ignored, and the narrowing kept for perf_uk still applies (1 + 2 rows).
  await page.getByTestId('textarea-parent-lines').fill(csv);
  await expect(page.getByTestId('list-parent-failures')).toHaveCount(0);
  await expect(page.getByTestId('text-child-batch-total')).toContainText('3');
});

test('a parent batch carries a chosen subset of its names into the child batch', async ({ page }) => {
  await seedRuleSets(page, [hierarchyRuleSet], 'admin');
  await page.goto('/build');
  await page.getByTestId('select-shell-ruleset').selectOption('ruleset-paid');
  await page.getByTestId('select-shell-rule').selectOption('rule-google');
  await page.getByTestId('button-build-mode-batch').click();
  await page.getByTestId('checkbox-batch-campaign_type-brand').check();
  await page.getByTestId('button-batch-select-all-market').click();
  await page.getByTestId('button-batch-generate').click();

  await page.getByTestId('checkbox-carry-brand_us').uncheck();
  await page.getByTestId('button-carry-child-rule-google-ad-groups').click();
  await expect(page.getByTestId('select-shell-rule')).toHaveValue('rule-google-ad-groups');
  await expect(page.getByTestId('textarea-parent-lines')).toHaveValue('brand_uk');
  await page.getByTestId('checkbox-batch-match-exa').check();
  await expect(page.getByTestId('text-child-batch-total')).toContainText('1');
});
