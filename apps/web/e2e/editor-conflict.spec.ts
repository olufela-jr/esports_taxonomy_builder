import { expect, test } from '@playwright/test';
import { readRuleSets, seedRuleSets } from './fixtures';

// A Rule Set is one document, so two editors saving different Rules would
// overwrite each other, last write wins. The store refuses a save whose base
// updatedAt is older than the stored one, and the editor warns as soon as the
// document moves on. "Someone else" here is a second write through the store.

test.beforeEach(async ({ page }) => {
  await seedRuleSets(page);
});

async function someoneElseRenames(page: import('@playwright/test').Page, name: string) {
  await page.evaluate(async (newName) => {
    const store = window.__taxoStore;
    if (!store) throw new Error('The app did not expose __taxoStore; was it started with a test seed?');
    const current = store.getSnapshot().find((item) => item.id === 'ruleset-paid');
    if (!current) throw new Error('ruleset-paid is not in the store');
    await store.update('ruleset-paid', { name: newName, rules: current.rules }, current.updatedAt);
  }, name);
}

test('a save on top of someone else\'s change is refused, and Reload catches up', async ({ page }) => {
  await page.goto('/author');
  await page.getByTestId('select-shell-ruleset').selectOption('ruleset-paid');
  await expect(page.getByTestId('input-ruleset-name')).toHaveValue('Paid media (test)');
  await page.getByTestId('input-ruleset-name').fill('My rename');

  await someoneElseRenames(page, 'Their rename');
  await expect(page.getByTestId('status-ruleset-stale')).toBeVisible();

  await page.getByTestId('button-save-ruleset').click();
  await expect(page.getByTestId('status-ruleset-error')).toContainText('changed since you opened it');
  expect((await readRuleSets(page)).find((item) => item.id === 'ruleset-paid')?.name).toBe('Their rename');

  await page.getByTestId('button-reload-ruleset').click();
  await expect(page.getByTestId('input-ruleset-name')).toHaveValue('Their rename');
  await expect(page.getByTestId('status-ruleset-stale')).toHaveCount(0);
  await expect(page.getByTestId('status-ruleset-error')).toHaveCount(0);

  // Editing from the fresh base saves normally.
  await page.getByTestId('input-ruleset-name').fill('Their rename, then mine');
  await page.getByTestId('button-save-ruleset').click();
  await expect(page.getByTestId('text-save-confirmation')).toBeVisible();
  expect((await readRuleSets(page)).find((item) => item.id === 'ruleset-paid')?.name).toBe('Their rename, then mine');
});

test('saving twice in a row from one editor keeps working', async ({ page }) => {
  await page.goto('/author');
  await page.getByTestId('select-shell-ruleset').selectOption('ruleset-paid');
  await page.getByTestId('input-ruleset-name').fill('First save');
  await page.getByTestId('button-save-ruleset').click();
  await expect(page.getByTestId('text-save-confirmation')).toBeVisible();

  await page.getByTestId('input-ruleset-name').fill('Second save');
  await page.getByTestId('button-save-ruleset').click();
  await expect(page.getByTestId('status-ruleset-error')).toHaveCount(0);
  expect((await readRuleSets(page)).find((item) => item.id === 'ruleset-paid')?.name).toBe('Second save');
});
