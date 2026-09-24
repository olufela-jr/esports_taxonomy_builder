// The pure half of the v3 migration: what a pre-v3 /rulesets document becomes
// under tenants/{tenantId}/rulesets. No Firestore here, so it is unit tested
// without an emulator; scripts/migrate-v3.ts does the reading and writing.
import { checkRuleSet, entryFromCode, isPlatform, PLATFORMS, type EnumEntry, type EnumSegment, type FreeformSegment, type Rule, type Segment } from '@taxo/shared';
import type { RuleSet, Tenant } from '../../apps/web/src/data/types';

// A pre-v3 document: ownerId instead of createdBy and updatedBy, and enum
// values that may be flat strings (D39 makes them label/code pairs).
export type LegacyEnumSegment = Omit<EnumSegment, 'allowedValues'> & { allowedValues?: Array<string | EnumEntry> };
export type LegacySegment = LegacyEnumSegment | FreeformSegment;
export type LegacyRule = Omit<Rule, 'segments'> & { segments: LegacySegment[] };
export type LegacyRuleSet = Omit<RuleSet, 'rules' | 'createdBy' | 'updatedBy'> & {
  rules: LegacyRule[];
  ownerId?: string;
  createdBy?: string;
  updatedBy?: string;
};

function transformSegment(segment: LegacySegment): Segment {
  if (segment.kind !== 'enum') return segment;
  // A flat value becomes an entry with label = code (O15); an entry stays as it is.
  const allowedValues = (segment.allowedValues ?? []).map((value) => (typeof value === 'string' ? entryFromCode(value) : value));
  return { ...segment, allowedValues };
}

// The document as it will be stored under the tenant. Everything but the audit
// fields and the enum entries is carried over untouched, ids and timestamps
// included, so the persisted workspace context in every browser still resolves.
// Running it on an already migrated document changes nothing.
export function transformRuleSet(legacy: LegacyRuleSet): RuleSet {
  const { ownerId, ...rest } = legacy;
  const createdBy = rest.createdBy ?? ownerId;
  if (!createdBy) {
    throw new Error(`Rule Set "${legacy.id}" has neither ownerId nor createdBy; it cannot be attributed.`);
  }
  return {
    ...rest,
    createdBy,
    updatedBy: rest.updatedBy ?? createdBy,
    rules: legacy.rules.map((rule) => ({ ...rule, segments: rule.segments.map(transformSegment) })),
  };
}

// Every dataset any Rule reads from, once, sorted: the tenant's initial
// allowedDatasets, so the Stage 2 scan can run every existing Rule as is.
export function collectDatasets(ruleSets: Array<{ rules: Array<{ source: { dataset: string } }> }>): string[] {
  const datasets = new Set<string>();
  for (const ruleSet of ruleSets) {
    for (const rule of ruleSet.rules) {
      if (rule.source.dataset.trim()) datasets.add(rule.source.dataset.trim());
    }
  }
  return [...datasets].sort();
}

export function tenantDocument(id: string, name: string, allowedDatasets: string[], now: string, platforms: string[] = []): Tenant {
  return {
    id,
    name,
    config: { allowedDatasets, platforms },
    createdAt: now,
    updatedAt: now,
  };
}

// A comma-separated `--platforms` value as the tenant's platform ids (D38):
// trimmed, lowercased, deduplicated, every one a known platform or an error.
export function parsePlatforms(value: string): string[] {
  const ids = [...new Set(value.split(',').map((item) => item.trim().toLowerCase()).filter(Boolean))];
  const unknown = ids.filter((id) => !isPlatform(id));
  if (unknown.length > 0) {
    throw new Error(`Unknown platform(s): ${unknown.join(', ')}. Known: ${PLATFORMS.map((platform) => platform.id).join(', ')}.`);
  }
  return ids;
}

// Problems with a document as stored under the tenant, for the dry run and
// the post-write verification. Empty means the document is what v3 expects.
// Shape problems are reported on their own: the engine's checks assume
// well-formed entries, so they run only once the shape is right.
export function verifyRuleSet(ruleSet: RuleSet): string[] {
  const issues: string[] = [];
  if (typeof ruleSet.createdBy !== 'string' || !ruleSet.createdBy) issues.push('createdBy is missing.');
  if (typeof ruleSet.updatedBy !== 'string' || !ruleSet.updatedBy) issues.push('updatedBy is missing.');
  if ('ownerId' in ruleSet) issues.push('ownerId is still present.');
  for (const rule of ruleSet.rules) {
    for (const segment of rule.segments) {
      if (segment.kind !== 'enum') continue;
      const flat = (segment.allowedValues as unknown[]).filter((entry) => !entry || typeof entry !== 'object' || typeof (entry as EnumEntry).code !== 'string' || typeof (entry as EnumEntry).label !== 'string');
      if (flat.length > 0) issues.push(`Rule "${rule.name}", segment "${segment.label}": ${flat.length} value(s) are not label/code entries.`);
    }
  }
  if (issues.length > 0) return issues;
  return checkRuleSet(ruleSet);
}
