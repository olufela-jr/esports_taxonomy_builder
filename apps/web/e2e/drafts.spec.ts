import { expect, test } from '@playwright/test';
import { hierarchyRuleSet, marketDefinition, paidMediaRuleSet, readDrafts, readRequests, seedRuleSets } from './fixtures';

// v3 phase 5 (D42): a member who finds a value missing requests it from Build;
// the batch's choices are saved as a draft and the segment is blocked until an
// admin approves, then the draft resumes with the new value ticked.

const usingMarket = {
  ...paidMediaRuleSet,
  rules: paidMediaRuleSet.rules.map((rule) => (rule.id === 'rule-google'
    ? { ...rule, segments: rule.segments.map((segment) => (segment.id === 'seg-market' ? { ...segment, allowedValues: [], definitionId: 'def-market' } : segment)) }
    : rule)),
};

test('a member requests a missing value from Build, the batch becomes a blocked draft, and it reopens later', async ({ page }) => {
  await seedRuleSets(page, [usingMarket], 'user', [marketDefinition]);
  await page.goto('/build');
  await page.getByTestId('select-shell-ruleset').selectOption('ruleset-paid');
  await page.getByTestId('select-shell-rule').selectOption('rule-google');
  await page.getByTestId('checkbox-batch-campaign_type-perf').check();
  await page.getByTestId('checkbox-batch-campaign_type-brand').check();

  await page.getByTestId('button-request-value-market').click();
  await page.getByTestId('input-request-label-market').fill('Germany');
  await page.getByTestId('input-request-code-market').fill('de');
  await page.getByTestId('button-submit-request-market').click();

  await expect(page.getByTestId('status-build-blocked-market')).toContainText('Waiting for an admin to approve "Germany" (de)');
  await expect(page.getByTestId('checkbox-batch-market-uk')).toBeDisabled();
  await expect(page.getByTestId('text-batch-blocked')).toBeVisible();
  await expect(page.getByTestId('button-batch-generate')).toBeDisabled();
  expect(await readRequests(page)).toMatchObject([{ definitionId: 'def-market', label: 'Germany', code: 'de', status: 'pending' }]);
  const drafts = await readDrafts(page);
  expect(drafts).toMatchObject([{ ruleId: 'rule-google', selections: { campaign_type: ['perf', 'brand'] }, blockedSegmentKey: 'market', status: 'blocked' }]);

  // Leaving the Rule and coming back lists the draft (a reload would too, but the
  // test store does not persist across one).
  await page.getByTestId('select-shell-rule').selectOption('rule-meta');
  await page.getByTestId('select-shell-rule').selectOption('rule-google');
  await expect(page.getByTestId('checkbox-batch-campaign_type-perf')).not.toBeChecked();
  await expect(page.getByTestId('section-build-drafts')).toContainText('waiting for "Germany" (de)');
  await expect(page.getByTestId(`text-draft-choices-${drafts[0].id}`)).toHaveText('campaign_type: perf, brand');
  await page.getByTestId(`button-resume-draft-${drafts[0].id}`).click();
  await expect(page.getByTestId('checkbox-batch-campaign_type-perf')).toBeChecked();
  await expect(page.getByTestId('checkbox-batch-campaign_type-brand')).toBeChecked();
  await expect(page.getByTestId('checkbox-batch-market-uk')).toBeDisabled();
  await expect(page.getByTestId('button-batch-generate')).toBeDisabled();
});

test('an approved request makes the draft ready; resuming ticks the new value and finishes the draft', async ({ page }) => {
  const approved = { id: 'req-de', definitionId: 'def-market', label: 'Germany', code: 'de', note: '', requestedByName: 'Local user', status: 'approved', reason: '', createdBy: 'you', updatedBy: 'admin', createdAt: '2026-09-20T09:00:00.000Z', updatedAt: '2026-09-21T09:00:00.000Z' };
  // Saved before Build went batch only: one string per segment, still read.
  const ready = { id: 'draft-de', ruleSetId: 'ruleset-paid', ruleId: 'rule-google', selections: { campaign_type: 'brand' }, parentName: '', blockedSegmentId: 'seg-market', blockedSegmentKey: 'market', requestId: 'req-de', status: 'ready', createdBy: 'you', updatedBy: 'admin', createdAt: '2026-09-20T09:00:00.000Z', updatedAt: '2026-09-21T09:00:00.000Z' };
  const withGermany = { ...marketDefinition, entries: [...marketDefinition.entries, { label: 'Germany', code: 'de' }] };
  await seedRuleSets(page, [usingMarket], 'user', [withGermany], [approved], [ready]);
  await page.goto('/build');
  // The decision is an in-app notice on the Dictionary until it is opened.
  await expect(page.getByTestId('badge-nav-definitions')).toHaveText('1');

  await page.getByTestId('select-shell-ruleset').selectOption('ruleset-paid');
  await page.getByTestId('select-shell-rule').selectOption('rule-google');
  await expect(page.getByTestId('text-draft-status-draft-de')).toContainText('approved, ready to resume');
  await page.getByTestId('button-resume-draft-draft-de').click();
  await expect(page.getByTestId('checkbox-batch-campaign_type-brand')).toBeChecked();
  await expect(page.getByTestId('checkbox-batch-market-de')).toBeEnabled();
  await expect(page.getByTestId('checkbox-batch-market-de')).toBeChecked();
  await expect(page.getByTestId('text-batch-count')).toContainText('1');
  await page.getByTestId('button-batch-generate').click();
  await expect(page.getByTestId('row-batch-0')).toContainText('brand_de');
  expect((await readDrafts(page))[0].status).toBe('done');
  await expect(page.getByTestId('section-build-drafts')).toHaveCount(0);

  await page.getByTestId('link-nav-definitions').click();
  await expect(page.getByTestId('badge-nav-definitions')).toHaveCount(0);
});

