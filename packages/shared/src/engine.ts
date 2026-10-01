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

// Where a UTM parameter's value comes from at build time (v2 D26, D27):
// the built name of this Rule or an ancestor, one of this Rule's resolved
// segments (its code), a tag on a Rule, or fixed text such as "cpc".
export type UtmSource =
  | { kind: "ruleName"; ruleId: string }
  | { kind: "segment"; segmentId: string }
  | { kind: "tag"; ruleId: string; tag: "platform" | "entityType" }
  | { kind: "literal"; value: string };

export type UtmParam = "source" | "medium" | "campaign" | "content" | "term";

export const UTM_PARAMS: UtmParam[] = ["source", "medium", "campaign", "content", "term"];

// One Rule's UTM mapping (D26: per Rule, explicit Rule ids). campaign must be
// a ruleName source so utm_campaign equals a built name byte for byte (D19).
export type UtmMapping = {
  source: UtmSource;
  medium: UtmSource;
  campaign: UtmSource;
  content?: UtmSource;
  term?: UtmSource;
  baseUrl?: string;
  baseUrlEditable: boolean;
  casePolicy: "asIs" | "lower";
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
  utm?: UtmMapping;
};

export type RuleSet = {
  id: string;
  name: string;
  rules: Rule[];
};

// The machine-readable cause of a violation. `reason` stays the human sentence;
// this is what the compliance board groups on, so rewording a sentence can never
// scatter one cause across two rows.
export type ViolationCode =
  | "unresolvedParent"
  | "unresolvedDefinition"
  | "noDelimiter"
  | "delimiterNotSingle"
  | "duplicateSegmentKey"
  | "optionalNotLast"
  | "emptyName"
  | "segmentCount"
  | "delimiterInValue"
  | "valueNotAllowed"
  | "valueTooLong"
  | "illegalCharacter"
  // Never emitted here: what the board calls a violation that reached it without
  // a code, from a scan service deployed before the codes existed.
  | "unclassified";

// The numbers and characters that otherwise live only inside the sentence. A flat
// bag of optional fields rather than a union keyed on `code`: plain TypeScript, and
// JSON-safe with keys left out rather than set to undefined.
export type ViolationDetail = {
  delimiter?: string;
  character?: string;
  maxLength?: number;
  length?: number;
  minSegments?: number;
  maxSegments?: number;
  foundSegments?: number;
  allowedCount?: number;
};

