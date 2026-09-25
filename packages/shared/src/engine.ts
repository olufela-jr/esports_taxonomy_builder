// These types double as the Firestore document contract. Keep them plain.
// `id` is immutable identity (React keys, references); `key` is the editable slug.

// One allowed value of an enum segment: the label is what people see in a
// dropdown, the code is what the engine writes into the name and the checker
// matches (exact, case-sensitive). Codes and labels are unique within a list.
export type EnumEntry = {
  label: string;
  code: string;
};

// A shared definition in a tenant's repository (v3 D37): one named list of
// entries that any Rule in the tenant can reference, scoped to platforms
// (D38; an empty list means every platform). Stored at
// tenants/{tenantId}/definitions/{id}; the engine holds the shape so
// resolveRule and the scan Function can use it without Firestore.
export type Definition = {
  id: string;
  name: string;
  platforms: string[]; // PLATFORMS ids
  entries: EnumEntry[];
};

export type EnumSegment = {
  id: string;
  kind: "enum";
  key: string;
  label: string;
  required: boolean;
  // The segment's own list, or [] when the values come from a shared
  // definition. resolveRule fills allowedValues from the definition and
  // removes definitionId; compose and validate refuse a Rule that still
  // carries one (D25, D46).
  allowedValues: EnumEntry[];
  definitionId?: string;
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

// The product's fixed platform list (v3 O12). A Rule's `tags.platform`, a
// tenant's `config.platforms` and a definition's platform scope all use these
// ids, so the three can never disagree on spelling. `name` is for display.
export const PLATFORMS = [
  { id: "google", name: "Google Ads" },
  { id: "microsoft", name: "Microsoft Ads" },
  { id: "meta", name: "Meta" },
  { id: "tiktok", name: "TikTok" },
  { id: "linkedin", name: "LinkedIn" },
  { id: "pinterest", name: "Pinterest" },
  { id: "snapchat", name: "Snapchat" },
  { id: "dv360", name: "Display & Video 360" },
  { id: "amazon", name: "Amazon Ads" },
];

export function isPlatform(value: string): boolean {
  return PLATFORMS.some((platform) => platform.id === value);
}

export function platformName(id: string): string {
  return PLATFORMS.find((platform) => platform.id === id)?.name ?? id;
}

export type Tags = {
  platform?: string; // a PLATFORMS id; checkRule refuses anything else
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

// The one entry-list check (v3 O14), shared by a Rule's inline list and a
// shared definition: no blank code or label, no code twice (exact), no label
// twice ignoring case (D39). `subject` names the list in the message and
// `noun` is what its members are called there.
function entryErrors(entries: EnumEntry[], subject: string, noun: string): string[] {
  const errors: string[] = [];

  if (entries.some((entry) => !entry.code.trim() || !entry.label.trim())) {
    errors.push(`${subject} has an ${noun} without a code or a label.`);
  }

  const codes = new Set<string>();
  const labels = new Set<string>();
  for (const entry of entries) {
    if (codes.has(entry.code)) {
      errors.push(`${subject} has the code "${entry.code}" more than once.`);
    }
    const labelKey = entry.label.trim().toLowerCase();
    if (labels.has(labelKey)) {
      errors.push(`${subject} has the label "${entry.label}" more than once.`);
    }
    codes.add(entry.code);
    labels.add(labelKey);
  }

  return errors;
}

// Everything an admin must get right before a shared definition can be saved
// (v3 D37 to D39). An empty entry list is allowed: definitions fill up over
// time, and a Rule that references an empty one fails checkRule instead.
export function checkDefinition(definition: Definition): string[] {
  const errors: string[] = [];
  const subject = definition.name.trim() || "The definition";

  if (!definition.name.trim()) {
    errors.push("The definition needs a name.");
  }

  const seen = new Set<string>();
  for (const platform of definition.platforms) {
    if (!isPlatform(platform)) {
      errors.push(
        `Platform "${platform}" is not one of the known platforms: ${PLATFORMS.map((known) => known.id).join(", ")}.`,
      );
    }
    if (seen.has(platform)) {
      errors.push(`${subject} lists the platform "${platform}" more than once.`);
    }
    seen.add(platform);
  }

  errors.push(...entryErrors(definition.entries, subject, "entry"));

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

    if (segment.kind === "enum" && segment.definitionId) {
      // The values live in the shared definition; checkRuleSet and resolveRule
      // check that it exists, fits the platform and has no delimiter in a code.
      if (!segment.definitionId.trim()) {
        errors.push(`${label} points at a shared definition but names none.`);
      }
    } else if (segment.kind === "enum") {
      if (segment.allowedValues.length === 0) {
        errors.push(`${label} needs at least one allowed value.`);
      }
      if (rule.delimiter && segment.allowedValues.some((entry) => entry.code.includes(rule.delimiter))) {
        errors.push(`${label} has an allowed value containing the "${rule.delimiter}" delimiter.`);
      }
      errors.push(...entryErrors(segment.allowedValues, label, "allowed value"));
    } else if (segment.maxLength < 1) {
      errors.push(`${label} needs a maximum length of at least 1.`);
    }
  });

  if (rule.tags?.platform && !isPlatform(rule.tags.platform)) {
    errors.push(
      `Platform "${rule.tags.platform}" is not one of the known platforms: ${PLATFORMS.map((platform) => platform.id).join(", ")}.`,
    );
  }

  if (!rule.source.dataset.trim() || !rule.source.table.trim() || !rule.source.nameColumn.trim()) {
    errors.push("The source needs a dataset, table, and name column.");
  }

  return errors;
}

