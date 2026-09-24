import { expect, test } from '@playwright/test';
import { readRuleSets, seedRuleSets } from './fixtures';

// A create against Firestore can take seconds on a cold connection. The first
// live save produced a duplicate Rule Set because Save stayed clickable while
// the first create was still in flight. This slows the test store's create the
// same way and clicks Save twice.

test.beforeEach(async ({ page }) => {
  await seedRuleSets(page);
});

test('a slow create disables Save and never creates twice', async ({ page }) => {
  await page.goto('/author');
  await page.evaluate(() => {
    const store = window.__taxoStore;
    if (!store) throw new Error('The app did not expose __taxoStore; was it started with a test seed?');
    const create = store.create.bind(store);
    store.create = async (draft) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      return create(draft);
    };
  });

  await page.getByTestId('button-create-ruleset').click();
  await page.getByTestId('input-ruleset-name').fill('Slow save');
  await page.getByTestId('button-save-ruleset').click();
  await expect(page.getByTestId('button-save-ruleset')).toBeDisabled();
  await expect(page.getByTestId('button-save-ruleset')).toHaveText(/Saving/);
  // A second click while saving must do nothing (the button is disabled, but a keyboard submit is not).
  await page.getByTestId('input-ruleset-name').press('Enter');

  await expect(page.getByTestId('text-save-confirmation')).toBeVisible({ timeout: 5000 });
  await expect(page.getByTestId('button-save-ruleset')).toBeEnabled();
  const created = (await readRuleSets(page)).filter((item) => item.name === 'Slow save');
  expect(created).toHaveLength(1);
  await expect(page.getByTestId('select-shell-ruleset')).toHaveValue(created[0].id);
});
