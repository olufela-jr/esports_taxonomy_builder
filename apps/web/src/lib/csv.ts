// CSV parsing and download, shared by Check and the compliance board. Parsing
// stays in the browser: no CSV ever goes to a Function.
import Papa from 'papaparse';
import type { Rule } from '@taxo/shared';
import type { RuleSet } from '@/data/store';

export type CsvTable = {
  // Lowercased, so a column lookup is case-insensitive the way it always was.
  headers: string[];
  rows: string[][];
};

export function parseCsv(text: string): string[][] {
  return Papa.parse<string[]>(text.trim(), { skipEmptyLines: true }).data;
}

// The header row plus every row with something in it. Fewer than two rows means
// there is nothing to check.
export function readCsv(text: string): CsvTable | null {
  const rows = parseCsv(text);
  if (rows.length < 2) return null;
  return {
    headers: rows[0].map((header) => header.toLowerCase()),
    rows: rows.slice(1).filter((row) => row.some(Boolean)),
  };
}

// Every column a Rule Set expects a name in, deduplicated in Rule order.
export function mappedColumns(ruleSet: RuleSet): string[] {
  return Array.from(new Set(ruleSet.rules.map((rule) => rule.source.nameColumn).filter(Boolean)));
}

// One Rule's names out of a parsed CSV. A null column is the one seam where
// "missing mapped column" is decided, so both screens decide it the same way.
export function namesForRule(table: CsvTable, rule: Rule): { column: string; names: string[] | null } {
  const column = rule.source.nameColumn;
  const index = table.headers.indexOf(column.toLowerCase());
  if (index === -1) return { column, names: null };
  return { column, names: table.rows.map((row) => row[index] ?? '') };
}

export function downloadCsv(rows: string[][], filename: string): void {
  const text = rows.map((row) => row.map((value) => `"${value.replaceAll('"', '""')}"`).join(',')).join('\n');
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
