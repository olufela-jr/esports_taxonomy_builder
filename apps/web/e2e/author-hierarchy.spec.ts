import { expect, test } from '@playwright/test';
import { paidMediaRuleSet, readRuleSets, seedRuleSets } from './fixtures';

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

  // Give the child's own segment the key of the one it inherits: the problem shows on that Rule only.
  await page.getByTestId('input-segment-key-1-0').fill('campaign_type');
  await expect(page.getByTestId('list-rule-issues-1')).toContainText('Segment keys must be unique: "campaign_type".');
  await expect(page.getByTestId('list-rule-issues-0')).toHaveCount(0);
  await expect(page.getByTestId('button-save-ruleset')).toBeDisabled();

  await page.getByTestId('input-segment-key-1-0').fill('match');
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

test('an admin links a Rule to a parent, inherits its leading segments, and the link is stored by id', async ({ page }) => {
  await seedRuleSets(page, [paidMediaRuleSet], 'admin');
  await page.goto('/author');
  await page.getByTestId('card-ruleset-ruleset-paid').click();

  // The Meta Ad Sets Rule becomes a child of Google Campaigns.
  await page.getByTestId('select-rule-parent-1').selectOption('rule-google');
  // Delimiter and platform now follow the parent and are locked.
  await expect(page.getByTestId('input-rule-delimiter-1')).toBeDisabled();
  await expect(page.getByTestId('input-rule-platform-1')).toBeDisabled();
  await expect(page.getByTestId('input-rule-platform-1')).toHaveValue('google');
  await page.getByTestId('select-rule-inherit-1').selectOption('2');
  await expect(page.getByTestId('list-inherited-segments-1')).toContainText('Campaign Type');
  await expect(page.getByTestId('list-inherited-segments-1')).toContainText('Market');
  await expect(page.getByTestId('list-rule-issues-1')).toHaveCount(0);
  await page.getByTestId('button-save-ruleset').click();
  await expect(page.getByTestId('text-save-confirmation')).toBeVisible();

  const saved = (await readRuleSets(page)).find((ruleSet) => ruleSet.id === 'ruleset-paid');
  const child = saved?.rules[1] as unknown as { parent?: { ruleId: string; inheritSegmentIds: string[] }; delimiter: string };
  expect(child.parent).toEqual({ ruleId: 'rule-google', inheritSegmentIds: ['seg-type', 'seg-market'] });

  // Now the parent's Remove is blocked and its inherited segments are locked.
  await expect(page.getByTestId('button-remove-rule-0')).toBeDisabled();
  await expect(page.getByTestId('button-remove-segment-0-1')).toBeDisabled();

  // Clearing the parent frees everything again.
  await page.getByTestId('select-rule-parent-1').selectOption('');
  await expect(page.getByTestId('input-rule-delimiter-1')).toBeEnabled();
  await expect(page.getByTestId('list-inherited-segments-1')).toHaveCount(0);
});
