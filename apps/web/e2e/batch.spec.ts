import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { marketDefinition, paidMediaRuleSet, pickValues, seedRuleSets, selectAllValues } from './fixtures';

// Phase 3: Build (batch only) generates every combination as a CSV of codes.

test('a batch of two types by all markets counts four, previews four, and downloads a CSV of codes', async ({ page }) => {
  await seedRuleSets(page, [paidMediaRuleSet], 'admin');
  await page.goto('/build');
  await page.getByTestId('select-shell-ruleset').selectOption('ruleset-paid');
  await page.getByTestId('select-shell-rule').selectOption('rule-google');

  await expect(page.getByTestId('text-batch-count')).toContainText('0');
  await expect(page.getByTestId('button-batch-generate')).toBeDisabled();
  await pickValues(page, 'batch-campaign_type', ['brand']);
  await pickValues(page, 'batch-campaign_type', ['perf']);
  await selectAllValues(page, 'batch-market');
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

  await pickValues(page, 'batch-targeting', ['broad']);
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
  await pickValues(page, 'batch-campaign_type', ['brand']);
  await expect(page.getByTestId('chips-build-seg-campaign_type')).toHaveText('Campaign Type');
});

// Build's enum segments are searchable multi-selects, since a Global definition can hold hundreds of values.
const withGlobalMarket = { ...paidMediaRuleSet, rules: paidMediaRuleSet.rules.map((rule) => (rule.id === 'rule-google'
  ? { ...rule, segments: rule.segments.map((segment) => (segment.id === 'seg-market' ? { ...segment, allowedValues: [], definitionId: 'def-market' } : segment)) }
  : rule)) };
const threeMarkets = { ...marketDefinition, entries: [...marketDefinition.entries, { label: 'Germany', code: 'de' }] };

test('typing filters a segment on label or code, and Select all takes only the matching values', async ({ page }) => {
  await seedRuleSets(page, [withGlobalMarket], 'user', [threeMarkets]);
  await page.goto('/build');
  await page.getByTestId('select-shell-ruleset').selectOption('ruleset-paid');
  await page.getByTestId('select-shell-rule').selectOption('rule-google');

  await page.getByTestId('multiselect-batch-market').fill('uni');
  await expect(page.getByTestId('option-batch-market-uk')).toBeVisible();
  await expect(page.getByTestId('option-batch-market-us')).toBeVisible();
  await expect(page.getByTestId('option-batch-market-de')).toHaveCount(0);
  await expect(page.getByTestId('button-batch-market-select-all')).toHaveText('Select all 2 matching');
  await page.getByTestId('button-batch-market-select-all').click();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('token-batch-market-uk')).toBeVisible();
  await expect(page.getByTestId('token-batch-market-us')).toBeVisible();
  await expect(page.getByTestId('token-batch-market-de')).toHaveCount(0);

  // A code matches too, and Backspace in an empty field takes off the last value.
  await page.getByTestId('multiselect-batch-market').fill('de');
  await expect(page.getByTestId('option-batch-market-de')).toBeVisible();
  await page.getByTestId('multiselect-batch-market').fill('');
  await page.getByTestId('multiselect-batch-market').press('Backspace');
  await expect(page.getByTestId('token-batch-market-us')).toHaveCount(0);
  await expect(page.getByTestId('token-batch-market-uk')).toBeVisible();
  // A token's x removes it.
  await page.getByTestId('button-batch-market-remove-uk').click();
  await expect(page.getByTestId('token-batch-market-uk')).toHaveCount(0);
});

test('a value with no match is offered as a request, with the typed text as its label', async ({ page }) => {
  await seedRuleSets(page, [withGlobalMarket], 'user', [threeMarkets]);
  await page.goto('/build');
  await page.getByTestId('select-shell-ruleset').selectOption('ruleset-paid');
  await page.getByTestId('select-shell-rule').selectOption('rule-google');

  await page.getByTestId('multiselect-batch-market').fill('France');
  await expect(page.getByTestId('button-batch-market-request')).toHaveText('Request "France"');
  await page.getByTestId('button-batch-market-request').click();
  await expect(page.getByTestId('input-request-label-market')).toHaveValue('France');
  // A Local list has no request row.
  await page.getByTestId('multiselect-batch-campaign_type').click();
  await expect(page.getByTestId('button-batch-campaign_type-request')).toHaveCount(0);
});
