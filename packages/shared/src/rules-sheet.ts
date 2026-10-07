// Rules as a workbook of three sheets: Rules (one row per Rule), Segments (one
// row per segment, in segment order within its Rule) and Values (one row per
// entry of a Local list, in list order). One value per cell, so a code can hold
// any character the engine allows and still come back byte for byte; nothing
// is split on a separator. Pure functions over rows of cells; reading and
// writing the file stay in the app. Nothing here checks a name: an imported
// Rule is checked like any other, by checkRuleSetIssues, before it can be saved.
//
// Parent links, UTM mappings and the scan source are not in the workbook. They
// reference other Rules and segments by id, which nobody types by hand.
import {
  entryFromCode,
  PLATFORMS,
  type Definition,
  type EnumSegment,
  type Rule,
  type Segment,
  type Source,
  type Tags,
} from "./engine";

export type RuleSheets = {
  rules: string[][];
  segments: string[][];
  values: string[][];
};

export const RULE_SHEET_NAMES = { rules: "Rules", segments: "Segments", values: "Values" };

export const RULE_SHEET_COLUMNS = {
  rules: ["rule_key", "rule_name", "delimiter", "platform", "entity_type"],
  segments: ["rule_key", "segment_key", "segment_label", "kind", "required", "max_length", "illegal_chars", "global_definition"],
  values: ["rule_key", "segment_key", "code", "label"],
};

// The "Read me" sheet written with every export: sheet, column, meaning.
export const RULE_SHEET_HELP = [
  ["Sheet", "Column", "Meaning"],
  ["Rules", "rule_key", "Required. Unique, and not already in the Rule Set: an import only adds new Rules."],
  ["Rules", "rule_name", "Display name. Blank uses the key."],
  ["Rules", "delimiter", "The single character between segments, for example _ or -."],
  ["Rules", "platform", "Optional. A platform id or name, for example google or Google Ads."],
  ["Rules", "entity_type", "Optional, for example campaign or ad_set."],
  ["Segments", "rule_key", "The Rule this segment belongs to. Row order is segment order."],
  ["Segments", "segment_key", "Required, unique within the Rule."],
  ["Segments", "segment_label", "Display name. Blank uses the key."],
  ["Segments", "kind", "enum (a list of values) or freeform (typed text)."],
  ["Segments", "required", "true or false. Blank means true. Optional segments go last."],
  ["Segments", "max_length", "Freeform only: the longest value allowed."],
  ["Segments", "illegal_chars", "Freeform only: the characters not allowed, written together, for example \" /?#&\". The delimiter is always illegal."],
  ["Segments", "global_definition", "Enum only: the name of a Global definition to take values from. Leave blank to list values on the Values sheet."],
  ["Values", "rule_key, segment_key", "The enum segment this value belongs to. Row order is list order."],
  ["Values", "code", "What goes into the name, exactly as written: case, spaces and punctuation all count."],
  ["Values", "label", "What people see when picking. Blank uses the code."],
];

// ---- Export ----------------------------------------------------------------------

// Each Rule's OWN segments (not resolved, so a child does not repeat what it
// inherits). A Global is written by name; its values stay in Definitions.
export function rulesToSheets(rules: Rule[], definitions: Definition[]): RuleSheets {
  const sheets: RuleSheets = {
    rules: [RULE_SHEET_COLUMNS.rules],
    segments: [RULE_SHEET_COLUMNS.segments],
    values: [RULE_SHEET_COLUMNS.values],
  };
  for (const rule of rules) {
    sheets.rules.push([rule.key, rule.name, rule.delimiter, rule.tags?.platform ?? "", rule.tags?.entityType ?? ""]);
    for (const segment of rule.segments) {
      const freeform = segment.kind === "freeform" ? segment : null;
      const definitionId = segment.kind === "enum" ? segment.definitionId : undefined;
      const definition = definitionId ? definitions.find((item) => item.id === definitionId) : undefined;
      sheets.segments.push([
        rule.key,
        segment.key,
        segment.label,
        segment.kind,
        segment.required ? "true" : "false",
        freeform ? String(freeform.maxLength) : "",
        freeform ? freeform.illegalChars.join("") : "",
        definition?.name ?? "",
      ]);
      if (segment.kind === "enum" && !definitionId) {
        for (const entry of segment.allowedValues) sheets.values.push([rule.key, segment.key, entry.code, entry.label]);
      }
    }
  }
  return sheets;
}

// ---- Import ----------------------------------------------------------------------

type SheetRow = { line: number; cells: Record<string, string> };

