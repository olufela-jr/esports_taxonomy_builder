import type { BuildDraft, Definition, RuleSet, ValueRequest } from './types';

// Browser-local copies for the in-memory store (development only); Firestore
// users never have browser-local data. One key per collection, current shape
// or nothing: a corrupt or missing entry reads as null.
const RULE_SETS_KEY = 'campaign-naming-rulesets-v3';
const DEFINITIONS_KEY = 'campaign-naming-definitions-v3';
const REQUESTS_KEY = 'campaign-naming-requests-v3';
const DRAFTS_KEY = 'campaign-naming-drafts-v3';

function readList<T>(key: string): T[] | null {
  try {
    const current = window.localStorage.getItem(key);
    if (!current) return null;
    const parsed: unknown = JSON.parse(current);
    return Array.isArray(parsed) ? (parsed as T[]) : null;
  } catch {
    // Corrupt storage: treat as empty.
    return null;
  }
}

function writeList(key: string, items: unknown[]): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(items));
  } catch {
    // Storage unavailable (private mode, quota): the in-memory copy still works.
  }
}

export function readLocalRuleSets(): RuleSet[] | null {
  return readList<RuleSet>(RULE_SETS_KEY);
}

export function writeLocalRuleSets(ruleSets: RuleSet[]): void {
  writeList(RULE_SETS_KEY, ruleSets);
}

export function readLocalDefinitions(): Definition[] | null {
  return readList<Definition>(DEFINITIONS_KEY);
}

export function writeLocalDefinitions(definitions: Definition[]): void {
  writeList(DEFINITIONS_KEY, definitions);
}

export function readLocalRequests(): ValueRequest[] | null {
  return readList<ValueRequest>(REQUESTS_KEY);
}

export function writeLocalRequests(requests: ValueRequest[]): void {
  writeList(REQUESTS_KEY, requests);
}

export function readLocalDrafts(): BuildDraft[] | null {
  return readList<BuildDraft>(DRAFTS_KEY);
}

export function writeLocalDrafts(drafts: BuildDraft[]): void {
  writeList(DRAFTS_KEY, drafts);
}
