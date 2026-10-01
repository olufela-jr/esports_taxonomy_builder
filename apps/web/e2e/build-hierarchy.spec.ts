import { expect, test } from '@playwright/test';
import { googleAdGroupsRule, hierarchyRuleSet, seedRuleSets } from './fixtures';

// v3 phase 2 step 6, batch only: a child Rule is built across parent names,
// pasted or carried across from a batch of the parent; the inherited segments
// come from each parent name. Carrying works at every level.

test('a child Rule shows a whole example name, inherited segments marked, and asks for parent names', async ({ page }) => {
  await seedRuleSets(page, [hierarchyRuleSet], 'admin');
  await page.goto('/build');
  await page.getByTestId('select-shell-ruleset').selectOption('ruleset-paid');
  await page.getByTestId('select-shell-rule').selectOption('rule-google-ad-groups');

  // The top of the page shows a whole example name: the inherited segment first, the delimiter as its own chip.
  await expect(page.getByTestId('chips-build-seg-campaign_type')).toHaveAttribute('data-sample', 'true');
  await expect(page.getByTestId('chips-build-seg-campaign_type')).toHaveAttribute('data-inherited', 'true');
  await expect(page.getByTestId('chips-build-seg-match')).toHaveAttribute('data-sample', 'true');
  await expect(page.getByTestId('chips-build-delimiter')).toHaveText('_');

  await expect(page.getByTestId('section-child-batch')).toBeVisible();
  await expect(page.getByTestId('text-child-batch-empty')).toBeVisible();
  await page.getByTestId('textarea-parent-lines').fill('perf_uk');
  await expect(page.getByTestId('text-child-batch-inherited-campaign_type')).toBeVisible();
  await page.getByTestId('checkbox-batch-match-exa').check();
  // The example follows the choices: the first parent's value and the first tick replace the samples.
  await expect(page.getByTestId('chips-build-seg-campaign_type')).toHaveText('perf');
  await expect(page.getByTestId('chips-build-seg-campaign_type')).not.toHaveAttribute('data-sample', 'true');
  await expect(page.getByTestId('chips-build-seg-match')).toHaveText('exa');
  await expect(page.getByTestId('chips-build-seg-match')).not.toHaveAttribute('data-sample', 'true');
  await page.getByTestId('button-child-batch-generate').click();
  await expect(page.getByTestId('preview-group-perf_uk')).toContainText('perf_exa');
});

test('carrying names into a child switches the persistent Rule, and the choice survives a refresh', async ({ page }) => {
  await seedRuleSets(page, [hierarchyRuleSet], 'admin');
  await page.goto('/build');
  await page.getByTestId('select-shell-ruleset').selectOption('ruleset-paid');
  await page.getByTestId('select-shell-rule').selectOption('rule-google');
  await page.getByTestId('checkbox-batch-campaign_type-brand').check();
  await page.getByTestId('checkbox-batch-market-us').check();
  await page.getByTestId('button-batch-generate').click();
  await page.getByTestId('button-carry-child-rule-google-ad-groups').click();

  await expect(page.getByTestId('select-shell-rule')).toHaveValue('rule-google-ad-groups');
  await expect(page.getByTestId('textarea-parent-lines')).toHaveValue('brand_us');
  await page.getByTestId('checkbox-batch-match-brd').check();
  await page.getByTestId('button-child-batch-generate').click();
  await expect(page.getByTestId('preview-group-brand_us')).toContainText('brand_brd');

  await page.reload();
  await expect(page.getByTestId('select-shell-rule')).toHaveValue('rule-google-ad-groups');
  await expect(page.getByTestId('section-child-batch')).toBeVisible();
});

test('a child batch carries its names on into a grandchild Rule', async ({ page }) => {
  const keywordsRule = {
    id: 'rule-google-keywords',
    key: 'google_keywords',
    name: 'Google Keywords',
    tags: { platform: 'google', entityType: 'keyword' },
    delimiter: '_',
    parent: { ruleId: 'rule-google-ad-groups', inheritSegmentIds: ['seg-type', 'seg-match'] },
    source: { dataset: 'marketing', table: 'keywords', nameColumn: 'keyword_name' },
    segments: [{ id: 'seg-theme', kind: 'freeform', key: 'theme', label: 'Theme', required: true, maxLength: 20, illegalChars: [' '] }],
  };
  const threeLevels = { ...hierarchyRuleSet, rules: [hierarchyRuleSet.rules[0], googleAdGroupsRule, keywordsRule, hierarchyRuleSet.rules[2]] };
  await seedRuleSets(page, [threeLevels], 'admin');
  await page.goto('/build');
  await page.getByTestId('select-shell-ruleset').selectOption('ruleset-paid');
  await page.getByTestId('select-shell-rule').selectOption('rule-google-ad-groups');
  await page.getByTestId('textarea-parent-lines').fill('perf_uk\nbrand_us');
  await page.getByTestId('button-batch-select-all-match').click();
  await page.getByTestId('button-child-batch-generate').click();

  await page.getByTestId('checkbox-carry-perf_exa').uncheck();
  await page.getByTestId('button-carry-child-rule-google-keywords').click();
  await expect(page.getByTestId('select-shell-rule')).toHaveValue('rule-google-keywords');
  await expect(page.getByTestId('textarea-parent-lines')).toHaveValue('perf_brd\nbrand_brd\nbrand_exa');
  await page.getByTestId('textarea-batch-theme').fill('shoes');
  await expect(page.getByTestId('text-child-batch-total')).toContainText('3');
  await page.getByTestId('button-child-batch-generate').click();
  await expect(page.getByTestId('preview-group-brand_exa')).toContainText('brand_exa_shoes');
});
