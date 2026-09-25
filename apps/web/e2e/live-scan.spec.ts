import { expect, test } from '@playwright/test';
import { seedRuleSets } from './fixtures';

// Phase 4: the live scan runs through the Cloud Function, which exists only
// for the shared workspace. In memory mode the source stays CSV and says why.

test('the live scan source is offered only with the shared workspace', async ({ page }) => {
  await seedRuleSets(page);
  await page.goto('/check');
  await page.getByTestId('select-shell-ruleset').selectOption('ruleset-paid');
  const live = page.getByTestId('button-source-live-scan');
  await expect(live).toBeDisabled();
  await expect(live).toHaveAttribute('title', 'Live scan needs the shared workspace.');
  await expect(page.getByTestId('button-run-check')).toBeVisible();
});