// Rule Set level checks, grouped: problems with the Rule Set itself, then each
// Rule's own checks and, once those pass, whatever stops it resolving (a broken
// parent link, a missing or ill-fitting shared definition). Keyed by the Rule's
// immutable id so an editor can list them beside the Rule. Pass the tenant's
// definitions; a Rule that references one that is not in the list is an error.
export type RuleSetIssues = {
  ruleSet: string[];
  rules: Record<string, string[]>;
};

export function checkRuleSetIssues(ruleSet: RuleSet, definitions: Definition[] = []): RuleSetIssues {
  const issues: RuleSetIssues = { ruleSet: [], rules: {} };

  if (!ruleSet.name.trim()) {
    issues.ruleSet.push("Give this Rule Set a name.");
  }

  for (const rule of ruleSet.rules) {
    const own = checkRule(rule);
    const errors = own.length > 0 ? own : resolveRule(rule, ruleSet, definitions).errors;
    if (errors.length > 0) {
      issues.rules[rule.id] = errors;
    }
  }

  return issues;
}

// The same, as one flat list with each Rule's errors prefixed by its position.
export function checkRuleSet(ruleSet: RuleSet, definitions: Definition[] = []): string[] {
  const issues = checkRuleSetIssues(ruleSet, definitions);
  const errors = [...issues.ruleSet];
  ruleSet.rules.forEach((rule, index) => {
    for (const error of issues.rules[rule.id] ?? []) {
      errors.push(`Rule ${index + 1}: ${error}`);
    }
  });
  return errors;
}

// The Rules in a Rule Set that would break if a Rule, or one of its segments,
// were deleted: children whose parent link names the Rule, or whose inherited
// segment ids include the segment. Powers Author's delete protection.
// Relabelling stays safe because links hold ids, never keys.
export type Dependent = {
  ruleId: string;
  ruleName: string;
};

export function dependentsOf(ruleSet: RuleSet, ruleId: string, segmentId?: string): Dependent[] {
  return ruleSet.rules
    .filter((rule) => rule.parent && rule.id !== ruleId && (segmentId ? rule.parent.inheritSegmentIds.includes(segmentId) : rule.parent.ruleId === ruleId))
    .map((rule) => ({ ruleId: rule.id, ruleName: rule.name }));
}