// The rows of one sheet keyed by column, or null with an error when a required
// column is missing. Headers match in any case and order; extra columns are
// ignored; rows with nothing in them are skipped. `line` counts the header as
// row 1, the way a spreadsheet shows it. Cells are NOT trimmed here: a code is
// exact, so each field decides for itself.
function readSheet(rows: string[][], name: string, columns: string[], required: string[], errors: string[]): SheetRow[] | null {
  if (rows.length === 0) {
    errors.push(`The ${name} sheet has no header row.`);
    return null;
  }
  const headers = rows[0].map((header) => header.trim().toLowerCase());
  const missing = required.filter((column) => !headers.includes(column));
  if (missing.length > 0) {
    errors.push(`The ${name} sheet is missing the column${missing.length > 1 ? "s" : ""} ${missing.join(", ")}.`);
    return null;
  }
  const result: SheetRow[] = [];
  rows.slice(1).forEach((row, index) => {
    if (!row.some((cell) => cell.trim())) return;
    const cells: Record<string, string> = {};
    for (const column of columns) {
      const at = headers.indexOf(column);
      cells[column] = at === -1 ? "" : (row[at] ?? "");
    }
    result.push({ line: index + 2, cells });
  });
  return result;
}

function parseBoolean(cell: string): boolean | null {
  const value = cell.trim().toLowerCase();
  if (value === "true" || value === "yes") return true;
  if (value === "false" || value === "no") return false;
  return null;
}

// A PLATFORMS id or its display name, either case; "" for none, null if unknown.
function parsePlatform(cell: string): string | null {
  const value = cell.trim().toLowerCase();
  if (!value) return "";
  const platform = PLATFORMS.find((item) => item.id === value || item.name.toLowerCase() === value);
  return platform ? platform.id : null;
}

export type RulesSheetImport = {
  rules: Rule[];
  errors: string[];
};

type Draft = { rule: Rule; line: number };
type DraftSegment = { segment: Segment; line: number };

