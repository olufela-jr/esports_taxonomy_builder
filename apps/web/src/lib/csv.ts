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

function parseCsv(text: string): string[][] {
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

// A demo name for a Rule: one valid, one with a bad first value, one missing
// its last required segment. Keeps the sample CSV meaningful for any Rule Set.
function sampleName(rule: Rule, variant: 'valid' | 'badValue' | 'short'): string {
  const required = rule.segments.filter((segment) => segment.required);
  const tokens = required.map((segment, index) => {
    const spoil = variant === 'badValue' && index === 0;
    if (segment.kind === 'enum') return spoil ? 'xx' : (segment.allowedValues[0]?.code ?? 'value');
    return spoil ? 'bad value' : 'sample';
  });
  if (variant === 'short') tokens.pop();
  return tokens.join(rule.delimiter);
}

// One column per mapped name column, three rows. Takes a RESOLVED Rule Set, so
// a definition-backed segment offers a real code.
export function sampleCsv(ruleSet: RuleSet): string {
  const columns = mappedColumns(ruleSet);
  if (columns.length === 0) return 'name\n';
  const variants = ['valid', 'badValue', 'short'] as const;
  const rows = variants.map((variant) => columns.map((column) => {
    const rule = ruleSet.rules.find((item) => item.source.nameColumn === column);
    return rule ? sampleName(rule, variant) : '';
  }));
  return [columns.join(','), ...rows.map((row) => row.join(','))].join('\n');
}
