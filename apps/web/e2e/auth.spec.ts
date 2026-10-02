import { expect, test } from '@playwright/test';
import { seedRuleSets } from './fixtures';

// The sign-in gate and the two roles, in memory mode. Every Rule Set in the
// workspace is readable by every member; only an admin changes one. The local
// user is an admin unless the fixture says otherwise.

test('signing out shows the sign-in screen and signing in restores the context', async ({ page }) => {
  await seedRuleSets(page);
  await page.goto('/build');
  await page.getByTestId('select-shell-ruleset').selectOption('ruleset-paid');
  await page.getByTestId('select-shell-rule').selectOption('rule-meta');
  await expect(page.getByTestId('select-shell-rule')).toHaveValue('rule-meta');
  await expect(page.getByTestId('text-user-name')).toHaveText('Local user');
  await expect(page.getByTestId('text-user-role')).toHaveText('Admin');

  await page.getByTestId('button-sign-out').click();
  await expect(page.getByTestId('screen-sign-in')).toBeVisible();
  await expect(page.getByTestId('sidebar')).toHaveCount(0);

  await page.getByTestId('button-sign-in').click();
  await expect(page.getByTestId('text-user-name')).toHaveText('Local user');
  await expect(page).toHaveURL(/\/build$/);
  await expect(page.getByTestId('select-shell-ruleset')).toHaveValue('ruleset-paid');
  await expect(page.getByTestId('select-shell-rule')).toHaveValue('rule-meta');
});

test('a standard user has no Manage Rules, only Build and Check, and still builds', async ({ page }) => {
  await seedRuleSets(page, undefined, 'user');
  await page.goto('/');
  await expect(page.getByTestId('text-user-role')).toHaveText('User');
  await expect(page.getByTestId('box-home-build')).toBeVisible();
  await expect(page.getByTestId('box-home-check')).toBeVisible();
  await expect(page.getByTestId('box-home-rules')).toHaveCount(0);
  await expect(page.getByTestId('link-nav-manage-rules')).toHaveCount(0);

  // A Manage Rules link opened directly says it is for admins.
  await page.goto('/rules');
  await expect(page.getByTestId('text-rules-admins-only')).toBeVisible();
  await expect(page.getByTestId('card-ruleset-ruleset-paid')).toHaveCount(0);
  await page.goto('/rules/ruleset-paid');
  await expect(page.getByTestId('text-rules-admins-only')).toBeVisible();
  await expect(page.getByTestId('input-ruleset-name')).toHaveCount(0);

  await page.getByTestId('select-shell-ruleset').selectOption('ruleset-paid');
  await page.getByTestId('link-nav-build').click();
  await page.getByTestId('select-shell-rule').selectOption('rule-meta');
  await expect(page.getByText('The parts of a Meta Ad Sets name, in order.')).toBeVisible();
  await page.getByTestId('checkbox-batch-targeting-broad').check();
  await page.getByTestId('textarea-batch-audience').fill('gamers');
  await page.getByTestId('button-batch-generate').click();
  await expect(page.getByTestId('row-batch-0')).toContainText('broad_gamers');
});

test('an admin edits any Rule Set in the workspace, whoever created it', async ({ page }) => {
  await seedRuleSets(page);
  await page.goto('/rules');
  await expect(page.getByTestId('button-create-ruleset')).toBeVisible();

  // ruleset-global was created by someone else; the role, not the creator, decides.
  await page.getByTestId('select-shell-ruleset').selectOption('ruleset-global');
  await expect(page.getByTestId('button-save-ruleset')).toBeVisible();
  await expect(page.getByTestId('button-delete-ruleset')).toBeVisible();
  await expect(page.getByTestId('text-read-only')).toHaveCount(0);
  await expect(page.getByTestId('input-ruleset-name')).toBeEnabled();
});
