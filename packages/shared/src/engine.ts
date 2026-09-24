// These types double as the Firestore document contract. Keep them plain.
// `id` is immutable identity (React keys, references); `key` is the editable slug.

// One allowed value of an enum segment: the label is what people see in a
// dropdown, the code is what the engine writes into the name and the checker
// matches (exact, case-sensitive). Codes and labels are unique within a list.
export type EnumEntry = {
  label: string;
  code: string;
};

export type EnumSegment = {
  id: string;
  kind: "enum";
  key: string;
  label: string;
  required: boolean;
  allowedValues: EnumEntry[];
};

export type FreeformSegment = {
  id: string;
  kind: "freeform";
  key: string;
  label: string;
  required: boolean;
  maxLength: number;
  illegalChars: string[]; // the delimiter is enforced by the engine; never listed here
};

// Array order is the segment position. No stored position index.
export type Segment = EnumSegment | FreeformSegment;

export type Source = {
  dataset: string;
  table: string;
  nameColumn: string;
  filter?: {
    column: string;
    in: string[];
  };
};

export type Tags = {
  platform?: string;
  entityType?: string;
};

// A child Rule names a parent in the same Rule Set and inherits its leading
// segments by reference. Segments are referenced by immutable `id`, never by
// the editable `key`, so relabelling a parent segment cannot break a child.
export type ParentLink = {
  ruleId: string;              // immutable id of a Rule in the SAME Rule Set
  inheritSegmentIds: string[]; // ids on the parent's RESOLVED segments, in parent order
};

export type Rule = {
  id: string;
  key: string;
  name: string;
  tags?: Tags;
  delimiter: string;
  segments: Segment[]; // the Rule's OWN segments only; see resolveRule
  source: Source;
  parent?: ParentLink;
};

export type RuleSet = {
  id: string;
  name: string;
  rules: Rule[];
};

export type Violation = {
  segmentKey: string;
  token: string;
  reason: string;
  suggestion?: string;
};

export type ComposeResult = {
  name: string;
  errors: string[];
};

export type ValidateResult = {
  valid: boolean;
  violations: Violation[];
};

export type ResolveResult = {
  rule: Rule;
  errors: string[];
};

// One Rule's scan totals, however the names were obtained (CSV rows now,
// a BigQuery scan in Stage 2). Raw counts only: the UI decides how to round.
export type RuleScan = {
  ruleId: string;
  ruleKey: string;
  ruleName: string;
  tags?: Tags;
  scanned: number;
  valid: number;
};

export type Counts = {
  scanned: number;
  valid: number;
  invalid: number;
};

export type Rollup = {
  total: Counts;
  perRule: (RuleScan & Counts)[];
  byPlatform: Record<string, Counts>;
  byEntityType: Record<string, Counts>;
};

export const UNTAGGED = "untagged";

const NAME_VIOLATION_KEY = "__name__";

// An entry whose label is its code: the shape a flat value list migrates to,
// and what the Author editor writes until labels get their own control.
export function entryFromCode(code: string): EnumEntry {
  return { label: code, code };
}

export function entriesFromCodes(codes: string[]): EnumEntry[] {
  return codes.map(entryFromCode);
}

function getRuleErrors(rule: Rule): string[] {
  const errors: string[] = [];

  if (!rule.delimiter) {
    errors.push("Choose a delimiter before adding segments.");
  }

  const delimiterCount = [...rule.delimiter].length;
  if (delimiterCount > 1) {
    errors.push("The delimiter must be a single character.");
  }

  let optionalSeen = false;
  const keys = new Set<string>();
  for (const segment of rule.segments) {
    if (keys.has(segment.key)) {
      errors.push(`Segment keys must be unique: "${segment.key}".`);
    }
    keys.add(segment.key);

    if (!segment.required) {
      optionalSeen = true;
    } else if (optionalSeen) {
      errors.push("Optional segments must appear at the end of a rule.");
    }
  }

  return errors;
}

