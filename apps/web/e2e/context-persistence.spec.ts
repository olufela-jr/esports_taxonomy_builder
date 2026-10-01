import { expect, test, type Page } from '@playwright/test';
import { seedRuleSets, UI_STATE_KEY } from './fixtures';

// The shared Rule Set and Rule context must survive switching between Author,
// Build, Check and Compliance, and a full page reload. This was a recurring
// prototype bug.

async function shellState(page: Page) {
  return {
    ruleSet: await page.getByTestId('select-shell-ruleset').inputValue(),
    rule: await page.getByTestId('select-shell-rule').inputValue(),
    path: new URL(page.url()).pathname,
  };
}

test.beforeEach(async ({ page }) => {
  await seedRuleSets(page);
});

test('selection survives Author, Build, Check, Compliance, and a reload', async ({ page }) => {
  await page.goto('/author');

  await page.getByTestId('select-shell-ruleset').selectOption('ruleset-paid');
  await expect(page.getByTestId('button-save-ruleset')).toBeVisible();
  // The second Rule, not the default first one, so a silent fallback would show.
  await page.getByTestId('select-shell-rule').selectOption('rule-meta');
  await expect(page.getByTestId('select-shell-rule')).toHaveValue('rule-meta');

  await page.getByTestId('link-nav-build').click();
  await expect(page.getByTestId('text-batch-count')).toBeVisible();
  expect(await shellState(page)).toEqual({ ruleSet: 'ruleset-paid', rule: 'rule-meta', path: '/build' });
  await expect(page.getByText('An example Meta Ad Sets name.')).toBeVisible();

  await page.getByTestId('link-nav-check').click();
  await expect(page.getByTestId('input-check-column')).toBeVisible();
  expect(await shellState(page)).toEqual({ ruleSet: 'ruleset-paid', rule: 'rule-meta', path: '/check' });

  // Compliance is Rule-Set-scoped, so it must carry the Rule through untouched.
  await page.getByTestId('link-nav-compliance').click();
  await expect(page.getByTestId('button-run-compliance')).toBeVisible();
  expect(await shellState(page)).toEqual({ ruleSet: 'ruleset-paid', rule: 'rule-meta', path: '/compliance' });

  await page.reload();
  await expect(page.getByTestId('button-run-compliance')).toBeVisible();
  expect(await shellState(page)).toEqual({ ruleSet: 'ruleset-paid', rule: 'rule-meta', path: '/compliance' });

  await page.getByTestId('link-nav-author').click();
  await expect(page.getByTestId('button-save-ruleset')).toBeVisible();
  expect(await shellState(page)).toEqual({ ruleSet: 'ruleset-paid', rule: 'rule-meta', path: '/author' });
});

test('opening the root lands on the last action with context restored', async ({ page }) => {
  await page.goto('/build');
  await page.getByTestId('select-shell-ruleset').selectOption('ruleset-paid');
  await page.getByTestId('select-shell-rule').selectOption('rule-meta');
  await expect(page.getByTestId('select-shell-rule')).toHaveValue('rule-meta');

  await page.goto('/');
  await expect(page).toHaveURL(/\/build$/);
  expect(await shellState(page)).toEqual({ ruleSet: 'ruleset-paid', rule: 'rule-meta', path: '/build' });

  const stored = await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? '{}'), UI_STATE_KEY);
  expect(stored).toMatchObject({ ruleSetId: 'ruleset-paid', ruleId: 'rule-meta', lastAction: '/build' });
});

test('switching Rule Set falls back to that set\'s first Rule', async ({ page }) => {
  await page.goto('/build');
  await page.getByTestId('select-shell-ruleset').selectOption('ruleset-paid');
  await page.getByTestId('select-shell-rule').selectOption('rule-meta');
  await expect(page.getByTestId('select-shell-rule')).toHaveValue('rule-meta');

  await page.getByTestId('select-shell-ruleset').selectOption('ruleset-global');
  await expect(page.getByTestId('select-shell-rule')).toHaveValue('rule-initiative');
  await expect(page.getByText('An example Initiative Name name.')).toBeVisible();
});

test('a first visit with nothing saved lands on Author', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/author$/);
  await expect(page.getByTestId('button-create-ruleset')).toBeVisible();
  await expect(page.getByTestId('select-shell-ruleset')).toHaveValue('');
});