export type Violation = {
  code: ViolationCode;
  segmentKey: string;
  // The resolved segment's immutable id. An inherited segment keeps the parent's
  // id even when the child renamed the key, so this is what pools the same
  // segment across Rules. Absent on a whole-name violation.
  segmentId?: string;
  token: string;
  reason: string;
  suggestion?: string;
  detail?: ViolationDetail;
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

// The segmentKey a violation carries when it is about the whole name rather than
// one segment. Exported so nothing has to hardcode the literal.
export const NAME_VIOLATION_KEY = "__name__";

// Board order: the causes an author can act on first, whole-name problems next,
// rule configuration last.
export const VIOLATION_CODES: ViolationCode[] = [
  "valueNotAllowed",
  "valueTooLong",
  "illegalCharacter",
  "delimiterInValue",
  "segmentCount",
  "emptyName",
  "unresolvedParent",
  "unresolvedDefinition",
  "noDelimiter",
  "delimiterNotSingle",
  "duplicateSegmentKey",
  "optionalNotLast",
  "unclassified",
];

// One wording for a cause, in one place. The violation's own `reason` names the
// offending value; this names the cause a group of them share.
export function causeLabel(code: ViolationCode): string {
  switch (code) {
    case "valueNotAllowed":
      return "Value is not in the allowed list";
    case "valueTooLong":
      return "Value is too long";
    case "illegalCharacter":
      return "Value contains an illegal character";
    case "delimiterInValue":
      return "Value contains the delimiter";
    case "segmentCount":
      return "Wrong number of segments";
    case "emptyName":
      return "Name is empty";
    case "unresolvedParent":
      return "Rule was not resolved against its parent";
    case "unresolvedDefinition":
      return "Rule was not resolved against its definitions";
    case "noDelimiter":
      return "Rule has no delimiter";
    case "delimiterNotSingle":
      return "Rule delimiter is more than one character";
    case "duplicateSegmentKey":
      return "Rule repeats a segment key";
    case "optionalNotLast":
      return "Rule has an optional segment before a required one";
    case "unclassified":
      return "Unclassified";
  }
}

// An entry whose label is its code: the shape a flat value list migrates to,
// and what the Author editor writes until labels get their own control.
export function entryFromCode(code: string): EnumEntry {
  return { label: code, code };
}

export function entriesFromCodes(codes: string[]): EnumEntry[] {
  return codes.map(entryFromCode);
}

// A cause paired with its sentence. Callers that only report text map to
// `.reason`; validate() carries the code through onto the violation.
type CodedError = { code: ViolationCode; reason: string };

function getRuleErrors(rule: Rule): CodedError[] {
  const errors: CodedError[] = [];

  if (!rule.delimiter) {
    errors.push({ code: "noDelimiter", reason: "Choose a delimiter before adding segments." });
  }

  const delimiterCount = [...rule.delimiter].length;
  if (delimiterCount > 1) {
    errors.push({ code: "delimiterNotSingle", reason: "The delimiter must be a single character." });
  }

  let optionalSeen = false;
  const keys = new Set<string>();
  for (const segment of rule.segments) {
    if (keys.has(segment.key)) {
      errors.push({ code: "duplicateSegmentKey", reason: `Segment keys must be unique: "${segment.key}".` });
    }
    keys.add(segment.key);

    if (!segment.required) {
      optionalSeen = true;
    } else if (optionalSeen) {
      errors.push({ code: "optionalNotLast", reason: "Optional segments must appear at the end of a rule." });
    }
  }

  return errors;
}

function ruleErrorText(rule: Rule): string[] {
  return getRuleErrors(rule).map((error) => error.reason);
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

  errors.push(...ruleErrorText(rule));

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
    const resolution = own.length > 0 ? [] : resolveRule(rule, ruleSet, definitions).errors;
    const utm = own.length > 0 || resolution.length > 0 ? [] : checkUtmMapping(rule, ruleSet, definitions);
    const errors = [...own, ...resolution, ...utm];
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

  const structural = ruleErrorText(combined);
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
      code: "delimiterInValue",
      segmentKey: segment.key,
      segmentId: segment.id,
      token,
      reason: `Value cannot contain the "${rule.delimiter}" delimiter.`,
      detail: { delimiter: rule.delimiter },
    });
  }

  if (segment.kind === "enum") {
    // Names carry codes, never labels.
    const codes = segment.allowedValues.map((entry) => entry.code);
    if (!codes.includes(token)) {
      const suggestion = findSuggestion(token, codes);
      violations.push({
        code: "valueNotAllowed",
        segmentKey: segment.key,
        segmentId: segment.id,
        token,
        reason: "Value is not in the allowed list.",
        ...(suggestion ? { suggestion } : {}),
        detail: { allowedCount: codes.length },
      });
    }
  } else {
    if (token.length > segment.maxLength) {
      violations.push({
        code: "valueTooLong",
        segmentKey: segment.key,
        segmentId: segment.id,
        token,
        reason: `Value is longer than ${segment.maxLength} characters.`,
        detail: { maxLength: segment.maxLength, length: token.length },
      });
    }

    const illegalCharacter = segment.illegalChars.find((character) =>
      token.includes(character),
    );
    if (illegalCharacter) {
      violations.push({
        code: "illegalCharacter",
        segmentKey: segment.key,
        segmentId: segment.id,
        token,
        reason: `Value contains an illegal character: "${illegalCharacter}".`,
        detail: { character: illegalCharacter },
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
export function unresolvedViolation(rule: Rule): CodedError | null {
  if (rule.parent) {
    return {
      code: "unresolvedParent",
      reason: "This Rule inherits from a parent; resolve it with resolveRule before building or checking names.",
    };
  }
  if (rule.segments.some((segment) => segment.kind === "enum" && segment.definitionId)) {
    return {
      code: "unresolvedDefinition",
      reason: "This Rule uses shared definitions; resolve it with resolveRule before building or checking names.",
    };
  }
  return null;
}

export function unresolvedReason(rule: Rule): string | null {
  return unresolvedViolation(rule)?.reason ?? null;
}

export function compose(
  rule: Rule,
  selections: Record<string, string>,
): ComposeResult {
  const unresolved = unresolvedReason(rule);
  if (unresolved) {
    return { name: "", errors: [unresolved] };
  }

  const errors = ruleErrorText(rule);
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
  const unresolved = unresolvedViolation(rule);
  if (unresolved) {
    return {
      valid: false,
      violations: [{ code: unresolved.code, segmentKey: NAME_VIOLATION_KEY, token: name, reason: unresolved.reason }],
    };
  }

  const violations: Violation[] = getRuleErrors(rule).map((error) => ({
    code: error.code,
    segmentKey: NAME_VIOLATION_KEY,
    token: name,
    reason: error.reason,
  }));

  if (!name) {
    violations.push({
      code: "emptyName",
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
      code: "segmentCount",
      segmentKey: NAME_VIOLATION_KEY,
      token: name,
      reason: `Expected ${requiredCount} to ${rule.segments.length} segments, found ${tokens.length}.`,
      detail: {
        minSegments: requiredCount,
        maxSegments: rule.segments.length,
        foundSegments: tokens.length,
      },
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

// Resolve then validate in one call, for the callers that hold a Rule Set rather
// than a resolved Rule. A Rule that cannot be resolved fails every name with the
// resolution errors as the reason, never a silent mismatch against the wrong
// segments. A Rule with nothing to resolve falls through to validate, which
// reports its own structural problems with their own codes.
export function validateInRuleSet(
  rule: Rule,
  ruleSet: RuleSet,
  definitions: Definition[],
  name: string,
): ValidateResult {
  const resolved = resolveRule(rule, ruleSet, definitions);
  const unresolved = unresolvedViolation(rule);
  if (resolved.errors.length > 0 && unresolved) {
    return {
      valid: false,
      violations: resolved.errors.map((reason) => ({
        code: unresolved.code,
        segmentKey: NAME_VIOLATION_KEY,
        token: name,
        reason,
      })),
    };
  }
  return validate(resolved.rule, name);
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

// ---- compliance board -------------------------------------------------------------
//
// rollup answers "how many are valid". These answer "what is failing, and why",
// over the same names. The board never counts anything itself: the grouping,
// ranking and labelling all live here so the CSV source and the BigQuery scan
// can only ever agree.

// One name as the board sees it: what the CSV checker builds per row and what
// the scan returns per row.
export type NameAnnotation = {
  name: string;
  valid: boolean;
  violations: Violation[];
};

// One Rule's scan for the board. `scanned` and `valid` are exact over every
// name; `analysed` is the subset whose violations are available, which is
// smaller when something capped the annotated list.
export type RuleNameScan = {
  rule: Rule;
  scanned: number;
  valid: number;
  analysed: NameAnnotation[];
  // Why this Rule contributed no names at all: a missing CSV column, a scan
  // that failed. Not an engine cause, so it is never a ViolationCode.
  skipped?: string;
};

export type CauseCount = {
  code: ViolationCode;
  label: string;
  names: number;
  violations: number;
  sampleNames: string[];
};

export type SegmentCount = {
  segmentId: string;
  segmentKey: string;
  segmentLabel: string;
  names: number;
  violations: number;
  topCode: ViolationCode;
  sampleNames: string[];
};

export type ValueCount = {
  segmentId: string;
  segmentKey: string;
  value: string;
  code: ViolationCode;
  names: number;
  suggestion?: string;
  sampleNames: string[];
};

export type RuleCompliance = {
  ruleId: string;
  ruleKey: string;
  ruleName: string;
  tags?: Tags;
  scanned: number;
  valid: number;
  invalid: number;
  analysed: number;
  analysedInvalid: number;
  // The reasons below describe `analysed`, not `scanned`. When this is true
  // they are a sample and the board must say so.
  partial: boolean;
  skipped?: string;
  byCause: CauseCount[];
  bySegment: SegmentCount[];
  byValue: ValueCount[];
  valuesCapped: boolean;
  topCause?: ViolationCode;
};

export type ComplianceCoverage = {
  scanned: number;
  analysed: number;
  partial: boolean;
  partialRules: string[];
};

export type ComplianceBoard = {
  rollup: Rollup;
  perRule: RuleCompliance[];
  byCause: CauseCount[];
  bySegment: SegmentCount[];
  byValue: ValueCount[];
  valuesCapped: boolean;
  coverage: ComplianceCoverage;
};

export type ComplianceOptions = {
  sampleNames?: number;
  topValues?: number;
};

const SAMPLE_NAMES = 5;
const TOP_VALUES = 50;

// A violation that reached us without a code came from a scan service older
// than the codes. Bucket it honestly rather than guessing at its cause.
function codeOf(violation: Violation): ViolationCode {
  return violation.code ?? "unclassified";
}

function pushSample(samples: string[], name: string, cap: number): void {
  if (samples.length < cap && !samples.includes(name)) {
    samples.push(name);
  }
}

// Ranked by how many names carry the cause, with the fixed board order breaking
// ties so the same data always lists in the same order.
function byNamesThen<T extends { names: number }>(tiebreak: (item: T) => number) {
  return (left: T, right: T): number =>
    right.names - left.names || tiebreak(left) - tiebreak(right);
}

function causeRank(code: ViolationCode): number {
  const index = VIOLATION_CODES.indexOf(code);
  return index === -1 ? VIOLATION_CODES.length : index;
}

export function complianceOfRule(scan: RuleNameScan, options: ComplianceOptions = {}): RuleCompliance {
  const sampleCap = options.sampleNames ?? SAMPLE_NAMES;
  const valueCap = options.topValues ?? TOP_VALUES;

  const labels = new Map<string, string>();
  for (const segment of scan.rule.segments) {
    labels.set(segment.id, segment.label);
  }

  const causes = new Map<ViolationCode, CauseCount>();
  const segments = new Map<string, SegmentCount & { codes: Map<ViolationCode, number> }>();
  const values = new Map<string, ValueCount>();
  let analysedInvalid = 0;

  for (const annotation of scan.analysed) {
    if (annotation.valid) continue;
    analysedInvalid += 1;

    // A name counts once per group however many of its violations land there,
    // so "names" is always a count of names and "violations" of violations.
    const seenCauses = new Set<ViolationCode>();
    const seenSegments = new Set<string>();
    const seenValues = new Set<string>();

    for (const violation of annotation.violations) {
      const code = codeOf(violation);

      let cause = causes.get(code);
      if (!cause) {
        cause = { code, label: causeLabel(code), names: 0, violations: 0, sampleNames: [] };
        causes.set(code, cause);
      }
      cause.violations += 1;
      if (!seenCauses.has(code)) {
        seenCauses.add(code);
        cause.names += 1;
      }
      pushSample(cause.sampleNames, annotation.name, sampleCap);

      // An inherited segment keeps the parent's id, so keying on it is what
      // pools the same segment across Rules.
      const segmentId = violation.segmentId ?? "";
      const segmentGroup = segmentId || violation.segmentKey;
      let segment = segments.get(segmentGroup);
      if (!segment) {
        segment = {
          segmentId,
          segmentKey: violation.segmentKey,
          segmentLabel: labels.get(segmentId) ?? wholeNameLabel(violation.segmentKey),
          names: 0,
          violations: 0,
          topCode: code,
          sampleNames: [],
          codes: new Map(),
        };
        segments.set(segmentGroup, segment);
      }
      segment.violations += 1;
      segment.codes.set(code, (segment.codes.get(code) ?? 0) + 1);
      if (!seenSegments.has(segmentGroup)) {
        seenSegments.add(segmentGroup);
        segment.names += 1;
      }
      pushSample(segment.sampleNames, annotation.name, sampleCap);

      // Only a segment's own token is an offending value. A whole-name
      // violation's token is the entire name, which would rank as noise.
      if (!violation.segmentId) continue;
      const valueGroup = `${violation.segmentId} ${violation.token}`;
      let value = values.get(valueGroup);
      if (!value) {
        value = {
          segmentId: violation.segmentId,
          segmentKey: violation.segmentKey,
          value: violation.token,
          code,
          names: 0,
          ...(violation.suggestion ? { suggestion: violation.suggestion } : {}),
          sampleNames: [],
        };
        values.set(valueGroup, value);
      }
      if (!seenValues.has(valueGroup)) {
        seenValues.add(valueGroup);
        value.names += 1;
      }
      pushSample(value.sampleNames, annotation.name, sampleCap);
    }
  }

  const byCause = [...causes.values()].sort(byNamesThen((cause) => causeRank(cause.code)));
  const bySegment = [...segments.values()]
    .map(({ codes, ...segment }) => ({ ...segment, topCode: topCodeOf(codes) }))
    .sort(byNamesThen((segment) => causeRank(segment.topCode)));
  const ranked = [...values.values()].sort(byNamesThen((value) => causeRank(value.code)));

  return {
    ruleId: scan.rule.id,
    ruleKey: scan.rule.key,
    ruleName: scan.rule.name,
    ...(scan.rule.tags ? { tags: scan.rule.tags } : {}),
    scanned: scan.scanned,
    valid: scan.valid,
    invalid: scan.scanned - scan.valid,
    analysed: scan.analysed.length,
    analysedInvalid,
    partial: scan.analysed.length < scan.scanned,
    ...(scan.skipped ? { skipped: scan.skipped } : {}),
    byCause,
    bySegment,
    byValue: ranked.slice(0, valueCap),
    valuesCapped: ranked.length > valueCap,
    ...(byCause.length > 0 ? { topCause: byCause[0].code } : {}),
  };
}

function wholeNameLabel(segmentKey: string): string {
  return segmentKey === NAME_VIOLATION_KEY ? "Whole name" : segmentKey;
}

function topCodeOf(codes: Map<ViolationCode, number>): ViolationCode {
  let best: ViolationCode = "unclassified";
  let bestCount = -1;
  for (const [code, count] of codes) {
    if (count > bestCount || (count === bestCount && causeRank(code) < causeRank(best))) {
      best = code;
      bestCount = count;
    }
  }
  return best;
}

// Pools the per-Rule breakdowns into one Rule-Set-wide board. The valid/scanned
// side goes through rollup untouched, so the board and "All Rules" can never
// report different numbers for the same names.
export function complianceBoard(perRule: RuleCompliance[], options: ComplianceOptions = {}): ComplianceBoard {
  const sampleCap = options.sampleNames ?? SAMPLE_NAMES;
  const valueCap = options.topValues ?? TOP_VALUES;

  const scans: RuleScan[] = perRule.map((rule) => ({
    ruleId: rule.ruleId,
    ruleKey: rule.ruleKey,
    ruleName: rule.ruleName,
    ...(rule.tags ? { tags: rule.tags } : {}),
    scanned: rule.scanned,
    valid: rule.valid,
  }));

  const causes = new Map<ViolationCode, CauseCount>();
  const segments = new Map<string, SegmentCount & { codes: Map<ViolationCode, number> }>();
  const values = new Map<string, ValueCount>();

  for (const rule of perRule) {
    for (const cause of rule.byCause) {
      const merged = causes.get(cause.code) ?? { ...cause, names: 0, violations: 0, sampleNames: [] };
      merged.names += cause.names;
      merged.violations += cause.violations;
      for (const name of cause.sampleNames) pushSample(merged.sampleNames, name, sampleCap);
      causes.set(cause.code, merged);
    }

    for (const segment of rule.bySegment) {
      const group = segment.segmentId || segment.segmentKey;
      const merged = segments.get(group) ?? { ...segment, names: 0, violations: 0, sampleNames: [], codes: new Map() };
      merged.names += segment.names;
      merged.violations += segment.violations;
      merged.codes.set(segment.topCode, (merged.codes.get(segment.topCode) ?? 0) + segment.violations);
      for (const name of segment.sampleNames) pushSample(merged.sampleNames, name, sampleCap);
      segments.set(group, merged);
    }

    for (const value of rule.byValue) {
      const group = `${value.segmentId} ${value.value}`;
      const merged = values.get(group) ?? { ...value, names: 0, sampleNames: [] };
      merged.names += value.names;
      if (!merged.suggestion && value.suggestion) merged.suggestion = value.suggestion;
      for (const name of value.sampleNames) pushSample(merged.sampleNames, name, sampleCap);
      values.set(group, merged);
    }
  }

  const ranked = [...values.values()].sort(byNamesThen((value) => causeRank(value.code)));
  const partialRules = perRule.filter((rule) => rule.partial).map((rule) => rule.ruleName);

  return {
    rollup: rollup(scans),
    perRule,
    byCause: [...causes.values()].sort(byNamesThen((cause) => causeRank(cause.code))),
    bySegment: [...segments.values()]
      .map(({ codes, ...segment }) => ({ ...segment, topCode: topCodeOf(codes) }))
      .sort(byNamesThen((segment) => causeRank(segment.topCode))),
    byValue: ranked.slice(0, valueCap),
    valuesCapped: ranked.length > valueCap || perRule.some((rule) => rule.valuesCapped),
    coverage: {
      scanned: perRule.reduce((sum, rule) => sum + rule.scanned, 0),
      analysed: perRule.reduce((sum, rule) => sum + rule.analysed, 0),
      partial: partialRules.length > 0,
      partialRules,
    },
  };
}

// ---- UTM tracking URLs (v2 D19, D23, D30) -----------------------------------------

// RFC 3986 unreserved characters: a value made of these is never percent-
// encoded, so what lands in the URL is byte for byte what was built.
const UNRESERVED = /^[A-Za-z0-9._~-]+$/;

// The value rules of D30 for one parameter: non-empty, unreserved characters
// only, and under the "lower" policy no uppercase letter. Never transforms.
export function validateUtmValue(param: UtmParam, value: string, policy: UtmMapping["casePolicy"]): string[] {
  const errors: string[] = [];
  const name = `utm_${param}`;
  if (!value) {
    errors.push(`${name} is empty.`);
    return errors;
  }
  if (!UNRESERVED.test(value)) {
    const bad = [...new Set([...value].filter((character) => !/[A-Za-z0-9._~-]/.test(character)))];
    errors.push(`${name} contains ${bad.map((character) => `"${character}"`).join(", ")}; only letters, digits, "-", ".", "_" and "~" are allowed.`);
  }
  if (policy === "lower" && /[A-Z]/.test(value)) {
    errors.push(`${name} must be lowercase under this mapping's case policy.`);
  }
  return errors;
}

// The Rule and every ancestor above it, nearest first. Stops on a broken link.
export function ancestorsOf(rule: Rule, ruleSet: RuleSet): Rule[] {
  const chain: Rule[] = [];
  const visited = new Set<string>([rule.id]);
  let current = rule;
  while (current.parent) {
    const parent = ruleSet.rules.find((candidate) => candidate.id === current.parent?.ruleId);
    if (!parent || visited.has(parent.id)) break;
    chain.push(parent);
    visited.add(parent.id);
    current = parent;
  }
  return chain;
}

// Authoring-time checks on a Rule's UTM mapping, run by checkRuleSet: the
// required parameters, every ruleName source names this Rule or an ancestor,
// every segment source exists on the resolved Rule, campaign is a ruleName,
// literals pass the value rules, and (the D30 amendment) the delimiter and
// every enum code of each Rule a mapping reads a name from can actually be
// emitted under the mapping's character set and case policy.
export function checkUtmMapping(rule: Rule, ruleSet: RuleSet, definitions: Definition[] = []): string[] {
  const mapping = rule.utm;
  if (!mapping) return [];
  const errors: string[] = [];
  const allowedRuleIds = new Set([rule.id, ...ancestorsOf(rule, ruleSet).map((ancestor) => ancestor.id)]);
  const resolved = resolveRule(rule, ruleSet, definitions);
  const segments = resolved.errors.length === 0 ? resolved.rule.segments : [];

  for (const param of ["source", "medium", "campaign"] as UtmParam[]) {
    if (!mapping[param]) errors.push(`utm_${param} needs a source.`);
  }
  if (mapping.campaign && mapping.campaign.kind !== "ruleName") {
    errors.push("utm_campaign must come from a Rule's built name.");
  }

  const namedRules = new Set<string>();
  for (const param of UTM_PARAMS) {
    const source = mapping[param];
    if (!source) continue;
    if (source.kind === "ruleName" || source.kind === "tag") {
      if (!allowedRuleIds.has(source.ruleId)) {
        errors.push(`utm_${param} names a Rule that is not this Rule or one of its parents.`);
      } else if (source.kind === "ruleName") {
        namedRules.add(source.ruleId);
      }
    }
    if (source.kind === "segment" && resolved.errors.length === 0 && !segments.some((segment) => segment.id === source.segmentId)) {
      errors.push(`utm_${param} names a segment that is not on this Rule.`);
    }
    if (source.kind === "literal") {
      errors.push(...validateUtmValue(param, source.value, mapping.casePolicy));
    }
  }

  if (mapping.baseUrl) {
    errors.push(...checkBaseUrl(mapping.baseUrl));
  }

  // Names that will feed a value must be emittable: check each named Rule's
  // delimiter and codes, and this Rule's segment codes, under the policy.
  const reportedSegments = new Set<string>();
  for (const ruleId of namedRules) {
    const named = ruleSet.rules.find((candidate) => candidate.id === ruleId);
    if (!named) continue;
    const namedResolved = resolveRule(named, ruleSet, definitions);
    if (namedResolved.errors.length > 0) continue;
    if (named.delimiter && !UNRESERVED.test(named.delimiter)) {
      errors.push(`The delimiter "${named.delimiter}" of "${named.name}" cannot appear in a tracking URL value.`);
    }
    for (const segment of namedResolved.rule.segments) {
      // An inherited segment is reported once, under the Rule it belongs to.
      if (segment.kind !== "enum" || reportedSegments.has(segment.id)) continue;
      reportedSegments.add(segment.id);
      const bad = segment.allowedValues.find((entry) => validateUtmValue("campaign", entry.code, mapping.casePolicy).length > 0);
      if (bad) {
        errors.push(`"${named.name}" has the code "${bad.code}" (${segment.label}), which cannot appear in a tracking URL value under this mapping.`);
      }
    }
  }

  return errors;
}

// A base URL the mapping or the builder supplies: absolute http(s), with no
// utm_ parameters of its own. Build checks a typed one before generating.
export function checkBaseUrl(baseUrl: string): string[] {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    return ["The base URL must be an absolute http or https URL."];
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return ["The base URL must be an absolute http or https URL."];
  }
  const existing = [...parsed.searchParams.keys()].filter((key) => key.startsWith("utm_"));
  if (existing.length > 0) {
    return [`The base URL already carries ${existing.join(", ")}; remove them so the mapping can set them.`];
  }
  return [];
}

// What the builder knows at build time: the built names of this Rule and its
// ancestors keyed by Rule id, the selections (codes) of the resolved Rule, and
// the base URL in use (the mapping's default unless the user edited it).
export type UtmContext = {
  names: Record<string, string>;
  selections: Record<string, string>;
  baseUrl?: string;
};

export type UtmValue = {
  param: UtmParam;
  value: string;
  errors: string[];
};

export type TrackingUrlResult = {
  url: string | null;
  values: UtmValue[];
  errors: string[];
};

function resolveSource(source: UtmSource, rule: Rule, ruleSet: RuleSet, context: UtmContext): { value: string; error?: string } {
  switch (source.kind) {
    case "literal":
      return { value: source.value };
    case "ruleName": {
      const named = ruleSet.rules.find((candidate) => candidate.id === source.ruleId);
      const value = context.names[source.ruleId];
      if (value === undefined) {
        return { value: "", error: `needs the built name of ${named ? `"${named.name}"` : "a Rule that no longer exists"}.` };
      }
      return { value };
    }
    case "segment": {
      const segment = rule.segments.find((candidate) => candidate.id === source.segmentId);
      if (!segment) return { value: "", error: "names a segment that is not on this Rule." };
      return { value: context.selections[segment.key] ?? "" };
    }
    case "tag": {
      const tagged = ruleSet.rules.find((candidate) => candidate.id === source.ruleId);
      return { value: tagged?.tags?.[source.tag] ?? "" };
    }
  }
}

// Produces the UTM values and the full tracking URL for a resolved Rule with
// a mapping (D19). Every value is validated and never transformed: a value
// that breaks the policy is an error, so utm_campaign always equals the built
// campaign name exactly. A missing optional parameter is omitted, never sent
// blank. The base URL keeps its own query and fragment.
export function buildTrackingUrl(rule: Rule, ruleSet: RuleSet, context: UtmContext): TrackingUrlResult {
  const mapping = rule.utm;
  if (!mapping) return { url: null, values: [], errors: ["This Rule has no UTM mapping."] };
  const unresolved = unresolvedReason(rule);
  if (unresolved) return { url: null, values: [], errors: [unresolved] };

  const values: UtmValue[] = [];
  const errors: string[] = [];
  for (const param of UTM_PARAMS) {
    const source = mapping[param];
    const required = param === "source" || param === "medium" || param === "campaign";
    if (!source) {
      if (required) errors.push(`utm_${param} needs a source.`);
      continue;
    }
    const resolvedSource = resolveSource(source, rule, ruleSet, context);
    if (resolvedSource.error) {
      values.push({ param, value: "", errors: [`utm_${param} ${resolvedSource.error}`] });
      continue;
    }
    if (!resolvedSource.value && !required) continue;
    values.push({ param, value: resolvedSource.value, errors: validateUtmValue(param, resolvedSource.value, mapping.casePolicy) });
  }

  const baseUrl = context.baseUrl ?? mapping.baseUrl ?? "";
  if (!baseUrl) {
    errors.push("A base URL is needed.");
  } else {
    errors.push(...checkBaseUrl(baseUrl));
  }

  const valueErrors = values.some((value) => value.errors.length > 0);
  if (errors.length > 0 || valueErrors) {
    return { url: null, values, errors };
  }

  const url = new URL(baseUrl);
  for (const value of values) {
    url.searchParams.set(`utm_${value.param}`, value.value);
  }
  return { url: url.toString(), values, errors: [] };
}
// ---- Batch build (v2 D32, D33 as amended at G0) --------------------------------------

// What a batch uses per segment, keyed by segment key: the codes to combine
// (labels are display only, D40). For an optional segment "" means "omit";
// an omitted optional implies every later optional is omitted in that row.
export type BatchChoices = Record<string, string[]>;

export type BatchRow = {
  selections: Record<string, string>;
  name: string;
};

// Everything wrong with a batch before a single row is generated: an
// unresolved Rule, a required segment with no values, or a value its segment
// would refuse (so one bad freeform line fails here, not on row 40,000).
export function checkBatchChoices(rule: Rule, choices: BatchChoices): string[] {
  const unresolved = unresolvedReason(rule);
  if (unresolved) return [unresolved];
  const errors: string[] = ruleErrorText(rule);
  for (const segment of rule.segments) {
    const values = choices[segment.key] ?? [];
    const filled = values.filter((value) => value !== "");
    if (segment.required && filled.length === 0) {
      errors.push(`${segment.label} needs at least one value.`);
    }
    if (!segment.required && values.length === 0) {
      errors.push(`${segment.label} needs at least one value, or "" to omit it.`);
    }
    if (new Set(values).size !== values.length) {
      errors.push(`${segment.label} lists a value more than once.`);
    }
    if (segment.required && values.includes("")) {
      errors.push(`${segment.label} is required and cannot be omitted.`);
    }
    for (const value of filled) {
      for (const violation of valueViolations(rule, segment, value)) {
        errors.push(`${segment.label}: "${value}": ${violation.reason}`);
      }
    }
  }
  return errors;
}

function assertBatch(rule: Rule, choices: BatchChoices): void {
  const errors = checkBatchChoices(rule, choices);
  if (errors.length > 0) {
    throw new Error(errors.join(" "));
  }
}

// The number of rows enumerate will yield, in time linear in the segments:
// a required segment multiplies by its values; an optional one adds the
// "omitted here" branch (one row shape, if "" is among its choices) to its
// filled values times whatever follows.
export function countCombinations(rule: Rule, choices: BatchChoices): number {
  assertBatch(rule, choices);
  return countFrom(rule, choices, 0);
}

function countFrom(rule: Rule, choices: BatchChoices, index: number): number {
  if (index >= rule.segments.length) return 1;
  const segment = rule.segments[index];
  const values = choices[segment.key] ?? [];
  const filled = values.filter((value) => value !== "").length;
  const rest = countFrom(rule, choices, index + 1);
  if (segment.required) return filled * rest;
  const omitted = values.includes("") ? 1 : 0;
  return omitted + filled * rest;
}

// Every combination in a fixed order (first segment slowest), one row at a
// time, each produced by compose so each passes validate. The caller keeps as
// many rows as it wants; the generator holds one.
export function* enumerate(rule: Rule, choices: BatchChoices): Generator<BatchRow> {
  assertBatch(rule, choices);
  yield* walk(rule, choices, 0, {});
}

function* walk(rule: Rule, choices: BatchChoices, index: number, selections: Record<string, string>): Generator<BatchRow> {
  if (index >= rule.segments.length) {
    yield { selections, name: compose(rule, selections).name };
    return;
  }
  const segment = rule.segments[index];
  for (const value of choices[segment.key] ?? []) {
    if (value === "") {
      // Omitting an optional segment ends the row here: later optionals are omitted too.
      yield { selections, name: compose(rule, selections).name };
      continue;
    }
    yield* walk(rule, choices, index + 1, { ...selections, [segment.key]: value });
  }
}

// ---- Child batch across parents (D34, docs/features/d34-child-batch.md) -----------------

export type ParentLine = {
  name: string;                       // parent name as pasted or carried
  ancestors?: Record<string, string>; // ruleId -> name, only when a UTM mapping needs it
};

export type ParentBatchInput = {
  parents: ParentLine[];
  choices: BatchChoices;                 // child's own segments, shared by every parent
  narrow?: Record<string, BatchChoices>; // parent name -> subsets of choices
};

export type ParentBatchRow = {
  parentName: string;
  selections: Record<string, string>;
  name: string;
};

// Every parent line validated against the parent Rule, in input order; a
// duplicate name is checked once (rule 4).
export function checkParents(parentRule: Rule, lines: ParentLine[]): { name: string; result: ValidateResult }[] {
  const seen = new Set<string>();
  const checked: { name: string; result: ValidateResult }[] = [];
  for (const line of lines) {
    if (seen.has(line.name)) continue;
    seen.add(line.name);
    checked.push({ name: line.name, result: validate(parentRule, line.name) });
  }
  return checked;
}

// The parent lines collapsed to one per name (rule 4), or a throw naming every
// failing parent (rule 5) and every line missing an ancestor name the child's
// mapping reads (rule 6).
function acceptedParents(child: Rule, parentRule: Rule, input: ParentBatchInput): ParentLine[] {
  for (const rule of [child, parentRule]) {
    const unresolved = unresolvedReason(rule);
    if (unresolved) throw new Error(unresolved);
  }
  const unique: ParentLine[] = [];
  const seen = new Set<string>();
  for (const line of input.parents) {
    if (seen.has(line.name)) continue;
    seen.add(line.name);
    unique.push(line);
  }
  const failing = checkParents(parentRule, unique).filter((entry) => !entry.result.valid).map((entry) => entry.name);
  if (failing.length > 0) {
    throw new Error(`Invalid parent name${failing.length > 1 ? "s" : ""}: ${failing.map((name) => `"${name}"`).join(", ")}.`);
  }
  // Ancestor names the mapping needs beyond the parent itself.
  const needed = new Set<string>();
  if (child.utm) {
    for (const param of UTM_PARAMS) {
      const source = child.utm[param];
      if (source && source.kind === "ruleName" && source.ruleId !== child.id && source.ruleId !== parentRule.id) {
        needed.add(source.ruleId);
      }
    }
  }
  if (needed.size > 0) {
    const missing = unique.filter((line) => [...needed].some((ruleId) => !line.ancestors?.[ruleId])).map((line) => line.name);
    if (missing.length > 0) {
      throw new Error(`Parent line${missing.length > 1 ? "s" : ""} missing an ancestor name the tracking URL needs: ${missing.map((name) => `"${name}"`).join(", ")}.`);
    }
  }
  return unique;
}

// The child's choices for one parent: inherited segments pinned to the
// parent's parsed codes as single-item lists, the rest intersected with the
// parent's narrow entry (rule 2). A narrow value absent from choices throws
// (rule 3).
function choicesUnder(child: Rule, parentRule: Rule, input: ParentBatchInput, line: ParentLine): BatchChoices {
  const parsed = parse(parentRule, line.name);
  const narrow = input.narrow?.[line.name];
  const choices: BatchChoices = {};
  for (const segment of child.segments) {
    const inherited = parsed.selections[segment.key];
    if (inherited !== undefined) {
      choices[segment.key] = [inherited];
      continue;
    }
    const shared = input.choices[segment.key] ?? [];
    const subset = narrow?.[segment.key];
    if (subset === undefined) {
      choices[segment.key] = shared;
      continue;
    }
    const strangers = subset.filter((value) => !shared.includes(value));
    if (strangers.length > 0) {
      throw new Error(`Narrowing for "${line.name}" on ${segment.label} uses values not in the shared choices: ${strangers.map((value) => `"${value}"`).join(", ")}.`);
    }
    choices[segment.key] = subset;
  }
  return choices;
}

// A parent narrowed to nothing yields no rows for that parent and does not
// block the rest; the engine's own check would otherwise refuse the empty
// required list.
function rowsUnder(child: Rule, choices: BatchChoices): number {
  const emptyRequired = child.segments.some((segment) => segment.required && (choices[segment.key] ?? []).filter((value) => value !== "").length === 0);
  return emptyRequired ? 0 : countCombinations(child, choices);
}

// Per parent a product, summed (rule 8); linear in the number of parents.
export function countUnderParents(child: Rule, parentRule: Rule, input: ParentBatchInput): { perParent: Record<string, number>; total: number } {
  const perParent: Record<string, number> = {};
  let total = 0;
  for (const line of acceptedParents(child, parentRule, input)) {
    const count = rowsUnder(child, choicesUnder(child, parentRule, input, line));
    perParent[line.name] = count;
    total += count;
  }
  return { perParent, total };
}

// Parents in input order, enumerate's order within each (rule 7).
export function* enumerateUnderParents(child: Rule, parentRule: Rule, input: ParentBatchInput): Generator<ParentBatchRow> {
  for (const line of acceptedParents(child, parentRule, input)) {
    const choices = choicesUnder(child, parentRule, input, line);
    if (rowsUnder(child, choices) === 0) continue;
    for (const row of enumerate(child, choices)) {
      yield { parentName: line.name, selections: row.selections, name: row.name };
    }
  }
}
