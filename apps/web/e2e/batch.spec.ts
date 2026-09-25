import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { paidMediaRuleSet, seedRuleSets } from './fixtures';

// Phase 3: Build's Batch mode generates every combination as a CSV of codes.

test('a batch of two types by all markets counts four, previews four, and downloads a CSV of codes', async ({ page }) => {
  await seedRuleSets(page, [paidMediaRuleSet], 'admin');
  await page.goto('/build');
  await page.getByTestId('select-shell-ruleset').selectOption('ruleset-paid');
  await page.getByTestId('select-shell-rule').selectOption('rule-google');
  await page.getByTestId('button-build-mode-batch').click();

  await expect(page.getByTestId('text-batch-count')).toContainText('0');
  await expect(page.getByTestId('button-batch-generate')).toBeDisabled();
  await page.getByTestId('checkbox-batch-campaign_type-brand').check();
  await page.getByTestId('checkbox-batch-campaign_type-perf').check();
  await page.getByTestId('button-batch-select-all-market').click();
  await expect(page.getByTestId('text-batch-count')).toContainText('4');

  await page.getByTestId('button-batch-generate').click();
  await expect(page.getByTestId('row-batch-0')).toContainText('brand_uk');
  await expect(page.getByTestId('row-batch-3')).toContainText('perf_us');

  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('link-batch-download').click();
  const download = await downloadPromise;
  const csv = readFileSync((await download.path()) ?? '', 'utf8');
  expect(csv).toBe('campaign_type,market,name\nbrand,uk,brand_uk\nbrand,us,brand_us\nperf,uk,perf_uk\nperf,us,perf_us\n');
});

test('freeform values come one per line and the count follows them', async ({ page }) => {
  await seedRuleSets(page, [paidMediaRuleSet], 'admin');
  await page.goto('/build');
  await page.getByTestId('select-shell-ruleset').selectOption('ruleset-paid');
  await page.getByTestId('select-shell-rule').selectOption('rule-meta');
  await page.getByTestId('button-build-mode-batch').click();

  await page.getByTestId('checkbox-batch-targeting-broad').check();
  await page.getByTestId('textarea-batch-audience').fill('runners\nwalkers\n');
  await expect(page.getByTestId('text-batch-count')).toContainText('2');
  // A bad line is refused before anything is generated.
  await page.getByTestId('textarea-batch-audience').fill('runners\nno spaces here');
  await expect(page.getByTestId('list-batch-errors')).toContainText('illegal character');
  await expect(page.getByTestId('button-batch-generate')).toBeDisabled();
});
