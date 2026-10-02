import { expect, test } from '@playwright/test';
import { hierarchyRuleSet, openRule, paidMediaRuleSet, pickValues, readRuleSets, seedRuleSets } from './fixtures';

// v3 phase 2 step 8: Author's tracking panel and the tracking URL column Build writes.

const mapping = {
  source: { kind: 'tag', ruleId: 'rule-google-ad-groups', tag: 'platform' },
  medium: { kind: 'literal', value: 'cpc' },
  campaign: { kind: 'ruleName', ruleId: 'rule-google' },
  content: { kind: 'ruleName', ruleId: 'rule-google-ad-groups' },
  baseUrl: 'https://shop.example.com/sale?ref=abc',
  baseUrlEditable: true,
  casePolicy: 'lower',
};

const withUtm = { ...hierarchyRuleSet, rules: hierarchyRuleSet.rules.map((rule) => (rule.id === 'rule-google-ad-groups' ? { ...rule, utm: mapping } : rule)) };

test('Build writes a tracking URL per name whose utm_campaign is the parent name and utm_content the built name', async ({ page }) => {
  await seedRuleSets(page, [withUtm], 'admin');
  await page.goto('/build');
  await page.getByTestId('select-shell-ruleset').selectOption('ruleset-paid');
  await page.getByTestId('select-shell-rule').selectOption('rule-google-ad-groups');
  await expect(page.getByTestId('section-build-url')).toBeVisible();
  await expect(page.getByTestId('input-build-base-url')).toHaveValue('https://shop.example.com/sale?ref=abc');

  await page.getByTestId('textarea-parent-lines').fill('perf_uk');
  await pickValues(page, 'batch-match', ['exa']);
  await page.getByTestId('button-child-batch-generate').click();
  await expect(page.getByTestId('preview-group-perf_uk')).toContainText('perf_exa');
  await expect(page.getByTestId('preview-group-perf_uk')).toContainText('https://shop.example.com/sale?ref=abc&utm_source=google&utm_medium=cpc&utm_campaign=perf_uk&utm_content=perf_exa');
  await expect(page.getByTestId('text-batch-url-failures')).toHaveCount(0);

  // An edited base URL that already carries a UTM is refused, not merged: the
  // field says so, and the generated rows say they have no URL.
  await page.getByTestId('input-build-base-url').fill('https://shop.example.com/?utm_source=old');
  await expect(page.getByTestId('status-build-url-errors')).toContainText('already carries utm_source');
  await page.getByTestId('button-child-batch-generate').click();
  await expect(page.getByTestId('text-batch-url-failures')).toContainText('1 row has no tracking URL: The base URL already carries utm_source');
});

test('an admin switches tracking on for a Rule, sees a bad base URL listed, and the mapping is stored', async ({ page }) => {
  await seedRuleSets(page, [paidMediaRuleSet], 'admin');
  await page.goto('/rules');
  await page.getByTestId('card-ruleset-ruleset-paid').click();
  await openRule(page, 0);

  await page.getByTestId('checkbox-rule-utm-0').check();
  await expect(page.getByTestId('select-utm-kind-0-campaign')).toHaveValue('ruleName');
  await expect(page.getByTestId('select-utm-kind-0-medium')).toHaveValue('literal');
  await expect(page.getByTestId('input-utm-literal-0-medium')).toHaveValue('cpc');

  await page.getByTestId('input-utm-base-url-0').fill('https://www.example.com/?utm_source=old');
  await expect(page.getByTestId('list-rule-issues-0')).toContainText('already carries utm_source');
  await expect(page.getByTestId('button-save-ruleset')).toBeDisabled();
  await page.getByTestId('input-utm-base-url-0').fill('https://www.example.com/landing');
  await expect(page.getByTestId('list-rule-issues-0')).toHaveCount(0);

  await page.getByTestId('select-utm-kind-0-term').selectOption('segment');
  await page.getByTestId('select-utm-segment-0-term').selectOption('seg-market');
  await page.getByTestId('button-save-ruleset').click();
  await expect(page.getByTestId('text-save-confirmation')).toBeVisible();

  const saved = (await readRuleSets(page)).find((ruleSet) => ruleSet.id === 'ruleset-paid');
  const rule = saved?.rules[0] as unknown as { utm?: { campaign: { kind: string; ruleId: string }; term?: { kind: string; segmentId: string }; baseUrl: string } };
  expect(rule.utm?.campaign).toEqual({ kind: 'ruleName', ruleId: 'rule-google' });
  expect(rule.utm?.term).toEqual({ kind: 'segment', segmentId: 'seg-market' });
  expect(rule.utm?.baseUrl).toBe('https://www.example.com/landing');
});
