import { expect, test, type Page } from '@playwright/test';
import { seedRuleSets, UI_STATE_KEY } from './fixtures';

// The shared Rule Set and Rule context must survive switching between Manage
// Rules, Build, Check and Compliance, and a full page reload. This was a recurring
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

test('selection survives Manage Rules, Build, Check, Compliance, and a reload', async ({ page }) => {
  await page.goto('/rules');

  // Picking a Rule Set while managing rules opens it at its own URL.
  await page.getByTestId('select-shell-ruleset').selectOption('ruleset-paid');
  await expect(page).toHaveURL(/\/rules\/ruleset-paid$/);
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

  await page.getByTestId('link-nav-manage-rules').click();
  await expect(page.getByTestId('button-create-ruleset')).toBeVisible();
  expect(await shellState(page)).toEqual({ ruleSet: 'ruleset-paid', rule: 'rule-meta', path: '/rules' });

  // Opening another Rule Set by its URL makes it the context.
  await page.goto('/rules/ruleset-global');
  await expect(page.getByTestId('input-ruleset-name')).toHaveValue('Global campaign standard');
  await expect(page.getByTestId('select-shell-ruleset')).toHaveValue('ruleset-global');
});

test('the root is the homepage, with the context carried into Build', async ({ page }) => {
  await page.goto('/build');
  await page.getByTestId('select-shell-ruleset').selectOption('ruleset-paid');
  await page.getByTestId('select-shell-rule').selectOption('rule-meta');
  await expect(page.getByTestId('select-shell-rule')).toHaveValue('rule-meta');

  await page.goto('/');
  await expect(page.getByTestId('section-home')).toBeVisible();
  expect(await shellState(page)).toEqual({ ruleSet: 'ruleset-paid', rule: 'rule-meta', path: '/' });
  await expect(page.getByTestId('box-home-build')).toContainText('Paid media (test) / Meta Ad Sets');
  await page.getByTestId('box-home-build').click();
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

test('a first visit with nothing saved shows the three boxes', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('box-home-rules')).toBeVisible();
  await expect(page.getByTestId('box-home-build')).toContainText('Pick a Rule Set and Rule in the sidebar');
  await expect(page.getByTestId('box-home-check')).toBeVisible();
  await expect(page.getByTestId('select-shell-ruleset')).toHaveValue('');
  await page.getByTestId('box-home-rules').click();
  await expect(page).toHaveURL(/\/rules$/);
  await expect(page.getByTestId('button-create-ruleset')).toBeVisible();
});