// Every Rule whose segments take their values from the definition, for the
// Dictionary's delete protection: a definition in use cannot be removed.
export type DefinitionDependent = {
  ruleSetId: string;
  ruleSetName: string;
  ruleId: string;
  ruleName: string;
  segmentLabel: string;
};

export function definitionDependents(ruleSets: RuleSet[], definitionId: string): DefinitionDependent[] {
  const dependents: DefinitionDependent[] = [];
  for (const ruleSet of ruleSets) {
    for (const rule of ruleSet.rules) {
      for (const segment of rule.segments) {
        if (segment.kind === "enum" && segment.definitionId === definitionId) {
          dependents.push({ ruleSetId: ruleSet.id, ruleSetName: ruleSet.name, ruleId: rule.id, ruleName: rule.name, segmentLabel: segment.label });
        }
      }
    }
  }
  return dependents;
}

function copySegment(segment: Segment): Segment {
  if (segment.kind === "enum") {
    return { ...segment, allowedValues: segment.allowedValues.map((entry) => ({ ...entry })) };
  }
  return { ...segment, illegalChars: [...segment.illegalChars] };
}

// Fills a Rule's definition-backed segments from the tenant's definitions
// (D46): the segment gets the definition's entries as its allowedValues and
// loses its definitionId. Errors when the definition is missing, empty, scoped
// to platforms the Rule is not on (O13), or has a code containing the delimiter.
function substituteDefinitions(rule: Rule, definitions: Definition[]): { segments: Segment[]; errors: string[] } {
  const errors: string[] = [];
  const segments = rule.segments.map((segment): Segment => {
    if (segment.kind !== "enum" || !segment.definitionId) {
      return copySegment(segment);
    }
    const definition = definitions.find((candidate) => candidate.id === segment.definitionId);
    if (!definition) {
      errors.push(`${segment.label} uses a shared definition that no longer exists.`);
      return copySegment(segment);
    }
    if (definition.platforms.length > 0) {
      const platform = rule.tags?.platform;
      if (!platform) {
        errors.push(`${segment.label} uses "${definition.name}", which is scoped to ${definition.platforms.map(platformName).join(", ")}; give this Rule a platform.`);
      } else if (!definition.platforms.includes(platform)) {
        errors.push(`${segment.label} uses "${definition.name}", which is not available on ${platformName(platform)}.`);
      }
    }
    if (definition.entries.length === 0) {
      errors.push(`${segment.label} uses "${definition.name}", which has no values yet.`);
    }
    const clash = definition.entries.find((entry) => rule.delimiter && entry.code.includes(rule.delimiter));
    if (clash) {
      errors.push(`${segment.label} uses "${definition.name}", whose code "${clash.code}" contains the "${rule.delimiter}" delimiter.`);
    }
    const { definitionId: _definitionId, ...own } = segment;
    return { ...own, allowedValues: definition.entries.map((entry) => ({ ...entry })) };
  });
  return { segments, errors };
}

// Flattens a Rule into a self-contained one: the inherited parent segments
// followed by the Rule's own, every definition-backed segment filled from the
// tenant's definitions, with `parent` and every `definitionId` removed (D46).
// Pure and cheap; callers resolve on demand and never store the result. A
// grandchild resolves its parent first, so it can inherit segments the parent
// itself inherited.
//
// On any error the INPUT Rule comes back unchanged, so a caller that ignores
// `errors` is refused by the compose/validate guard rather than validating
// names against the wrong segments.
export function resolveRule(rule: Rule, ruleSet: RuleSet, definitions: Definition[] = []): ResolveResult {
  return resolveWithin(rule, ruleSet, definitions, new Set());
}