// New Rules from the workbook, for the caller to append after `existing`. All
// or nothing: any error returns no Rules. A rule_key already in `existing` is
// an error, so an import never touches a Rule that is there. Errors name the
// sheet and row.
export function rulesFromSheets(
  sheets: RuleSheets,
  existing: Rule[],
  definitions: Definition[],
  newId: () => string,
  source: Source,
): RulesSheetImport {
  const errors: string[] = [];
  const ruleRows = readSheet(sheets.rules, RULE_SHEET_NAMES.rules, RULE_SHEET_COLUMNS.rules, ["rule_key"], errors);
  const segmentRows = readSheet(sheets.segments, RULE_SHEET_NAMES.segments, RULE_SHEET_COLUMNS.segments, ["rule_key", "segment_key", "kind"], errors);
  const valueRows = readSheet(sheets.values, RULE_SHEET_NAMES.values, RULE_SHEET_COLUMNS.values, ["rule_key", "segment_key", "code"], errors);
  if (!ruleRows || !segmentRows || !valueRows) return { rules: [], errors };

  // Rules. A key refused here is remembered so its segments and values do not
  // each report it again.
  const drafts = new Map<string, Draft>();
  const refused = new Set<string>();
  for (const { line, cells } of ruleRows) {
    const key = cells.rule_key.trim();
    const at = `Rules row ${line}`;
    if (!key) {
      errors.push(`${at}: rule_key is empty.`);
      continue;
    }
    if (drafts.has(key) || refused.has(key)) {
      errors.push(`${at}: the rule_key "${key}" is on the Rules sheet twice.`);
      continue;
    }
    if (existing.some((rule) => rule.key === key)) {
      errors.push(`${at}: a Rule with the key "${key}" is already in this Rule Set.`);
      refused.add(key);
      continue;
    }
    const platform = parsePlatform(cells.platform);
    if (platform === null) errors.push(`${at}: "${cells.platform.trim()}" is not a platform.`);
    const tags: Tags = {};
    if (platform) tags.platform = platform;
    if (cells.entity_type.trim()) tags.entityType = cells.entity_type.trim();
    const rule: Rule = {
      id: newId(),
      key,
      name: cells.rule_name.trim() || key,
      delimiter: cells.delimiter.trim() || cells.delimiter,
      segments: [],
      source: { ...source },
    };
    if (Object.keys(tags).length > 0) rule.tags = tags;
    drafts.set(key, { rule, line });
  }

  // Segments, in row order within each Rule.
  const segmentsByRule = new Map<string, DraftSegment[]>();
  for (const { line, cells } of segmentRows) {
    const ruleKey = cells.rule_key.trim();
    const at = `Segments row ${line}`;
    if (refused.has(ruleKey)) continue;
    if (!drafts.has(ruleKey)) {
      errors.push(ruleKey ? `${at}: there is no Rule "${ruleKey}" on the Rules sheet.` : `${at}: rule_key is empty.`);
      continue;
    }
    const segment = parseSegment(cells, at, definitions, newId, errors);
    if (!segment) continue;
    const list = segmentsByRule.get(ruleKey) ?? [];
    if (list.some((item) => item.segment.key === segment.key)) {
      errors.push(`${at}: segment_key "${segment.key}" appears twice in Rule "${ruleKey}".`);
      continue;
    }
    list.push({ segment, line });
    segmentsByRule.set(ruleKey, list);
  }

  // Values, in row order within each Local list. Code and label are exact.
  for (const { line, cells } of valueRows) {
    const ruleKey = cells.rule_key.trim();
    const segmentKey = cells.segment_key.trim();
    const at = `Values row ${line}`;
    if (refused.has(ruleKey)) continue;
    const found = segmentsByRule.get(ruleKey)?.find((item) => item.segment.key === segmentKey);
    if (!found) {
      // A segment the Segments sheet already refused is reported there, not here.
      if (drafts.has(ruleKey) && segmentRows.some((row) => row.cells.rule_key.trim() === ruleKey && row.cells.segment_key.trim() === segmentKey)) continue;
      errors.push(`${at}: there is no segment "${segmentKey}" in Rule "${ruleKey}" on the Segments sheet.`);
      continue;
    }
    const segment = found.segment;
    if (segment.kind === "freeform") {
      errors.push(`${at}: "${segmentKey}" in Rule "${ruleKey}" is freeform, so it takes no values.`);
      continue;
    }
    if (segment.definitionId) {
      errors.push(`${at}: "${segmentKey}" in Rule "${ruleKey}" takes its values from a Global definition.`);
      continue;
    }
    if (!cells.code.trim()) {
      errors.push(`${at}: code is empty.`);
      continue;
    }
    segment.allowedValues.push(cells.label.trim() ? { label: cells.label, code: cells.code } : entryFromCode(cells.code));
  }

  const rules: Rule[] = [];
  for (const [key, { rule, line }] of drafts) {
    const list = segmentsByRule.get(key) ?? [];
    if (list.length === 0) errors.push(`Rules row ${line}: Rule "${key}" has no segments on the Segments sheet.`);
    for (const { segment, line: segmentLine } of list) {
      if (segment.kind === "enum" && !segment.definitionId && segment.allowedValues.length === 0) {
        errors.push(`Segments row ${segmentLine}: enum segment "${segment.key}" needs rows on the Values sheet or a global_definition.`);
      }
    }
    rules.push({ ...rule, segments: list.map((item) => item.segment) });
  }

  if (errors.length === 0 && rules.length === 0) errors.push("The workbook has no Rules in it.");
  return errors.length > 0 ? { rules: [], errors } : { rules, errors };
}

function parseSegment(
  cells: Record<string, string>,
  at: string,
  definitions: Definition[],
  newId: () => string,
  errors: string[],
): Segment | null {
  const key = cells.segment_key.trim();
  if (!key) {
    errors.push(`${at}: segment_key is empty.`);
    return null;
  }
  const label = cells.segment_label.trim() || key;
  const requiredCell = cells.required.trim();
  const required = requiredCell === "" ? true : parseBoolean(requiredCell);
  if (required === null) {
    errors.push(`${at}: required must be true or false, not "${requiredCell}".`);
    return null;
  }

  const kind = cells.kind.trim().toLowerCase();
  if (kind === "freeform") {
    const maxLength = Number(cells.max_length.trim());
    if (!cells.max_length.trim() || !Number.isInteger(maxLength) || maxLength < 1) {
      errors.push(`${at}: max_length must be a whole number above 0.`);
      return null;
    }
    // The cell is the characters themselves, as the editor shows them; not
    // trimmed, because a space is the most common illegal character.
    const illegalChars = Array.from(new Set([...cells.illegal_chars]));
    return { id: newId(), kind: "freeform", key, label, required, maxLength, illegalChars };
  }

  if (kind === "enum") {
    const segment: EnumSegment = { id: newId(), kind: "enum", key, label, required, allowedValues: [] };
    const globalName = cells.global_definition.trim();
    if (!globalName) return segment;
    const definition = definitions.find((item) => item.name === globalName);
    if (!definition) {
      errors.push(`${at}: there is no Global definition named "${globalName}".`);
      return null;
    }
    return { ...segment, definitionId: definition.id };
  }

  errors.push(`${at}: kind must be enum or freeform, not "${cells.kind.trim()}".`);
  return null;
}
