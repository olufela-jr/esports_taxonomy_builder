import { expect, test } from '@playwright/test';
import { marketDefinition, paidMediaRuleSet, readDrafts, readRequests, seedRuleSets } from './fixtures';

// v3 phase 5 (D42): a member who finds a value missing requests it from Build;
// the build is saved as a draft and blocked on that segment until an admin
// approves, then resumes with the new value.

const usingMarket = {
  ...paidMediaRuleSet,
  rules: paidMediaRuleSet.rules.map((rule) => (rule.id === 'rule-google'
    ? { ...rule, segments: rule.segments.map((segment) => (segment.id === 'seg-market' ? { ...segment, allowedValues: [], definitionId: 'def-market' } : segment)) }
    : rule)),
};

test('a member requests a missing value from Build, the build becomes a blocked draft, and it reopens later', async ({ page }) => {
  await seedRuleSets(page, [usingMarket], 'user', [marketDefinition]);
  await page.goto('/build');
  await page.getByTestId('select-shell-ruleset').selectOption('ruleset-paid');
  await page.getByTestId('select-shell-rule').selectOption('rule-google');
  await page.getByTestId('select-build-campaign_type').selectOption('perf');

  await page.getByTestId('button-request-value-market').click();
  await page.getByTestId('input-request-label-market').fill('Germany');
  await page.getByTestId('input-request-code-market').fill('de');
  await page.getByTestId('button-submit-request-market').click();

  await expect(page.getByTestId('status-build-blocked-market')).toContainText('Waiting for an admin to approve "Germany" (de)');
  await expect(page.getByTestId('select-build-market')).toBeDisabled();
  await expect(page.getByTestId('button-copy-build-name')).toBeDisabled();
  expect(await readRequests(page)).toMatchObject([{ definitionId: 'def-market', label: 'Germany', code: 'de', status: 'pending' }]);
  const drafts = await readDrafts(page);
  expect(drafts).toMatchObject([{ ruleId: 'rule-google', selections: { campaign_type: 'perf' }, blockedSegmentKey: 'market', status: 'blocked' }]);

  // Leaving the Rule and coming back lists the draft (a reload would too, but the
  // test store does not persist across one).
  await page.getByTestId('select-shell-rule').selectOption('rule-meta');
  await page.getByTestId('select-shell-rule').selectOption('rule-google');
  await expect(page.getByTestId('section-build-drafts')).toContainText('waiting for "Germany" (de)');
  await page.getByTestId(`button-resume-draft-${drafts[0].id}`).click();
  await expect(page.getByTestId('select-build-campaign_type')).toHaveValue('perf');
  await expect(page.getByTestId('select-build-market')).toBeDisabled();
});

test('an approved request makes the draft ready; resuming fills the new value and finishes the draft', async ({ page }) => {
  const approved = { id: 'req-de', definitionId: 'def-market', label: 'Germany', code: 'de', note: '', requestedByName: 'Local user', status: 'approved', reason: '', createdBy: 'you', updatedBy: 'admin', createdAt: '2026-09-20T09:00:00.000Z', updatedAt: '2026-09-21T09:00:00.000Z' };
  const ready = { id: 'draft-de', ruleSetId: 'ruleset-paid', ruleId: 'rule-google', selections: { campaign_type: 'brand' }, parentName: '', blockedSegmentId: 'seg-market', blockedSegmentKey: 'market', requestId: 'req-de', status: 'ready', createdBy: 'you', updatedBy: 'admin', createdAt: '2026-09-20T09:00:00.000Z', updatedAt: '2026-09-21T09:00:00.000Z' };
  const withGermany = { ...marketDefinition, entries: [...marketDefinition.entries, { label: 'Germany', code: 'de' }] };
  await seedRuleSets(page, [usingMarket], 'user', [withGermany], [approved], [ready]);
  await page.goto('/build');
  // The decision is an in-app notice on the Dictionary until it is opened.
  await expect(page.getByTestId('badge-nav-dictionary')).toHaveText('1');

  await page.getByTestId('select-shell-ruleset').selectOption('ruleset-paid');
  await page.getByTestId('select-shell-rule').selectOption('rule-google');
  await expect(page.getByTestId('text-draft-status-draft-de')).toContainText('approved, ready to resume');
  await page.getByTestId('button-resume-draft-draft-de').click();
  await expect(page.getByTestId('select-build-market')).toBeEnabled();
  await expect(page.getByTestId('select-build-market')).toHaveValue('de');
  await expect(page.getByTestId('text-build-preview')).toHaveText('brand_de');
  await expect(page.getByTestId('button-copy-build-name')).toBeEnabled();
  expect((await readDrafts(page))[0].status).toBe('done');
  await expect(page.getByTestId('section-build-drafts')).toHaveCount(0);

  await page.getByTestId('link-nav-dictionary').click();
  await expect(page.getByTestId('badge-nav-dictionary')).toHaveCount(0);
});

test('an admin sees pending requests as a badge and approving one marks its draft ready', async ({ page }) => {
  const pending = { id: 'req-fr', definitionId: 'def-market', label: 'France', code: 'fr', note: '', requestedByName: 'Uma', status: 'pending', reason: '', createdBy: 'uma', updatedBy: 'uma', createdAt: '2026-09-20T09:00:00.000Z', updatedAt: '2026-09-20T09:00:00.000Z' };
  const blocked = { id: 'draft-fr', ruleSetId: 'ruleset-paid', ruleId: 'rule-google', selections: {}, parentName: '', blockedSegmentId: 'seg-market', blockedSegmentKey: 'market', requestId: 'req-fr', status: 'blocked', createdBy: 'uma', updatedBy: 'uma', createdAt: '2026-09-20T09:00:00.000Z', updatedAt: '2026-09-20T09:00:00.000Z' };
  await seedRuleSets(page, [usingMarket], 'admin', [marketDefinition], [pending], [blocked]);
  await page.goto('/dictionary');
  await expect(page.getByTestId('badge-nav-dictionary')).toHaveText('1');
  await expect(page.getByTestId('badge-request-draft-req-fr')).toBeVisible();
  await page.getByTestId('button-approve-request-req-fr').click();
  await expect(page.getByTestId('text-request-status-req-fr')).toContainText('approved');
  expect((await readDrafts(page))[0].status).toBe('ready');
  await expect(page.getByTestId('badge-nav-dictionary')).toHaveCount(0);
});