// Everything an author must get right before a Rule can be saved. A superset
// of the structural checks compose() and validate() apply. The authoring UI
// calls this and keeps no checks of its own.
export function checkRule(rule: Rule): string[] {
  const errors: string[] = [];

  if (!rule.key.trim() || !rule.name.trim()) {
    errors.push("The rule needs a key and a name.");
  }

  errors.push(...getRuleErrors(rule));

  if (rule.segments.length === 0) {
    errors.push("The rule needs at least one segment.");
  }

  rule.segments.forEach((segment, index) => {
    const label = segment.label.trim() || `Segment ${index + 1}`;

    if (!segment.key.trim() || !segment.label.trim()) {
      errors.push(`${label} needs a key and a label.`);
    }

    if (segment.kind === "enum") {
      if (segment.allowedValues.length === 0) {
        errors.push(`${label} needs at least one allowed value.`);
      }
      if (segment.allowedValues.some((entry) => !entry.code.trim() || !entry.label.trim())) {
        errors.push(`${label} has an allowed value without a code or a label.`);
      }
      if (rule.delimiter && segment.allowedValues.some((entry) => entry.code.includes(rule.delimiter))) {
        errors.push(`${label} has an allowed value containing the "${rule.delimiter}" delimiter.`);
      }
      const codes = new Set<string>();
      const labels = new Set<string>();
      for (const entry of segment.allowedValues) {
        if (codes.has(entry.code)) {
          errors.push(`${label} has the code "${entry.code}" more than once.`);
        }
        if (labels.has(entry.label)) {
          errors.push(`${label} has the label "${entry.label}" more than once.`);
        }
        codes.add(entry.code);
        labels.add(entry.label);
      }
    } else if (segment.maxLength < 1) {
      errors.push(`${label} needs a maximum length of at least 1.`);
    }
  });

  if (!rule.source.dataset.trim() || !rule.source.table.trim() || !rule.source.nameColumn.trim()) {
    errors.push("The source needs a dataset, table, and name column.");
  }

  return errors;
}

// Rule Set level checks, with each Rule's errors prefixed by its position.
export function checkRuleSet(ruleSet: RuleSet): string[] {
  const errors: string[] = [];

  if (!ruleSet.name.trim()) {
    errors.push("Give this Rule Set a name.");
  }

  ruleSet.rules.forEach((rule, index) => {
    for (const error of checkRule(rule)) {
      errors.push(`Rule ${index + 1}: ${error}`);
    }
  });

  return errors;
}

function copySegment(segment: Segment): Segment {
  if (segment.kind === "enum") {
    return { ...segment, allowedValues: segment.allowedValues.map((entry) => ({ ...entry })) };
  }
  return { ...segment, illegalChars: [...segment.illegalChars] };
}

// Flattens a child Rule into a self-contained one: the inherited parent
// segments followed by the child's own, with `parent` removed. Pure and cheap;
// callers resolve on demand and never store the result. A grandchild resolves
// its parent first, so it can inherit segments the parent itself inherited.
//
// On any error the INPUT Rule comes back unchanged, parent still set, so a
// caller that ignores `errors` is refused by the compose/validate guard rather
// than validating names against the wrong segments.
export function resolveRule(rule: Rule, ruleSet: RuleSet): ResolveResult {
  return resolveWithin(rule, ruleSet, new Set());
}

