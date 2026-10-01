import { expect, test } from '@playwright/test';
import { northWindTenant, samRequest, seedAccessRequests, seedNoWorkspace, seedRuleSets, seedSuper, tessRequest } from './fixtures';

// Anyone who signs in with the link and has no workspace can ask for access;
// the super user picks the workspace and role from the Tenants screen. In
// memory mode the two sides are separate sessions, so each is tested alone:
// the requester's screen, then the super user's queue.

test('an account with no workspace asks for access and waits on the request', async ({ page }) => {
  await seedRuleSets(page);
  await seedNoWorkspace(page);
  await page.goto('/');
  const screen = page.getByTestId('screen-no-workspace');
  await expect(screen).toHaveAttribute('data-status', 'none');
  await expect(page.getByTestId('heading-no-workspace')).toHaveText('No workspace yet');
  await expect(page.getByTestId('text-no-workspace')).toContainText('you@local.test is signed in but is not in a workspace yet');

  await page.getByTestId('button-request-access').click();
  await expect(screen).toHaveAttribute('data-status', 'pending');
  await expect(page.getByTestId('heading-no-workspace')).toHaveText('Access requested');
  await expect(page.getByTestId('text-no-workspace')).toContainText('this page opens your workspace by itself');
  await expect(page.getByTestId('button-request-access')).toHaveCount(0);
  await expect(page.getByTestId('button-retry-claims')).toBeVisible();
});

test('a declined request says so and offers no way to ask again', async ({ page }) => {
  await seedRuleSets(page);
  await seedNoWorkspace(page);
  await seedAccessRequests(page, [{ ...tessRequest, uid: 'you', email: 'you@local.test' }]);
  await page.goto('/');
  await expect(page.getByTestId('screen-no-workspace')).toHaveAttribute('data-status', 'declined');
  await expect(page.getByTestId('heading-no-workspace')).toHaveText('Access declined');
  await expect(page.getByTestId('button-request-access')).toHaveCount(0);
  await expect(page.getByTestId('button-retry-claims')).toHaveCount(0);
  await expect(page.getByTestId('button-sign-out')).toBeVisible();
});

test('the super user sees waiting requests on Tenants, with a count in the nav', async ({ page }) => {
  await seedRuleSets(page);
  await seedSuper(page);
  await seedAccessRequests(page, [samRequest, tessRequest]);
  await page.goto('/rules');
  await expect(page.getByTestId('link-nav-tenants')).toContainText('1');

  await page.getByTestId('link-nav-tenants').click();
  await expect(page.getByTestId('text-access-request-count')).toHaveText('1 waiting');
  const rows = page.getByTestId('section-access-requests').locator('tbody tr');
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText('sam@elsewhere.test');
  await expect(page.getByTestId('text-access-status-tess')).toHaveText('declined');
});

test('approving needs a workspace, then records where they went and as what', async ({ page }) => {
  await seedRuleSets(page);
  await seedSuper(page, [northWindTenant]);
  await seedAccessRequests(page, [samRequest]);
  await page.goto('/tenants');

  // Two workspaces: nothing is preselected, so Approve waits for a choice.
  await expect(page.getByTestId('select-access-tenant-sam')).toHaveValue('');
  await expect(page.getByTestId('button-approve-access-sam')).toBeDisabled();
  await page.getByTestId('select-access-tenant-sam').selectOption('north-wind');
  await page.getByTestId('select-access-role-sam').selectOption('admin');
  await page.getByTestId('button-approve-access-sam').click();

  await expect(page.getByTestId('text-access-status-sam')).toHaveText('approved');
  await expect(page.getByTestId('text-access-tenant-sam')).toHaveText('North Wind');
  await expect(page.getByTestId('row-access-request-sam')).toContainText('admin');
  await expect(page.getByTestId('text-access-request-count')).toHaveText('0 waiting');
  await expect(page.getByTestId('button-decline-access-sam')).toHaveCount(0);
});

test('a declined request can still be approved later', async ({ page }) => {
  await seedRuleSets(page);
  await seedSuper(page, [northWindTenant]);
  await seedAccessRequests(page, [samRequest]);
  await page.goto('/tenants');

  await page.getByTestId('button-decline-access-sam').click();
  await expect(page.getByTestId('text-access-status-sam')).toHaveText('declined');
  await expect(page.getByTestId('button-decline-access-sam')).toHaveCount(0);

  await page.getByTestId('select-access-tenant-sam').selectOption('local');
  await page.getByTestId('button-approve-access-sam').click();
  await expect(page.getByTestId('text-access-status-sam')).toHaveText('approved');
  await expect(page.getByTestId('text-access-tenant-sam')).toHaveText('Local workspace');
});

test('a plain admin sees no queue: there is no Tenants screen for them', async ({ page }) => {
  await seedRuleSets(page);
  await seedAccessRequests(page, [samRequest]);
  await page.goto('/tenants');
  await expect(page.getByTestId('section-access-requests')).toHaveCount(0);
  await expect(page.getByTestId('link-nav-tenants')).toHaveCount(0);
});
