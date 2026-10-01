import type { Rule, Segment } from '@taxo/shared';

// Sample selections for previewing a RESOLVED Rule: one value per segment,
// optional ones included, so a preview shows the whole shape of a name. Only
// picks values; whether they make a valid name is always compose's call.
// seed 0 takes each enum's first code; any other seed picks one per segment.
export function exampleSelections(rule: Rule, seed = 0): Record<string, string> {
  const selections: Record<string, string> = {};
  rule.segments.forEach((segment, index) => {
    const value = sampleValue(segment, rule.delimiter, seed, index);
    if (value) selections[segment.key] = value;
  });
  return selections;
}

function sampleValue(segment: Segment, delimiter: string, seed: number, index: number): string {
  if (segment.kind === 'enum') {
    const codes = segment.allowedValues.map((entry) => entry.code);
    if (codes.length === 0) return '';
    return codes[seed === 0 ? 0 : pick(seed, index, codes.length)];
  }
  // Freeform has no sample in the model: a slug of the label, without the
  // delimiter or the segment's illegal characters, cut to its length.
  const banned = new Set([...segment.illegalChars, delimiter]);
  const slug = [...segment.label.toLowerCase().replace(/[^a-z0-9]/g, '')].filter((char) => !banned.has(char)).join('') || 'sample';
  return segment.maxLength > 0 ? slug.slice(0, segment.maxLength) : slug;
}

// A small deterministic spread so one shuffle seed gives one stable example.
function pick(seed: number, index: number, size: number): number {
  const mixed = Math.imul(seed ^ (index + 1) * 0x9e3779b1, 0x85ebca6b) >>> 0;
  return mixed % size;
}