function resolveWithin(rule: Rule, ruleSet: RuleSet, visited: Set<string>): ResolveResult {
  if (!rule.parent) {
    return { rule: { ...rule, segments: rule.segments.map(copySegment) }, errors: [] };
  }

  const fail = (...errors: string[]): ResolveResult => ({ rule, errors });
  const { ruleId, inheritSegmentIds } = rule.parent;

  const parent = ruleSet.rules.find((candidate) => candidate.id === ruleId);
  if (!parent) {
    return fail("The parent Rule no longer exists in this Rule Set.");
  }

  visited.add(rule.id);
  if (visited.has(parent.id)) {
    return fail(`Parent Rules form a cycle through "${parent.name}".`);
  }

  const resolvedParent = resolveWithin(parent, ruleSet, visited);
  if (resolvedParent.errors.length > 0) {
    return fail(
      ...resolvedParent.errors.map((error) => `Parent "${parent.name}" cannot be resolved: ${error}`),
    );
  }

  const parentSegments = resolvedParent.rule.segments;
  const errors: string[] = [];

  const missing = inheritSegmentIds.filter(
    (id) => !parentSegments.some((segment) => segment.id === id),
  );
  for (const id of missing) {
    errors.push(`Inherited segment "${id}" does not exist on parent "${parent.name}".`);
  }

  const leading = parentSegments.slice(0, inheritSegmentIds.length);
  const isLeadingRun =
    missing.length === 0 &&
    inheritSegmentIds.every((id, index) => leading[index]?.id === id);
  if (missing.length === 0 && !isLeadingRun) {
    const expected = leading.map((segment) => `"${segment.key}"`).join(", ");
    errors.push(
      `Inherited segments must be the first ${inheritSegmentIds.length} segments of parent "${parent.name}" in order: ${expected}.`,
    );
  }

  for (const segment of leading) {
    if (isLeadingRun && !segment.required) {
      errors.push(
        `Inherited segment "${segment.label}" is optional; only required parent segments can be inherited.`,
      );
    }
  }

  if (rule.delimiter !== resolvedParent.rule.delimiter) {
    errors.push(
      `The delimiter "${rule.delimiter}" must match parent "${parent.name}", which uses "${resolvedParent.rule.delimiter}".`,
    );
  }

  if (errors.length > 0) {
    return fail(...errors);
  }

  const { parent: _parent, ...own } = rule;
  const combined: Rule = {
    ...own,
    segments: [...leading.map(copySegment), ...rule.segments.map(copySegment)],
  };

  const structural = getRuleErrors(combined);
  const ids = new Set<string>();
  for (const segment of combined.segments) {
    if (ids.has(segment.id)) {
      structural.push(`Segment ids must be unique: "${segment.id}".`);
    }
    ids.add(segment.id);
  }
  if (structural.length > 0) {
    return fail(...structural);
  }

  return { rule: combined, errors: [] };
}

function valueViolations(
  rule: Rule,
  segment: Segment,
  token: string,
): Violation[] {
  const violations: Violation[] = [];

  if (token.includes(rule.delimiter)) {
    violations.push({
      segmentKey: segment.key,
      token,
      reason: `Value cannot contain the "${rule.delimiter}" delimiter.`,
    });
  }

  if (segment.kind === "enum") {
    // Names carry codes, never labels.
    const codes = segment.allowedValues.map((entry) => entry.code);
    if (!codes.includes(token)) {
      const suggestion = findSuggestion(token, codes);
      violations.push({
        segmentKey: segment.key,
        token,
        reason: "Value is not in the allowed list.",
        ...(suggestion ? { suggestion } : {}),
      });
    }
  } else {
    if (token.length > segment.maxLength) {
      violations.push({
        segmentKey: segment.key,
        token,
        reason: `Value is longer than ${segment.maxLength} characters.`,
      });
    }

    const illegalCharacter = segment.illegalChars.find((character) =>
      token.includes(character),
    );
    if (illegalCharacter) {
      violations.push({
        segmentKey: segment.key,
        token,
        reason: `Value contains an illegal character: "${illegalCharacter}".`,
      });
    }
  }

  return violations;
}

