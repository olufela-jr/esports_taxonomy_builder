import { entryFromCode, type EnumEntry, type FreeformSegment, type Rule, type Segment, type Tags } from '@taxo/shared';
import { newId } from '@/lib/ids';
import { isPlaceholderLabel } from '@/lib/value-lists';

// Editing helpers for a Rule Set draft. Pure functions over the Rules array;
// the naming checks themselves stay in @taxo/shared.

// A segment's label is still its default, so naming it after its value list
// overwrites nothing anyone chose: a placeholder, or the name of the list it
// already follows (its Global, or the Local list its values match).
export function isDefaultLabel(label: string, followed: Array<string | undefined>): boolean {
  return isPlaceholderLabel(label) || followed.some((name) => name !== undefined && name === label.trim());
}

// Editable slug derived from a display name. Keys are lowercase by convention;
// enum values are not touched, they match exactly and case-sensitively.
export function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
}

// A cleared definitionId leaves the segment rather than lingering as undefined.
export function mergeSegment(segment: Segment, updates: Partial<Segment>): Segment {
  const merged = { ...segment, ...updates } as Segment;
  if (merged.kind === 'enum' && merged.definitionId === undefined) delete merged.definitionId;
  return merged;
}

// Drop empty tag values so a Rule with neither carries no tags object at all.
export function cleanTags(tags: Tags): Tags | undefined {
  const next: Tags = {};
  if (tags.platform?.trim()) next.platform = tags.platform.trim();
  if (tags.entityType?.trim()) next.entityType = tags.entityType.trim();
  return Object.keys(next).length ? next : undefined;
}

// Descendants take the delimiter and platform of the Rule they inherit from.
export function cascadeToChildren(rules: Rule[], parentId: string): Rule[] {
  const parent = rules.find((rule) => rule.id === parentId);
  if (!parent) return rules;
  let next = rules;
  for (const rule of rules) {
    if (rule.parent?.ruleId !== parentId) continue;
    const tags = cleanTags({ ...rule.tags, platform: parent.tags?.platform ?? '' });
    const updated: Rule = { ...rule, delimiter: parent.delimiter, ...(tags ? { tags } : {}) };
    if (!tags) delete updated.tags;
    next = next.map((item) => (item.id === rule.id ? updated : item));
    next = cascadeToChildren(next, rule.id);
  }
  return next;
}

export function emptyRule(index: number): Rule {
  return { id: newId(), key: `rule_${index + 1}`, name: `Rule ${index + 1}`, delimiter: '-', segments: [emptySegment(0)], source: { dataset: 'marketing', table: 'campaign_values', nameColumn: 'name' } };
}

export function emptySegment(index: number): FreeformSegment {
  return { id: newId(), kind: 'freeform', key: `segment_${index + 1}`, label: `Segment ${index + 1}`, required: true, maxLength: 32, illegalChars: [' ', '/', '?', '#', '&'] };
}

export function parseList(text: string): string[] {
  return text.split(',').map((value) => value.trim()).filter(Boolean);
}

// Author edits a Local list as one comma list of codes. A code that already
// has an entry keeps its label; a new code gets itself as its label.
export function entriesFromCodeList(codes: string[], existing: EnumEntry[]): EnumEntry[] {
  return codes.map((code) => existing.find((entry) => entry.code === code) ?? entryFromCode(code));
}

// ---- Updates on the Rules array, by Rule id -------------------------------------

// A child shares its parent's delimiter and platform (D29, D47), so a change
// on a parent flows down to every descendant; a cleared parent link or UTM
// mapping leaves the Rule rather than lingering as undefined.
export function updateRule(rules: Rule[], ruleId: string, updates: Partial<Rule>): Rule[] {
  const next = rules.map((rule) => {
    if (rule.id !== ruleId) return rule;
    const merged = { ...rule, ...updates };
    if (merged.parent === undefined) delete merged.parent;
    if (merged.utm === undefined) delete merged.utm;
    if (merged.tags === undefined) delete merged.tags;
    return merged;
  });
  return cascadeToChildren(next, ruleId);
}

export function updateTags(rules: Rule[], ruleId: string, patch: Tags): Rule[] {
  const next = rules.map((rule) => {
    if (rule.id !== ruleId) return rule;
    const tags = cleanTags({ ...rule.tags, ...patch });
    const updated: Rule = { ...rule, ...(tags ? { tags } : {}) };
    if (!tags) delete updated.tags;
    return updated;
  });
  return cascadeToChildren(next, ruleId);
}

function onRule(rules: Rule[], ruleId: string, change: (rule: Rule) => Rule): Rule[] {
  return rules.map((rule) => (rule.id === ruleId ? change(rule) : rule));
}

export function updateSegment(rules: Rule[], ruleId: string, segmentId: string, updates: Partial<Segment>): Rule[] {
  return onRule(rules, ruleId, (rule) => ({ ...rule, segments: rule.segments.map((segment) => (segment.id === segmentId ? mergeSegment(segment, updates) : segment)) }));
}

// Returns the new segment's id as well, so the editor can open it.
export function addSegment(rules: Rule[], ruleId: string): { rules: Rule[]; segmentId: string } {
  const rule = rules.find((item) => item.id === ruleId);
  const segment = emptySegment(rule?.segments.length ?? 0);
  return { rules: onRule(rules, ruleId, (current) => ({ ...current, segments: [...current.segments, segment] })), segmentId: segment.id };
}

export function removeSegment(rules: Rule[], ruleId: string, segmentId: string): Rule[] {
  return onRule(rules, ruleId, (rule) => ({ ...rule, segments: rule.segments.filter((segment) => segment.id !== segmentId) }));
}

// Array order is the segment position, so reordering just moves the entry.
export function moveSegmentTo(rules: Rule[], ruleId: string, segmentId: string, toIndex: number): Rule[] {
  return onRule(rules, ruleId, (rule) => {
    const from = rule.segments.findIndex((segment) => segment.id === segmentId);
    if (from < 0 || toIndex < 0 || toIndex >= rule.segments.length || from === toIndex) return rule;
    const segments = [...rule.segments];
    const [moved] = segments.splice(from, 1);
    segments.splice(toIndex, 0, moved);
    return { ...rule, segments };
  });
}
