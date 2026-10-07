import { expect, test } from '@playwright/test';
import readXlsxFile from 'read-excel-file/node';
import writeXlsxFile from 'write-excel-file/node';
import { marketDefinition, paidMediaRuleSet, readRuleSets, seedRuleSets } from './fixtures';

// Rules as an Excel workbook on the Rule Set page: an import adds new Rules to
// the unsaved draft (never touching one already there), with every code kept
// exactly, and an export writes the Rules, Segments and Values sheets.

const RULES = ['rule_key', 'rule_name', 'delimiter', 'platform', 'entity_type'];
const SEGMENTS = ['rule_key', 'segment_key', 'segment_label', 'kind', 'required', 'max_length', 'illegal_chars', 'global_definition'];
const VALUES = ['rule_key', 'segment_key', 'code', 'label'];

async function workbook(rules: string[][], segments: string[][], values: string[][]) {
  const text = (rows: string[][]) => rows.map((row) => row.map((value) => ({ value, type: String })));
  const buffer = await writeXlsxFile([
    { sheet: 'Rules', data: text([RULES, ...rules]) },
    { sheet: 'Segments', data: text([SEGMENTS, ...segments]) },
    { sheet: 'Values', data: text([VALUES, ...values]) },
  ]).toBuffer();
  return { name: 'rules.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer };
}

test('an imported workbook adds new Rules to the draft with codes kept exactly, and they save like any other edit', async ({ page }) => {
  await seedRuleSets(page, [paidMediaRuleSet], 'admin', [marketDefinition]);
  await page.goto('/rules/ruleset-paid');

  await page.getByTestId('input-import-rules').setInputFiles(await workbook(
    [['tiktok_ads', 'TikTok Ads', '-', 'TikTok', 'ad']],
    [
      ['tiktok_ads', 'market', 'Market', 'enum', 'true', '', '', 'Market'],
      ['tiktok_ads', 'format', 'Format', 'enum', 'true', '', '', ''],
      ['tiktok_ads', 'hook', 'Hook', 'freeform', 'false', '16', ' /', ''],
    ],
    [
      ['tiktok_ads', 'format', 'UK:LDN', 'London: City'],
      ['tiktok_ads', 'format', 'A|B', ''],
      ['tiktok_ads', 'format', '01', 'Zero one'],
    ],
  ));
  await expect(page.getByTestId('text-import-done')).toHaveText('Added 1 Rule. Review it below, then save the Rule Set.');
  await expect(page.getByTestId('table-rules')).toContainText('TikTok Ads');
  await expect(page.getByTestId('text-unsaved')).toBeVisible();

  await page.getByTestId('button-save-ruleset').click();
  await expect(page.getByTestId('text-save-confirmation')).toBeVisible();
  const saved = (await readRuleSets(page)).find((ruleSet) => ruleSet.id === 'ruleset-paid') as unknown as { rules: Array<{ key: string; tags?: unknown; segments: unknown[] }> };
  const rule = saved.rules.find((item) => item.key === 'tiktok_ads')!;
  expect(saved.rules).toHaveLength(3);
  expect(rule.tags).toEqual({ platform: 'tiktok', entityType: 'ad' });
  expect(rule.segments).toMatchObject([
    { kind: 'enum', key: 'market', allowedValues: [], definitionId: 'def-market' },
    { kind: 'enum', key: 'format', allowedValues: [{ label: 'London: City', code: 'UK:LDN' }, { label: 'A|B', code: 'A|B' }, { label: 'Zero one', code: '01' }] },
    { kind: 'freeform', key: 'hook', required: false, maxLength: 16, illegalChars: [' ', '/'] },
  ]);
});

test('an import naming a Rule already in the Rule Set adds nothing and says why', async ({ page }) => {
  await seedRuleSets(page, [paidMediaRuleSet], 'admin');
  await page.goto('/rules/ruleset-paid');

  await page.getByTestId('input-import-rules').setInputFiles(await workbook(
    [['brand_new', 'Brand new', '_', '', ''], ['meta_ad_sets', 'Meta again', '_', '', '']],
    [['brand_new', 'theme', 'Theme', 'freeform', 'true', '10', '', ''], ['meta_ad_sets', 'theme', 'Theme', 'freeform', 'true', '10', '', '']],
    [],
  ));
  await expect(page.getByTestId('list-import-errors')).toContainText('Rules row 3: a Rule with the key "meta_ad_sets" is already in this Rule Set.');
  await expect(page.getByTestId('table-rules')).not.toContainText('Brand new');
  await expect(page.getByTestId('text-unsaved')).toHaveCount(0);
});

test('a file that is not a workbook is refused', async ({ page }) => {
  await seedRuleSets(page, [paidMediaRuleSet], 'admin');
  await page.goto('/rules/ruleset-paid');
  await page.getByTestId('input-import-rules').setInputFiles({ name: 'rules.xlsx', mimeType: 'text/csv', buffer: Buffer.from('rule_key\nx') });
  await expect(page.getByTestId('list-import-errors')).toContainText('could not be read as an Excel workbook');
});

test('export downloads the Rules, Segments and Values sheets', async ({ page }) => {
  await seedRuleSets(page, [paidMediaRuleSet], 'admin');
  await page.goto('/rules/ruleset-paid');

  const download = page.waitForEvent('download');
  await page.getByTestId('button-export-rules').click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('paid_media_test_rules.xlsx');
  const sheets = await readXlsxFile(await file.path(), { trim: false });
  const sheet = (name: string) => sheets.find((item) => item.sheet === name)!.data;
  expect(sheets.map((item) => item.sheet)).toEqual(['Rules', 'Segments', 'Values', 'Read me']);
  expect(sheet('Rules')).toEqual([RULES, ['google_campaigns', 'Google Campaigns', '_', 'google', 'campaign'], ['meta_ad_sets', 'Meta Ad Sets', '_', 'meta', 'ad_set']]);
  expect(sheet('Segments')[4]).toEqual(['meta_ad_sets', 'audience', 'Audience', 'freeform', 'true', '20', ' ', null]);
  expect(sheet('Values')).toHaveLength(7);
  expect(sheet('Values')[1]).toEqual(['google_campaigns', 'campaign_type', 'brand', 'brand']);
});