function findSuggestion(token: string, allowedValues: string[]): string | undefined {
  if (!token || !allowedValues.length) {
    return undefined;
  }

  let bestValue: string | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const value of allowedValues) {
    const distance = levenshtein(token, value);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestValue = value;
    }
  }

  return bestValue && bestDistance <= Math.max(2, Math.floor(token.length / 2))
    ? `Did you mean "${bestValue}"?`
    : undefined;
}

function levenshtein(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = previous[0];
    previous[0] = leftIndex;

    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const above = previous[rightIndex];
      const cost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      previous[rightIndex] = Math.min(
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + 1,
        diagonal + cost,
      );
      diagonal = above;
    }
  }

  return previous[right.length];
}

export function parse(rule: Rule, name: string): string[] {
  if (!rule.delimiter) {
    return [name];
  }
  return name.split(rule.delimiter);
}

export function compose(
  rule: Rule,
  selections: Record<string, string>,
): ComposeResult {
  const errors = getRuleErrors(rule);
  const tokens: string[] = [];
  let optionalGap = false;

  for (const segment of rule.segments) {
    const value = selections[segment.key] ?? "";
    if (!value) {
      if (segment.required) {
        errors.push(`${segment.label} is required.`);
      } else {
        optionalGap = true;
      }
      continue;
    }

    if (optionalGap) {
      errors.push(`${segment.label} cannot be filled after an optional segment is empty.`);
    }

    tokens.push(value);
    errors.push(
      ...valueViolations(rule, segment, value).map(
        (violation) => `${segment.label}: ${violation.reason}`,
      ),
    );
  }

  return {
    name: tokens.join(rule.delimiter),
    errors,
  };
}

export function validate(rule: Rule, name: string): ValidateResult {
  const violations: Violation[] = getRuleErrors(rule).map((reason) => ({
    segmentKey: NAME_VIOLATION_KEY,
    token: name,
    reason,
  }));

  if (!name) {
    violations.push({
      segmentKey: NAME_VIOLATION_KEY,
      token: name,
      reason: "Name cannot be empty.",
    });
    return { valid: false, violations };
  }

  const tokens = parse(rule, name);
  const requiredCount = rule.segments.filter((segment) => segment.required).length;
  if (tokens.length < requiredCount || tokens.length > rule.segments.length) {
    violations.push({
      segmentKey: NAME_VIOLATION_KEY,
      token: name,
      reason: `Expected ${requiredCount} to ${rule.segments.length} segments, found ${tokens.length}.`,
    });
    return { valid: false, violations };
  }

  rule.segments.forEach((segment, index) => {
    const token = tokens[index];
    if (token === undefined) {
      return;
    }
    violations.push(...valueViolations(rule, segment, token));
  });

  return {
    valid: violations.length === 0,
    violations,
  };
}

function emptyCounts(): Counts {
  return { scanned: 0, valid: 0, invalid: 0 };
}

function addScan(counts: Counts, scan: RuleScan): void {
  counts.scanned += scan.scanned;
  counts.valid += scan.valid;
  counts.invalid += scan.scanned - scan.valid;
}

// Pools every Rule's counts into one Rule-Set-wide figure: total valid over
// total scanned across Rules. The CSV checker and the Stage 2 scan must both
// call this so "All Rules" always means the same thing.
export function rollup(scans: RuleScan[]): Rollup {
  const total = emptyCounts();
  const byPlatform: Record<string, Counts> = {};
  const byEntityType: Record<string, Counts> = {};
  const perRule: (RuleScan & Counts)[] = [];

  for (const scan of scans) {
    addScan(total, scan);

    const platform = scan.tags?.platform || UNTAGGED;
    byPlatform[platform] ??= emptyCounts();
    addScan(byPlatform[platform], scan);

    const entityType = scan.tags?.entityType || UNTAGGED;
    byEntityType[entityType] ??= emptyCounts();
    addScan(byEntityType[entityType], scan);

    perRule.push({
      ...scan,
      invalid: scan.scanned - scan.valid,
    });
  }

  return { total, perRule, byPlatform, byEntityType };
}