import { expect, test, type Locator, type Page } from '@playwright/test';
import { readRuleSets, seedRuleSets } from './fixtures';

// Every editor field must accept continuous typing without losing focus, and
// must keep exactly what was typed, including a trailing comma in the allowed
// values list. Focus loss on each keystroke was a recurring prototype bug
// caused by index-based React keys and remounting editors.

async function typeAndCheck(page: Page, field: Locator, text: string, expected = text) {
  await field.click();
  await field.fill('');
  await field.pressSequentially(text, { delay: 15 });
  // Still the same element after every keystroke.
  await expect(field).toBeFocused();
  await expect(field).toHaveValue(expected);
}

test.beforeEach(async ({ page }) => {
  await seedRuleSets(page);
  await page.goto('/author');
  await page.getByTestId('button-create-ruleset').click();
  await expect(page.getByTestId('button-save-ruleset')).toBeVisible();
});

test('Rule Set and Rule fields keep focus and value while typing', async ({ page }) => {
  await typeAndCheck(page, page.getByTestId('input-ruleset-name'), 'Regional paid media, EMEA');

  await typeAndCheck(page, page.getByTestId('input-rule-name-0'), 'Google Campaigns 2026');
  // The key follows the name as a slug, then accepts its own edits.
  await expect(page.getByTestId('input-rule-key-0')).toHaveValue('google_campaigns_2026');
  await typeAndCheck(page, page.getByTestId('input-rule-key-0'), 'gc_2026');

  await typeAndCheck(page, page.getByTestId('input-rule-delimiter-0'), '_');

  await typeAndCheck(page, page.getByTestId('input-rule-platform-0'), 'google');
  await typeAndCheck(page, page.getByTestId('input-rule-entity-type-0'), 'campaign');

  await typeAndCheck(page, page.getByTestId('input-source-dataset-0'), 'marketing_dw');
  await typeAndCheck(page, page.getByTestId('input-source-table-0'), 'campaigns');
  await typeAndCheck(page, page.getByTestId('input-source-name-column-0'), 'campaign_name');

  await page.getByTestId('button-toggle-filter-0').click();
  await typeAndCheck(page, page.getByTestId('input-source-filter-col-0'), 'platform');
  await typeAndCheck(page, page.getByTestId('input-source-filter-in-0'), 'google, youtube,');
});

test('Segment fields keep focus and value while typing, trailing comma included', async ({ page }) => {
  await typeAndCheck(page, page.getByTestId('input-segment-label-0-0'), 'Campaign Type');
  await expect(page.getByTestId('input-segment-key-0-0')).toHaveValue('campaign_type');
  await typeAndCheck(page, page.getByTestId('input-segment-key-0-0'), 'ctype');

  // Freeform fields first (the default kind).
  await typeAndCheck(page, page.getByTestId('input-segment-max-length-0-0'), '24');
  await typeAndCheck(page, page.getByTestId('input-segment-illegal-chars-0-0'), ' /?#');

  // Switch to enum and type a list with a trailing comma; it must be preserved verbatim.
  await page.getByTestId('select-segment-kind-0-0').selectOption('enum');
  await typeAndCheck(page, page.getByTestId('input-segment-values-0-0'), 'NA, emea, Apac,');

  // The stored values keep their case and drop only the empty trailing entry.
  await page.getByTestId('button-save-ruleset').click();
  await expect(page.getByText('Saved locally')).toBeVisible();
  const saved = await readRuleSets(page);
  expect(saved[0].rules[0].segments[0].allowedValues).toEqual(['NA', 'emea', 'Apac']);
});

test('adding and reordering segments keeps every field editable', async ({ page }) => {
  await page.getByTestId('button-add-segment-0').click();
  await typeAndCheck(page, page.getByTestId('input-segment-label-0-1'), 'Market');
  await page.getByTestId('button-move-segment-up-0-1').click();
  await expect(page.getByTestId('input-segment-label-0-0')).toHaveValue('Market');
  await typeAndCheck(page, page.getByTestId('input-segment-label-0-0'), 'Market region');
  await typeAndCheck(page, page.getByTestId('input-segment-label-0-1'), 'Segment one renamed');
});
