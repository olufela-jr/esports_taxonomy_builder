import { expect, test } from '@playwright/test';
import { seedMembers, seedRuleSets, seedSuper, umaMember } from './fixtures';

// The super user (a separate claim): a workspace switcher, the Tenants screen
// to create and edit tenants and invite their first admin, read-only access
// inside a tenant they are not an admin of. In memory mode the local user is
// super and admin of the local workspace; other tenants start empty.

test('the super user gets the workspace switcher and the Tenants screen', async ({ page }) => {
  await seedRuleSets(page);
  await seedSuper(page);
  await page.goto('/rules');
  await expect(page.getByTestId('text-user-role')).toHaveText('Super user, admin here');
  await expect(page.getByTestId('select-shell-tenant')).toHaveValue('local');
  await expect(page.getByTestId('select-shell-tenant').locator('option')).toHaveText(['Local workspace', 'North Wind']);

  await page.getByTestId('link-nav-tenants').click();
  await expect(page).toHaveURL(/\/tenants$/);
  await expect(page.getByTestId('card-tenant-local')).toBeVisible();
  await expect(page.getByTestId('badge-tenant-current-local')).toBeVisible();
  await expect(page.getByTestId('card-tenant-north-wind')).toContainText('north-wind');
  await expect(page.getByTestId('text-tenant-datasets-north-wind')).toHaveText('marketing_dw');
  await expect(page.getByTestId('button-open-tenant-local')).toBeDisabled();
});

test('creating a tenant validates the id and refuses a duplicate', async ({ page }) => {
  await seedRuleSets(page);
  await seedSuper(page);
  await page.goto('/tenants');
  await page.getByTestId('button-create-tenant').click();

  await page.getByTestId('input-tenant-id').fill('South Star');
  await page.getByTestId('input-tenant-name').fill('South Star');
  await expect(page.getByTestId('list-tenant-problems')).toContainText('lowercase letters, digits and hyphens');
  await expect(page.getByTestId('button-save-tenant')).toBeDisabled();

  await page.getByTestId('input-tenant-id').fill('south-star');
  await page.getByTestId('checkbox-tenant-platform-google').check();
  await page.getByTestId('input-tenant-datasets').fill('ads, ads, marketing');
  await expect(page.getByTestId('button-save-tenant')).toBeEnabled();
  await page.getByTestId('button-save-tenant').click();
  await expect(page.getByTestId('card-tenant-south-star')).toBeVisible();
  await expect(page.getByTestId('text-tenant-datasets-south-star')).toHaveText('ads, marketing');
  await expect(page.getByTestId('select-shell-tenant').locator('option')).toHaveText(['Local workspace', 'North Wind', 'South Star']);

  await page.getByTestId('button-create-tenant').click();
  await page.getByTestId('input-tenant-id').fill('north-wind');
  await page.getByTestId('input-tenant-name').fill('Again');
  await page.getByTestId('button-save-tenant').click();
  await expect(page.getByTestId('text-tenant-error')).toContainText('already exists');
});

test('editing a tenant saves its name and config', async ({ page }) => {
  await seedRuleSets(page);
  await seedSuper(page);
  await page.goto('/tenants');
  await page.getByTestId('button-edit-tenant-north-wind').click();
  await expect(page.getByTestId('input-tenant-id')).toBeDisabled();
  await page.getByTestId('input-tenant-name').fill('North Wind Media');
  await page.getByTestId('input-tenant-datasets').fill('marketing_dw, ads');
  await page.getByTestId('button-save-tenant').click();
  await expect(page.getByTestId('text-tenant-saved')).toBeVisible();
  await expect(page.getByTestId('card-tenant-north-wind')).toContainText('North Wind Media');
  await expect(page.getByTestId('text-tenant-datasets-north-wind')).toHaveText('ads, marketing_dw');
});

test('opening another tenant is read only there, invites its first admin, and switching back restores the own workspace', async ({ page }) => {
  await seedRuleSets(page);
  await seedMembers(page, [umaMember]);
  await seedSuper(page);
  await page.goto('/tenants');
  await page.getByTestId('input-tenant-admin-email-north-wind').fill('Lead@NorthWind.test');
  await page.getByTestId('button-invite-tenant-admin-north-wind').click();
  await expect(page.getByTestId('text-tenant-notice-north-wind')).toContainText('lead@northwind.test is invited as admin of North Wind');

  await page.getByTestId('button-open-tenant-north-wind').click();
  await expect(page).toHaveURL(/\/rules$/);
  await expect(page.getByTestId('select-shell-tenant')).toHaveValue('north-wind');
  await expect(page.getByTestId('text-user-role')).toHaveText('Super user, read only here');
  await expect(page.getByTestId('button-create-ruleset')).toHaveCount(0);
  await expect(page.getByTestId('card-ruleset-ruleset-paid')).toHaveCount(0);

  // Members is visible but roles and removal are locked; inviting still works.
  await page.getByTestId('link-nav-members').click();
  await expect(page.getByTestId('select-member-role-you')).toBeDisabled();
  await page.getByTestId('input-invite-email').fill('ops@northwind.test');
  await page.getByTestId('button-send-invite').click();
  await expect(page.getByTestId('text-members-notice')).toContainText('ops@northwind.test is invited as user');

  // Back to the own workspace: the seeds and the admin role return, with the selection reset.
  await page.getByTestId('select-shell-tenant').selectOption('local');
  await expect(page.getByTestId('text-user-role')).toHaveText('Super user, admin here');
  await page.getByTestId('link-nav-manage-rules').click();
  await expect(page.getByTestId('card-ruleset-ruleset-paid')).toBeVisible();
  await expect(page.getByTestId('select-member-role-uma')).toHaveCount(0);

  // The viewed workspace is remembered across a reload.
  await page.getByTestId('select-shell-tenant').selectOption('north-wind');
  await page.reload();
  await expect(page.getByTestId('select-shell-tenant')).toHaveValue('north-wind');
});

test('a plain admin has no switcher, no Tenants item, and /tenants says so', async ({ page }) => {
  await seedRuleSets(page);
  await page.goto('/rules');
  await expect(page.getByTestId('select-shell-tenant')).toHaveCount(0);
  await expect(page.getByTestId('link-nav-tenants')).toHaveCount(0);
  await expect(page.getByTestId('text-user-role')).toHaveText('Admin');
  await page.goto('/tenants');
  await expect(page.getByText('Only the super user can see and manage tenants.')).toBeVisible();
});
