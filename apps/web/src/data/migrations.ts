import { entriesFromCodes, entryFromCode, type EnumEntry, type Rule, type Segment, type Source, type Tags } from '@taxo/shared';
import { newId } from '@/lib/ids';
import type { Definition, RuleSet } from './types';

// localStorage keys, newest first. Only the in-memory store (development) reads
// these; Firestore users never had browser-local data.
//
// v3: enum values are { label, code } entries (v3 phase 1).
export const LOCAL_STORAGE_KEY = 'campaign-naming-rulesets-v3';
// v2: Rules and Segments carry immutable ids, Rules have `name` and `tags`;
// enum values were flat strings.
const V2_STORAGE_KEY = 'campaign-naming-rulesets-v2';
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

// A v2 document is the current shape except that an enum segment's values may
// be flat strings (an entry that is already an object passes through) and the
// audit field was a single ownerId.
type V2Segment = Omit<Segment, 'allowedValues'> & { allowedValues?: Array<string | EnumEntry> };
type V2Rule = Omit<Rule, 'segments'> & { segments: V2Segment[] };
type V2RuleSet = Omit<RuleSet, 'rules' | 'createdBy' | 'updatedBy'> & {
  rules: V2Rule[];
  ownerId?: string;
  createdBy?: string;
  updatedBy?: string;
};

function migrateV1Segment(segment: V1Segment, delimiter: string): Segment {
  if (segment.kind === 'enum') {
    return {
      id: newId(),
      kind: 'enum',
      key: segment.key,
      label: segment.label,
      required: segment.required,
      allowedValues: entriesFromCodes(segment.allowedValues ?? []),
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

function migrateV2Segment(segment: V2Segment): Segment {
  if (segment.kind !== 'enum') return segment as Segment;
  const allowedValues = (segment.allowedValues ?? []).map((value) => (typeof value === 'string' ? entryFromCode(value) : value));
  return { ...segment, kind: 'enum', allowedValues } as Segment;
}

// Flat string values become label = code entries and ownerId becomes createdBy
// and updatedBy. The Firestore migration script (scripts/) does the same to the
// live data with the engine's entryFromCode.
export function migrateV2RuleSet(ruleSet: V2RuleSet): RuleSet {
  const { ownerId, ...rest } = ruleSet;
  const createdBy = rest.createdBy ?? ownerId ?? 'you';
  return {
    ...rest,
    createdBy,
    updatedBy: rest.updatedBy ?? createdBy,
    rules: ruleSet.rules.map((rule) => ({ ...rule, segments: rule.segments.map(migrateV2Segment) })),
  };
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

    const v2 = window.localStorage.getItem(V2_STORAGE_KEY);
    if (v2) {
      const parsed: unknown = JSON.parse(v2);
      if (Array.isArray(parsed)) return (parsed as V2RuleSet[]).map(migrateV2RuleSet);
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

// Shared definitions (v3 phase 2) are a new collection, so there is nothing to
// migrate: the current shape or nothing.
export const LOCAL_DEFINITIONS_KEY = 'campaign-naming-definitions-v3';

export function readLocalDefinitions(): Definition[] | null {
  try {
    const current = window.localStorage.getItem(LOCAL_DEFINITIONS_KEY);
    if (current) {
      const parsed: unknown = JSON.parse(current);
      return Array.isArray(parsed) ? (parsed as Definition[]) : null;
    }
  } catch {
    // Corrupt storage: treat as empty.
  }
  return null;
}

export function writeLocalDefinitions(definitions: Definition[]): void {
  try {
    window.localStorage.setItem(LOCAL_DEFINITIONS_KEY, JSON.stringify(definitions));
  } catch {
    // Storage unavailable: the in-memory copy still works.
  }
}
