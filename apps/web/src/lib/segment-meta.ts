import { ancestorsOf, type Rule, type RuleSet } from '@taxo/shared';

// Global: the segment reads a tenant-wide definition. Local: the segment's own
// list of values. Freeform segments have neither.
export type SegmentScope = 'global' | 'local' | null;

export type SegmentMeta = {
  inherited: boolean;
  ownerRuleId: string; // the stored Rule the segment belongs to
  scope: SegmentScope;
  definitionId?: string;
};

// What a resolved Rule no longer says about its segments: which were
// inherited, from which Rule, and which read a definition. resolveRule drops
// definitionId and flattens the parents, so this walks the stored chain.
// Keyed by segment id, which resolving keeps.
export function segmentMeta(rule: Rule, ruleSet: RuleSet): Record<string, SegmentMeta> {
  const meta: Record<string, SegmentMeta> = {};
  for (const owner of [rule, ...ancestorsOf(rule, ruleSet)]) {
    for (const segment of owner.segments) {
      if (meta[segment.id]) continue;
      const definitionId = segment.kind === 'enum' ? segment.definitionId : undefined;
      meta[segment.id] = {
        inherited: owner.id !== rule.id,
        ownerRuleId: owner.id,
        scope: segment.kind === 'enum' ? (definitionId ? 'global' : 'local') : null,
        ...(definitionId ? { definitionId } : {}),
      };
    }
  }
  return meta;
}
