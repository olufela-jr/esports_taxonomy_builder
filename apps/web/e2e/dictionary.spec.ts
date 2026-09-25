import { expect, test, type Locator, type Page } from '@playwright/test';
import { marketDefinition, objectiveDefinition, readDefinitions, readRequests, seedRuleSets } from './fixtures';

// The Dictionary tab (v3 phase 2): admins author shared definitions, members
// read them and request values, admins approve or reject.

async function typeAndCheck(page: Page, field: Locator, text: string) {
  await field.click();
  await field.fill('');
  await field.pressSequentially(text, { delay: 15 });
  await expect(field).toBeFocused();
  await expect(field).toHaveValue(text);
}

const pendingRequest = {
  id: 'req-de',
  definitionId: 'def-market',
  label: 'Germany',
  code: 'de',
  note: 'Launching in Q4',
  requestedByName: 'Uma',
  status: 'pending',
  reason: '',
  createdBy: 'uma',
  updatedBy: 'uma',
  createdAt: '2026-09-20T09:00:00.000Z',
  updatedAt: '2026-09-20T09:00:00.000Z',
};

test('an admin creates a definition, typing freely, and it is stored with its entries and platforms', async ({ page }) => {
  await seedRuleSets(page, undefined, 'admin', [marketDefinition, objectiveDefinition]);
  await page.goto('/dictionary');
  await expect(page.getByTestId('card-definition-def-market')).toBeVisible();
  await expect(page.getByTestId('card-definition-def-objective')).toBeVisible();

  await page.getByTestId('button-create-definition').click();
  await typeAndCheck(page, page.getByTestId('input-definition-name'), 'Campaign type');
  await typeAndCheck(page, page.getByTestId('input-entry-label-0'), 'Performance');
  await typeAndCheck(page, page.getByTestId('input-entry-code-0'), 'perf');
  await page.getByTestId('button-add-entry').click();
  await typeAndCheck(page, page.getByTestId('input-entry-label-1'), 'Brand');
  await typeAndCheck(page, page.getByTestId('input-entry-code-1'), 'brand');
  await page.getByTestId('checkbox-platform-google').check();
  await page.getByTestId('checkbox-platform-meta').check();
  await page.getByTestId('button-save-definition').click();

  await expect(page.getByTestId('list-definitions')).toContainText('Campaign type');
  const stored = (await readDefinitions(page)).find((definition) => definition.name === 'Campaign type');
  expect(stored?.entries).toEqual([{ label: 'Performance', code: 'perf' }, { label: 'Brand', code: 'brand' }]);
  expect(stored?.platforms).toEqual(['google', 'meta']);

  // The Dictionary is an action: a refresh lands back on it with the context intact.
  await page.reload();
  await expect(page).toHaveURL(/\/dictionary$/);
  await expect(page.getByTestId('select-shell-ruleset')).toBeVisible();
});

test('a duplicate code blocks saving with the reason shown', async ({ page }) => {
  await seedRuleSets(page, undefined, 'admin', [marketDefinition]);
  await page.goto('/dictionary');
  await page.getByTestId('card-definition-def-market').click();
  await page.getByTestId('button-add-entry').click();
  await page.getByTestId('input-entry-label-2').fill('Britain');
  await page.getByTestId('input-entry-code-2').fill('uk');
  await expect(page.getByTestId('list-definition-errors')).toContainText('Market has the code "uk" more than once.');
  await expect(page.getByTestId('button-save-definition')).toBeDisabled();
});

test('a standard user reads definitions and submits a request', async ({ page }) => {
  await seedRuleSets(page, undefined, 'user', [marketDefinition]);
  await page.goto('/dictionary');
  await expect(page.getByTestId('button-create-definition')).toHaveCount(0);
  await expect(page.getByTestId('view-definition')).toContainText('United Kingdom');
  await expect(page.getByTestId('row-value-uk')).toBeVisible();

  await typeAndCheck(page, page.getByTestId('input-request-label'), 'Germany');
  await typeAndCheck(page, page.getByTestId('input-request-code'), 'de');
  await page.getByTestId('input-request-note').fill('Launching in Q4');
  await page.getByTestId('button-submit-request').click();
  await expect(page.getByTestId('text-request-sent')).toBeVisible();

  const requests = await readRequests(page);
  expect(requests).toHaveLength(1);
  expect(requests[0]).toMatchObject({ definitionId: 'def-market', label: 'Germany', code: 'de', status: 'pending' });
  await expect(page.getByTestId('section-requests')).toContainText('Germany');

  // A value that already exists cannot be requested.
  await page.getByTestId('input-request-label').fill('UK again');
  await page.getByTestId('input-request-code').fill('uk');
  await expect(page.getByTestId('list-request-errors')).toContainText('more than once');
  await expect(page.getByTestId('button-submit-request')).toBeDisabled();
});

test('an admin approves a request, which adds the value, or rejects it with a reason', async ({ page }) => {
  await seedRuleSets(page, undefined, 'admin', [marketDefinition], [pendingRequest, { ...pendingRequest, id: 'req-fr', label: 'France', code: 'fr', note: '' }]);
  await page.goto('/dictionary');
  await expect(page.getByTestId('card-request-req-de')).toContainText('Germany');

  await page.getByTestId('button-approve-request-req-de').click();
  await expect(page.getByTestId('text-request-status-req-de')).toContainText('approved');
  const market = (await readDefinitions(page)).find((definition) => definition.id === 'def-market');
  expect(market?.entries).toContainEqual({ label: 'Germany', code: 'de' });

  await page.getByTestId('input-reject-reason-req-fr').fill('Not a market we run.');
  await page.getByTestId('button-reject-request-req-fr').click();
  await expect(page.getByTestId('text-request-status-req-fr')).toContainText('rejected');
  const stored = (await readRequests(page)).find((request) => request.id === 'req-fr');
  expect(stored).toMatchObject({ status: 'rejected', reason: 'Not a market we run.' });
  await expect(page.getByTestId('text-no-pending')).toBeVisible();
});
