import { expect, test } from '@playwright/test';
import { paidMediaRuleSet, seedRuleSets } from './fixtures';

// v3 phase 2 step 4: Author lists every problem beside the Rule it belongs to
// and protects Rules and segments that other Rules inherit from.

const adGroupRule = {
  id: 'rule-google-ad-groups',
  key: 'google_ad_groups',
  name: 'Google Ad Groups',
  tags: { platform: 'google', entityType: 'ad_group' },
  delimiter: '_',
  parent: { ruleId: 'rule-google', inheritSegmentIds: ['seg-type'] },
  source: { dataset: 'marketing', table: 'ad_groups', nameColumn: 'ad_group_name' },
  segments: [
    { id: 'seg-match', kind: 'enum', key: 'match', label: 'Match type', required: true, allowedValues: [{ label: 'Broad', code: 'brd' }, { label: 'Exact', code: 'exa' }] },
  ],
};

export const hierarchyRuleSet = { ...paidMediaRuleSet, rules: [paidMediaRuleSet.rules[0], adGroupRule, paidMediaRuleSet.rules[1]] };

test('problems are listed per Rule and block saving until fixed', async ({ page }) => {
  await seedRuleSets(page, [hierarchyRuleSet], 'admin');
  await page.goto('/author');
  await page.getByTestId('card-ruleset-ruleset-paid').click();
  await expect(page.getByTestId('button-save-ruleset')).toBeEnabled();

  // Break the child's delimiter: the problem shows on that Rule only.
  await page.getByTestId('input-rule-delimiter-1').fill('-');
  await expect(page.getByTestId('list-rule-issues-1')).toContainText('must match parent "Google Campaigns"');
  await expect(page.getByTestId('list-rule-issues-0')).toHaveCount(0);
  await expect(page.getByTestId('button-save-ruleset')).toBeDisabled();

  await page.getByTestId('input-rule-delimiter-1').fill('_');
  await expect(page.getByTestId('list-rule-issues-1')).toHaveCount(0);
  await expect(page.getByTestId('button-save-ruleset')).toBeEnabled();
});

test('a parent Rule and the segments a child inherits cannot be removed', async ({ page }) => {
  await seedRuleSets(page, [hierarchyRuleSet], 'admin');
  await page.goto('/author');
  await page.getByTestId('card-ruleset-ruleset-paid').click();

  await expect(page.getByTestId('text-rule-dependents-0')).toContainText('Parent of Google Ad Groups');
  await expect(page.getByTestId('button-remove-rule-0')).toBeDisabled();
  await expect(page.getByTestId('button-remove-segment-0-0')).toBeDisabled();
  // The market segment is not inherited, so it can still go.
  await expect(page.getByTestId('button-remove-segment-0-1')).toBeEnabled();
  // Rules with no dependents are removable as before.
  await expect(page.getByTestId('button-remove-rule-2')).toBeEnabled();
});
