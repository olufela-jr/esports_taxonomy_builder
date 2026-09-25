// The BigQuery scan (Stage 2, v3 phase 4), kept SDK-free so it is unit tested
// with a fake reader: the query is built from a whitelisted source, names are
// judged by the engine, and the impact of a definition edit is counted.
import { HttpsError } from 'firebase-functions/v2/https';
import { validate, type Rule, type Source, type Violation } from '@taxo/shared';

// Identifiers are whitelisted, never escaped: anything else is refused.
const IDENTIFIER = /^[A-Za-z0-9_]+$/;

// The annotated list is capped; the counts are always exact over the full scan.
export const RESULT_CAP = 5000;

// A scan that would read more than this fails instead of billing (O5): a
// misconfigured source cannot run up a bill. 1 GB is far above a name column.
export const MAX_BYTES_BILLED = 1_000_000_000;

export type ScanQuery = {
  query: string;
  params: Record<string, string[]>;
};

// One reader per backend: BigQuery in production, an array in tests.
export type NameReader = {
  distinctNames(scan: ScanQuery): Promise<string[]>;
};

function identifier(value: string, what: string): string {
  if (!IDENTIFIER.test(value)) {
    throw new HttpsError('invalid-argument', `The ${what} "${value}" is not a plain identifier (letters, digits and underscores only).`);
  }
  return value;
}

// SELECT DISTINCT nameColumn with the optional filter passed as a query
// parameter, never concatenated (spec: Stage 2).
export function buildScanQuery(projectId: string, source: Source): ScanQuery {
  const dataset = identifier(source.dataset, 'dataset');
  const table = identifier(source.table, 'table');
  const column = identifier(source.nameColumn, 'name column');
  let query = `SELECT DISTINCT \`${column}\` AS name FROM \`${projectId}.${dataset}.${table}\` WHERE \`${column}\` IS NOT NULL`;
  const params: Record<string, string[]> = {};
  if (source.filter) {
    const filterColumn = identifier(source.filter.column, 'filter column');
    query += ` AND \`${filterColumn}\` IN UNNEST(@filterIn)`;
    params.filterIn = source.filter.in;
  }
  return { query, params };
}

export type ScanResult = {
  scanned: number;
  valid: number;
  invalid: number;
  truncated: boolean;
  results: Array<{ name: string; valid: boolean; violations: Violation[] }>;
};

// Every name judged by the engine; exact counts over all of them, the first
// RESULT_CAP annotated.
export function evaluateNames(rule: Rule, names: string[]): ScanResult {
  let valid = 0;
  const results: ScanResult['results'] = [];
  for (const name of names) {
    const checked = validate(rule, name);
    if (checked.valid) valid += 1;
    if (results.length < RESULT_CAP) results.push({ name, valid: checked.valid, violations: checked.violations });
  }
  return { scanned: names.length, valid, invalid: names.length - valid, truncated: names.length > RESULT_CAP, results };
}

export type ImpactResult = {
  scanned: number;
  wouldFail: number;    // names valid under the current Rule that fail under the proposed one
  examples: string[];   // a few of them, for the admin's confirm
};

// D44: what a definition edit would do to the live names of one Rule.
export function impactOf(current: Rule, proposed: Rule, names: string[]): ImpactResult {
  let wouldFail = 0;
  const examples: string[] = [];
  for (const name of names) {
    if (validate(current, name).valid && !validate(proposed, name).valid) {
      wouldFail += 1;
      if (examples.length < 10) examples.push(name);
    }
  }
  return { scanned: names.length, wouldFail, examples };
}
