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

test('a standard user sees every Rule Set read only in Author but still builds', async ({ page }) => {
  await seedRuleSets(page, undefined, 'user');
  await page.goto('/author');
  await expect(page.getByTestId('text-user-role')).toHaveText('User');
  await expect(page.getByTestId('button-create-ruleset')).toHaveCount(0);
  await expect(page.getByTestId('card-ruleset-ruleset-paid')).toBeVisible();

  await page.getByTestId('select-shell-ruleset').selectOption('ruleset-paid');
  await expect(page.getByTestId('text-read-only')).toBeVisible();
  await expect(page.getByTestId('button-save-ruleset')).toHaveCount(0);
  await expect(page.getByTestId('button-delete-ruleset')).toHaveCount(0);
  await expect(page.getByTestId('input-ruleset-name')).toBeDisabled();
  await expect(page.getByTestId('input-rule-name-0')).toBeDisabled();
  await expect(page.getByTestId('button-add-rule')).toBeDisabled();

  await page.getByTestId('link-nav-build').click();
  await page.getByTestId('select-shell-rule').selectOption('rule-meta');
  await expect(page.getByText('Values for Meta Ad Sets.')).toBeVisible();
  await page.getByTestId('select-build-targeting').selectOption('broad');
  await page.getByTestId('input-build-audience').fill('gamers');
  await expect(page.getByTestId('text-build-preview')).toHaveText('broad_gamers');
});

test('an admin edits any Rule Set in the workspace, whoever created it', async ({ page }) => {
  await seedRuleSets(page);
  await page.goto('/author');
  await expect(page.getByTestId('button-create-ruleset')).toBeVisible();

  // ruleset-global was created by someone else; the role, not the creator, decides.
  await page.getByTestId('select-shell-ruleset').selectOption('ruleset-global');
  await expect(page.getByTestId('button-save-ruleset')).toBeVisible();
  await expect(page.getByTestId('button-delete-ruleset')).toBeVisible();
  await expect(page.getByTestId('text-read-only')).toHaveCount(0);
  await expect(page.getByTestId('input-ruleset-name')).toBeEnabled();
});
