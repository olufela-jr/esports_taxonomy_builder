import type { Rule, Segment, Source, Tags } from '@taxo/shared';
import { newId } from '@/lib/ids';
import type { RuleSet } from './types';

// localStorage keys, newest first. Only the in-memory store (development) reads
// these; Firestore users never had browser-local data.
//
// v2: Rules and Segments carry immutable ids, Rules have `name` and `tags`.
export const LOCAL_STORAGE_KEY = 'campaign-naming-rulesets-v2';
// v1: no ids, Rules had `label` plus flat `platform` / `entityType`, and the
// delimiter was copied into every freeform segment's illegalChars.
const V1_STORAGE_KEY = 'campaign-naming-rulesets-v1';
// v0: the prototype's "taxonomy" shape, with `levels` instead of `rules`.
const V0_STORAGE_KEY = 'campaign-taxonomy-taxonomies-v2';

type V1Segment = {
  kind: 'enum' | 'freeform';
  key: string;
  label: string;
  required: boolean;
  allowedValues?: string[];
  maxLength?: number;
  illegalChars?: string[];
};

type V1Rule = {
  key: string;
  label: string;
  delimiter: string;
  segments: V1Segment[];
  source: Source;
  platform?: string;
  entityType?: string;
};

type V1RuleSet = Omit<RuleSet, 'rules'> & { rules: V1Rule[] };
type V0RuleSet = Omit<RuleSet, 'rules'> & { levels: V1Rule[] };

function migrateV1Segment(segment: V1Segment, delimiter: string): Segment {
  if (segment.kind === 'enum') {
    return {
      id: newId(),
      kind: 'enum',
      key: segment.key,
      label: segment.label,
      required: segment.required,
      allowedValues: segment.allowedValues ?? [],
    };
  }
  return {
    id: newId(),
    kind: 'freeform',
    key: segment.key,
    label: segment.label,
    required: segment.required,
    maxLength: segment.maxLength ?? 32,
    // The engine enforces the delimiter; drop the copy older versions stored.
    illegalChars: (segment.illegalChars ?? []).filter((character) => character !== delimiter),
  };
}

function migrateV1Rule(rule: V1Rule): Rule {
  const tags: Tags = {};
  if (rule.platform) tags.platform = rule.platform;
  if (rule.entityType) tags.entityType = rule.entityType;
  return {
    id: newId(),
    key: rule.key,
    name: rule.label,
    ...(Object.keys(tags).length ? { tags } : {}),
    delimiter: rule.delimiter,
    segments: rule.segments.map((segment) => migrateV1Segment(segment, rule.delimiter)),
    source: rule.source,
  };
}

function migrateV1RuleSet(ruleSet: V1RuleSet): RuleSet {
  return { ...ruleSet, rules: ruleSet.rules.map(migrateV1Rule) };
}

function isV0RuleSet(value: unknown): value is V0RuleSet {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<V0RuleSet>;
  return typeof candidate.id === 'string' && typeof candidate.name === 'string' && Array.isArray(candidate.levels);
}

function migrateV0RuleSet(old: V0RuleSet): RuleSet {
  const { levels, ...rest } = old;
  return migrateV1RuleSet({ ...rest, id: old.id.replace('taxonomy-', 'ruleset-'), rules: levels });
}

// Returns the browser-local Rule Sets in the current shape, or null when the
// browser has never stored any.
export function readLocalRuleSets(): RuleSet[] | null {
  try {
    const current = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    if (current) {
      const parsed: unknown = JSON.parse(current);
      return Array.isArray(parsed) ? (parsed as RuleSet[]) : null;
    }

    const v1 = window.localStorage.getItem(V1_STORAGE_KEY);
    if (v1) {
      const parsed: unknown = JSON.parse(v1);
      if (Array.isArray(parsed)) return (parsed as V1RuleSet[]).map(migrateV1RuleSet);
    }

    const v0 = window.localStorage.getItem(V0_STORAGE_KEY);
    if (v0) {
      const parsed: unknown = JSON.parse(v0);
      if (Array.isArray(parsed)) {
        const migrated = parsed.filter(isV0RuleSet).map(migrateV0RuleSet);
        if (migrated.length > 0) return migrated;
      }
    }
  } catch {
    // Corrupt storage: treat as empty.
  }
  return null;
}

export function writeLocalRuleSets(ruleSets: RuleSet[]): void {
  try {
    window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(ruleSets));
  } catch {
    // Storage unavailable (private mode, quota): the in-memory copy still works.
  }
}
