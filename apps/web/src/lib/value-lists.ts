import { dependentsOf, type EnumSegment, type Rule } from '@taxo/shared';
import type { RuleSet } from '@/data/store';

// The Definitions page lists two kinds of value list. Global: a stored
// definition, tenant-wide. Local: an enum segment's own list, kept on one
// Rule. Locals are not stored on their own; they are read off the Rule Sets.

export type LocalList = {
  ruleSet: RuleSet;
  rule: Rule;
  segment: EnumSegment;
  platform: string; // the Rule's platform, '' for none
};

export function localLists(ruleSets: RuleSet[]): LocalList[] {
  const lists: LocalList[] = [];
  for (const ruleSet of ruleSets) {
    for (const rule of ruleSet.rules) {
      for (const segment of rule.segments) {
        if (segment.kind === 'enum' && !segment.definitionId) lists.push({ ruleSet, rule, segment, platform: rule.tags?.platform ?? '' });
      }
    }
  }
  return lists;
}

// One Rule that uses a list: directly, or by inheriting the segment that does.
export type Usage = {
  ruleSetId: string;
  ruleSetName: string;
  ruleId: string;
  ruleName: string;
  segmentId: string;
  segmentLabel: string;
  inherited: boolean;
};

// The segment's Rule and every Rule that inherits the segment from it, at any depth.
function usageOfSegment(ruleSet: RuleSet, rule: Rule, segment: EnumSegment): Usage[] {
  const found: Usage[] = [{ ruleSetId: ruleSet.id, ruleSetName: ruleSet.name, ruleId: rule.id, ruleName: rule.name, segmentId: segment.id, segmentLabel: segment.label, inherited: false }];
  const seen = new Set([rule.id]);
  const queue = [rule.id];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    for (const dependent of dependentsOf(ruleSet, current, segment.id)) {
      if (seen.has(dependent.ruleId)) continue;
      seen.add(dependent.ruleId);
      queue.push(dependent.ruleId);
      found.push({ ruleSetId: ruleSet.id, ruleSetName: ruleSet.name, ruleId: dependent.ruleId, ruleName: dependent.ruleName, segmentId: segment.id, segmentLabel: segment.label, inherited: true });
    }
  }
  return found;
}

export function globalUsage(ruleSets: RuleSet[], definitionId: string): Usage[] {
  const usage: Usage[] = [];
  for (const ruleSet of ruleSets) {
    for (const rule of ruleSet.rules) {
      for (const segment of rule.segments) {
        if (segment.kind === 'enum' && segment.definitionId === definitionId) usage.push(...usageOfSegment(ruleSet, rule, segment));
      }
    }
  }
  return usage;
}

export function localUsage(list: LocalList): Usage[] {
  return usageOfSegment(list.ruleSet, list.rule, list.segment);
}

// "Used by N Rules": distinct Rules, a Rule counted once however it uses the list.
export function ruleCount(usage: Usage[]): number {
  return new Set(usage.map((item) => `${item.ruleSetId}/${item.ruleId}`)).size;
}
