import { expect, test } from '@playwright/test';
import { seedRuleSets } from './fixtures';

// The sign-in gate and owner-only editing, in memory mode: the local user "you"
// owns the paid media Rule Set, and the global one belongs to someone else.

test.beforeEach(async ({ page }) => {
  await seedRuleSets(page);
});

test('signing out shows the sign-in screen and signing in restores the context', async ({ page }) => {
  await page.goto('/build');
  await page.getByTestId('select-shell-ruleset').selectOption('ruleset-paid');
  await page.getByTestId('select-shell-rule').selectOption('rule-meta');
  await expect(page.getByTestId('select-shell-rule')).toHaveValue('rule-meta');
  await expect(page.getByTestId('text-user-name')).toHaveText('Local user');

  await page.getByTestId('button-sign-out').click();
  await expect(page.getByTestId('screen-sign-in')).toBeVisible();
  await expect(page.getByTestId('sidebar')).toHaveCount(0);

  await page.getByTestId('button-sign-in').click();
  await expect(page.getByTestId('text-user-name')).toHaveText('Local user');
  await expect(page).toHaveURL(/\/build$/);
  await expect(page.getByTestId('select-shell-ruleset')).toHaveValue('ruleset-paid');
  await expect(page.getByTestId('select-shell-rule')).toHaveValue('rule-meta');
});

test('a Rule Set owned by someone else is read only in Author but still builds', async ({ page }) => {
  await page.goto('/author');
  await page.getByTestId('select-shell-ruleset').selectOption('ruleset-global');
  await expect(page.getByTestId('text-read-only')).toBeVisible();
  await expect(page.getByTestId('button-save-ruleset')).toHaveCount(0);
  await expect(page.getByTestId('button-delete-ruleset')).toHaveCount(0);
  await expect(page.getByTestId('input-ruleset-name')).toBeDisabled();
  await expect(page.getByTestId('input-rule-name-0')).toBeDisabled();
  await expect(page.getByTestId('button-add-rule')).toBeDisabled();

  await page.getByTestId('link-nav-build').click();
  await expect(page.getByText('Values for Initiative Name.')).toBeVisible();
});

test('your own Rule Set is editable and the list says who owns what', async ({ page }) => {
  await page.goto('/author');
  await expect(page.getByTestId('badge-ownership-ruleset-paid')).toHaveText('Yours');
  await expect(page.getByTestId('badge-ownership-ruleset-global')).toHaveText('Read only');

  await page.getByTestId('select-shell-ruleset').selectOption('ruleset-paid');
  await expect(page.getByTestId('button-save-ruleset')).toBeVisible();
  await expect(page.getByTestId('text-read-only')).toHaveCount(0);
  await expect(page.getByTestId('input-ruleset-name')).toBeEnabled();
});
