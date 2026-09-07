export type EnumSegment = {
  kind: "enum";
  key: string;
  label: string;
  required: boolean;
  allowedValues: string[];
};

export type FreeformSegment = {
  kind: "freeform";
  key: string;
  label: string;
  required: boolean;
  maxLength: number;
  illegalChars: string[];
};

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

export type Rule = {
  key: string;
  label: string;
  delimiter: string;
  segments: Segment[];
  source: Source;
  platform?: string;
  entityType?: string;
};

export type RuleSet = {
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

export type Tags = {
  platform?: string;
  entityType?: string;
};

// One Rule's scan totals, however the names were obtained (CSV rows now,
// a BigQuery scan in Stage 2). Raw counts only: the UI decides how to round.
export type RuleScan = {
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
    if (!segment.allowedValues.includes(token)) {
      const suggestion = findSuggestion(token, segment.allowedValues);
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