test('a child batch saved as a draft keeps its pasted parent names', async ({ page }) => {
  const matchDefinition = { ...marketDefinition, id: 'def-match', name: 'Match type', entries: [{ label: 'Broad', code: 'brd' }, { label: 'Exact', code: 'exa' }] };
  const childUsingMatch = { ...hierarchyRuleSet, rules: hierarchyRuleSet.rules.map((rule) => (rule.id === 'rule-google-ad-groups' ? { ...rule, segments: rule.segments.map((segment) => ({ ...segment, allowedValues: [], definitionId: 'def-match' })) } : rule)) };
  await seedRuleSets(page, [childUsingMatch], 'user', [matchDefinition]);
  await page.goto('/build');
  await page.getByTestId('select-shell-ruleset').selectOption('ruleset-paid');
  await page.getByTestId('select-shell-rule').selectOption('rule-google-ad-groups');
  await page.getByTestId('textarea-parent-lines').fill('perf_uk\nbrand_us');
  await page.getByTestId('checkbox-batch-match-brd').check();

  await page.getByTestId('button-request-value-match').click();
  await page.getByTestId('input-request-label-match').fill('Phrase');
  await page.getByTestId('input-request-code-match').fill('phr');
  await page.getByTestId('button-submit-request-match').click();
  await expect(page.getByTestId('status-build-blocked-match')).toBeVisible();
  await expect(page.getByTestId('button-child-batch-generate')).toBeDisabled();
  const drafts = await readDrafts(page);
  expect(drafts).toMatchObject([{ ruleId: 'rule-google-ad-groups', selections: { match: ['brd'] }, parentName: 'perf_uk\nbrand_us' }]);

  await page.getByTestId('select-shell-rule').selectOption('rule-google');
  await page.getByTestId('select-shell-rule').selectOption('rule-google-ad-groups');
  await page.getByTestId(`button-resume-draft-${drafts[0].id}`).click();
  await expect(page.getByTestId('textarea-parent-lines')).toHaveValue('perf_uk\nbrand_us');
  await expect(page.getByTestId('checkbox-batch-match-brd')).toBeChecked();
});

test('an admin sees pending requests as a badge and approving one marks its draft ready', async ({ page }) => {
  const pending = { id: 'req-fr', definitionId: 'def-market', label: 'France', code: 'fr', note: '', requestedByName: 'Uma', status: 'pending', reason: '', createdBy: 'uma', updatedBy: 'uma', createdAt: '2026-09-20T09:00:00.000Z', updatedAt: '2026-09-20T09:00:00.000Z' };
  const blocked = { id: 'draft-fr', ruleSetId: 'ruleset-paid', ruleId: 'rule-google', selections: {}, parentName: '', blockedSegmentId: 'seg-market', blockedSegmentKey: 'market', requestId: 'req-fr', status: 'blocked', createdBy: 'uma', updatedBy: 'uma', createdAt: '2026-09-20T09:00:00.000Z', updatedAt: '2026-09-20T09:00:00.000Z' };
  await seedRuleSets(page, [usingMarket], 'admin', [marketDefinition], [pending], [blocked]);
  await page.goto('/definitions');
  await expect(page.getByTestId('badge-nav-definitions')).toHaveText('1');
  await expect(page.getByTestId('badge-request-draft-req-fr')).toBeVisible();
  await page.getByTestId('button-approve-request-req-fr').click();
  await expect(page.getByTestId('text-request-status-req-fr')).toContainText('approved');
  expect((await readDrafts(page))[0].status).toBe('ready');
  await expect(page.getByTestId('badge-nav-definitions')).toHaveCount(0);
});