function resolveWithin(rule: Rule, ruleSet: RuleSet, definitions: Definition[], visited: Set<string>): ResolveResult {
  const fail = (...errors: string[]): ResolveResult => ({ rule, errors });

  if (!rule.parent) {
    const filled = substituteDefinitions(rule, definitions);
    if (filled.errors.length > 0) {
      return fail(...filled.errors);
    }
    return { rule: { ...rule, segments: filled.segments }, errors: [] };
  }

  const { ruleId, inheritSegmentIds } = rule.parent;

  const parent = ruleSet.rules.find((candidate) => candidate.id === ruleId);
  if (!parent) {
    return fail("The parent Rule no longer exists in this Rule Set.");
  }

  visited.add(rule.id);
  if (visited.has(parent.id)) {
    return fail(`Parent Rules form a cycle through "${parent.name}".`);
  }

  const resolvedParent = resolveWithin(parent, ruleSet, definitions, visited);
  if (resolvedParent.errors.length > 0) {
    return fail(
      ...resolvedParent.errors.map((error) => `Parent "${parent.name}" cannot be resolved: ${error}`),
    );
  }

  const parentSegments = resolvedParent.rule.segments;
  const errors: string[] = [];

  // D47: a child and its parent are on the same platform, both set or both
  // unset, so an inherited segment can never come from a definition scoped to
  // a platform the child is not on.
  const ownPlatform = rule.tags?.platform ?? "";
  const parentPlatform = parent.tags?.platform ?? "";
  if (ownPlatform !== parentPlatform) {
    errors.push(
      `The platform must match parent "${parent.name}" (${parentPlatform ? platformName(parentPlatform) : "no platform"}); this Rule has ${ownPlatform ? platformName(ownPlatform) : "no platform"}.`,
    );
  }

  const filled = substituteDefinitions(rule, definitions);
  errors.push(...filled.errors);

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
    segments: [...leading.map(copySegment), ...filled.segments],
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

function splitName(rule: Rule, name: string): string[] {
  if (!rule.delimiter) {
    return [name];
  }
  return name.split(rule.delimiter);
}

// A valid name read back into selections keyed by segment key, each holding
// the code found at that position; an optional segment left out of the name
// is left out of the selections. An invalid name yields no selections and the
// same violations validate reports. Used by the Build parent step: the parent
// name's selections pre-fill the child's inherited controls.
export type ParseResult = {
  valid: boolean;
  violations: Violation[];
  selections: Record<string, string>;
};

export function parse(rule: Rule, name: string): ParseResult {
  const checked = validate(rule, name);
  if (!checked.valid) {
    return { ...checked, selections: {} };
  }
  const tokens = splitName(rule, name);
  const selections: Record<string, string> = {};
  rule.segments.forEach((segment, index) => {
    if (tokens[index] !== undefined) {
      selections[segment.key] = tokens[index];
    }
  });
  return { valid: true, violations: [], selections };
}

// D25: compose and validate take resolved Rules only. A Rule that still has a
// parent link or a definition-backed segment would be judged against the wrong
// segments, so both refuse it with one plain error instead of failing every
// name. Never throws: the CSV checker calls validate per row with no catch.
export function unresolvedReason(rule: Rule): string | null {
  if (rule.parent) {
    return "This Rule inherits from a parent; resolve it with resolveRule before building or checking names.";
  }
  if (rule.segments.some((segment) => segment.kind === "enum" && segment.definitionId)) {
    return "This Rule uses shared definitions; resolve it with resolveRule before building or checking names.";
  }
  return null;
}

export function compose(
  rule: Rule,
  selections: Record<string, string>,
): ComposeResult {
  const unresolved = unresolvedReason(rule);
  if (unresolved) {
    return { name: "", errors: [unresolved] };
  }

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
  const unresolved = unresolvedReason(rule);
  if (unresolved) {
    return { valid: false, violations: [{ segmentKey: NAME_VIOLATION_KEY, token: name, reason: unresolved }] };
  }

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

  const tokens = splitName(rule, name);
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