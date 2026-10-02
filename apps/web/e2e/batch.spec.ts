import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { marketDefinition, paidMediaRuleSet, seedRuleSets } from './fixtures';

// Phase 3: Build (batch only) generates every combination as a CSV of codes.

test('a batch of two types by all markets counts four, previews four, and downloads a CSV of codes', async ({ page }) => {
  await seedRuleSets(page, [paidMediaRuleSet], 'admin');
  await page.goto('/build');
  await page.getByTestId('select-shell-ruleset').selectOption('ruleset-paid');
  await page.getByTestId('select-shell-rule').selectOption('rule-google');

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

  await page.getByTestId('checkbox-batch-targeting-broad').check();
  await page.getByTestId('textarea-batch-audience').fill('runners\nwalkers\n');
  await expect(page.getByTestId('text-batch-count')).toContainText('2');
  // A bad line is refused before anything is generated.
  await page.getByTestId('textarea-batch-audience').fill('runners\nno spaces here');
  await expect(page.getByTestId('list-batch-errors')).toContainText('illegal character');
  await expect(page.getByTestId('button-batch-generate')).toBeDisabled();
});

test('the shape at the top names each list: a Global definition by its own name, a Local list by the segment label', async ({ page }) => {
  const ruleSet = { ...paidMediaRuleSet, rules: paidMediaRuleSet.rules.map((rule) => (rule.id === 'rule-google'
    ? { ...rule, segments: rule.segments.map((segment) => (segment.id === 'seg-market' ? { ...segment, allowedValues: [], definitionId: 'def-market' } : segment)) }
    : rule)) };
  await seedRuleSets(page, [ruleSet], 'user', [{ ...marketDefinition, name: 'Market list' }]);
  await page.goto('/build');
  await page.getByTestId('select-shell-ruleset').selectOption('ruleset-paid');
  await page.getByTestId('select-shell-rule').selectOption('rule-google');
  await expect(page.getByTestId('chips-build-seg-campaign_type')).toHaveText('Campaign Type');
  await expect(page.getByTestId('chips-build-seg-market')).toHaveText('Market list');
  // Ticking values leaves the shape alone.
  await page.getByTestId('checkbox-batch-campaign_type-brand').check();
  await expect(page.getByTestId('chips-build-seg-campaign_type')).toHaveText('Campaign Type');
});
