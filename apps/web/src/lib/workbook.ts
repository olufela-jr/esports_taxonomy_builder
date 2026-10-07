// Excel workbooks of Rules, for the Rule Set page. The only module that touches
// the spreadsheet libraries; both load on first use, so they stay out of the
// main bundle. The format itself (sheets, columns, checks) lives in @taxo/shared.
import { RULE_SHEET_HELP, RULE_SHEET_NAMES, type RuleSheets } from '@taxo/shared';

// Every cell is written as text ('@'), so Excel keeps a code like 01 or TRUE
// exactly as it is instead of reading it as a number or a boolean.
function textRows(rows: string[][]) {
  return rows.map((row, index) => row.map((value) => ({ value, type: String, format: '@', fontWeight: index === 0 ? ('bold' as const) : undefined })));
}

export async function downloadRulesWorkbook(sheets: RuleSheets, filename: string): Promise<void> {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  const sheet = (name: string, rows: string[][]) => ({ sheet: name, data: textRows(rows), stickyRowsCount: 1, columns: rows[0].map(() => ({ width: 22 })) });
  await writeXlsxFile([
    sheet(RULE_SHEET_NAMES.rules, sheets.rules),
    sheet(RULE_SHEET_NAMES.segments, sheets.segments),
    sheet(RULE_SHEET_NAMES.values, sheets.values),
    { ...sheet('Read me', RULE_SHEET_HELP), columns: [{ width: 12 }, { width: 24 }, { width: 100 }] },
  ]).toFile(filename);
}

// A cell the way it would read as text. A row typed by hand into a cell Excel
// formats as General can come back as a number or a boolean.
function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

export async function readRulesWorkbook(file: File): Promise<{ sheets: RuleSheets } | { error: string }> {
  const { default: readXlsxFile } = await import('read-excel-file/browser');
  let workbook;
  try {
    // trim: false, because a code is exact: a leading space is part of it.
    workbook = await readXlsxFile(file, { trim: false });
  } catch {
    return { error: 'This file could not be read as an Excel workbook (.xlsx).' };
  }
  const find = (name: string) => workbook.find((item) => item.sheet.trim().toLowerCase() === name.toLowerCase());
  const missing = Object.values(RULE_SHEET_NAMES).filter((name) => !find(name));
  if (missing.length > 0) return { error: `The workbook needs sheets named ${Object.values(RULE_SHEET_NAMES).join(', ')}; missing ${missing.join(', ')}.` };
  const rows = (name: string) => find(name)!.data.map((row) => row.map(cellText));
  return { sheets: { rules: rows(RULE_SHEET_NAMES.rules), segments: rows(RULE_SHEET_NAMES.segments), values: rows(RULE_SHEET_NAMES.values) } };
}
