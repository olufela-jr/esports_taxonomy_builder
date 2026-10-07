import { describe, expect, it } from "vitest";

import {
  checkRuleSetIssues,
  compose,
  resolveRule,
  validate,
  RULE_SHEET_COLUMNS,
  rulesFromSheets,
  rulesToSheets,
  type Definition,
  type Rule,
  type RuleSheets,
  type Source,
} from "./index";

const source: Source = { dataset: "marketing", table: "campaign_values", nameColumn: "name" };

function counter() {
  let next = 0;
  return () => `id-${++next}`;
}

const regions: Definition = {
  id: "def-regions",
  name: "Regions",
  platforms: [],
  entries: [
    { label: "United Kingdom", code: "UK" },
    { label: "United States", code: "US" },
  ],
};

const campaign: Rule = {
  id: "rule-a",
  key: "google_campaign",
  name: "Google Campaigns",
  tags: { platform: "google", entityType: "campaign" },
  delimiter: "_",
  segments: [
    { id: "s1", kind: "enum", key: "region", label: "Region", required: true, allowedValues: [], definitionId: "def-regions" },
    {
      id: "s2",
      kind: "enum",
      key: "channel",
      label: "Channel",
      required: true,
      allowedValues: [
        { label: "Search", code: "SRCH" },
        { label: "PMAX", code: "PMAX" },
      ],
    },
    { id: "s3", kind: "freeform", key: "note", label: "Note", required: false, maxLength: 20, illegalChars: [" ", "/"] },
  ],
  source,
};

const plain: Rule = {
  id: "rule-b",
  key: "meta_ad",
  name: "Meta Ads",
  delimiter: "-",
  segments: [{ id: "s4", kind: "freeform", key: "theme", label: "Theme", required: true, maxLength: 12, illegalChars: [] }],
  source,
};

// Ids are minted fresh on import; everything else must survive the trip.
function withoutIds(rules: Rule[]) {
  return rules.map((rule) => ({ ...rule, id: "", segments: rule.segments.map((segment) => ({ ...segment, id: "" })) }));
}

function importSheets(sheets: RuleSheets, existing: Rule[] = []) {
  return rulesFromSheets(sheets, existing, [regions], counter(), source);
}

function sheets(rules: string[][], segments: string[][], values: string[][] = []): RuleSheets {
  return {
    rules: [RULE_SHEET_COLUMNS.rules, ...rules],
    segments: [RULE_SHEET_COLUMNS.segments, ...segments],
    values: [RULE_SHEET_COLUMNS.values, ...values],
  };
}

describe("rulesToSheets", () => {
  it("writes a Rule per row, a segment per row with a Global by name, and a Local entry per row", () => {
    const written = rulesToSheets([campaign, plain], [regions]);
    expect(written.rules).toEqual([
      RULE_SHEET_COLUMNS.rules,
      ["google_campaign", "Google Campaigns", "_", "google", "campaign"],
      ["meta_ad", "Meta Ads", "-", "", ""],
    ]);
    expect(written.segments[1]).toEqual(["google_campaign", "region", "Region", "enum", "true", "", "", "Regions"]);
    expect(written.segments[3]).toEqual(["google_campaign", "note", "Note", "freeform", "false", "20", " /", ""]);
    expect(written.values).toEqual([
      RULE_SHEET_COLUMNS.values,
      ["google_campaign", "channel", "SRCH", "Search"],
      ["google_campaign", "channel", "PMAX", "PMAX"],
    ]);
  });
});

describe("rulesFromSheets", () => {
  it("round-trips an export back to the same Rules, ids aside", () => {
    const result = importSheets(rulesToSheets([campaign, plain], [regions]));
    expect(result.errors).toEqual([]);
    expect(withoutIds(result.rules)).toEqual(withoutIds([campaign, plain]));
  });

  it("keeps every code and label byte for byte, whatever characters it holds", () => {
    const hostile = [
      { code: "UK:LDN", label: "London: City" },
      { code: "A|B", label: "A or B" },
      { code: "a,b", label: "a, b" },
      { code: '"q"', label: 'Quote "q"' },
      { code: "01", label: "01" },
      { code: " lead", label: "Leading space" },
      { code: "Café", label: "Café, Paris" },
      { code: "nl", label: "Two\nlines" },
    ];
    const rule: Rule = { ...plain, segments: [{ id: "s9", kind: "enum", key: "odd", label: "Odd", required: true, allowedValues: hostile }] };
    const result = importSheets(rulesToSheets([rule], []));
    expect(result.errors).toEqual([]);
    expect(result.rules[0].segments[0]).toMatchObject({ allowedValues: hostile });
  });

  it("gives imported Rules fresh, distinct ids", () => {
    const { rules } = importSheets(rulesToSheets([campaign], [regions]));
    const ids = [rules[0].id, ...rules[0].segments.map((segment) => segment.id)];
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain("rule-a");
  });

  it("produces Rules that pass the Rule Set checks and round-trip through compose and validate", () => {
    const { rules } = importSheets(rulesToSheets([campaign], [regions]));
    const ruleSet = { id: "rs", name: "Imported", rules };
    expect(checkRuleSetIssues(ruleSet, [regions])).toEqual({ ruleSet: [], rules: {} });
    const resolved = resolveRule(rules[0], ruleSet, [regions]);
    const composed = compose(resolved.rule!, { region: "UK", channel: "SRCH", note: "q4" });
    expect(composed).toEqual({ name: "UK_SRCH_q4", errors: [] });
    expect(validate(resolved.rule!, composed.name).valid).toBe(true);
  });

  it("accepts headers in any order and case, extra columns, yes/no, platform names, blank labels and empty rows", () => {
    const result = importSheets({
      rules: [["Notes", "Platform", "Delimiter", "Rule_Key"], ["ignored", "TikTok", "-", "tt"], ["", "", "", ""]],
      segments: [["KIND", "Segment_Key", "Rule_Key", "Required"], ["enum", "region", "tt", "no"]],
      values: [["code", "label", "segment_key", "rule_key"], ["A", "", "region", "tt"], ["B", "Bee", "region", "tt"]],
    });
    expect(result.errors).toEqual([]);
    const [rule] = result.rules;
    expect(rule.name).toBe("tt");
    expect(rule.tags).toEqual({ platform: "tiktok" });
    expect(rule.segments[0]).toMatchObject({ label: "region", required: false, allowedValues: [{ label: "A", code: "A" }, { label: "Bee", code: "B" }] });
  });

  it("refuses a rule_key already in the Rule Set and imports nothing", () => {
    const result = importSheets(rulesToSheets([campaign, plain], [regions]), [plain]);
    expect(result.rules).toEqual([]);
    expect(result.errors).toEqual(['Rules row 3: a Rule with the key "meta_ad" is already in this Rule Set.']);
  });

  it("reports every bad row by its sheet and row number", () => {
    const result = importSheets(sheets(
      [
        ["r", "R", "-", "", ""],
        ["r", "R again", "-", "", ""],
        ["", "Nameless", "-", "", ""],
        ["s", "S", "-", "myspace", ""],
        ["empty", "Empty", "-", "", ""],
      ],
      [
        ["r", "a", "", "list", "", "", "", ""],
        ["r", "b", "", "enum", "", "", "", ""],
        ["r", "d", "", "enum", "", "", "", "Countries"],
        ["r", "e", "", "freeform", "", "ten", "", ""],
        ["r", "f", "", "freeform", "maybe", "5", "", ""],
        ["r", "g", "", "freeform", "", "5", "", ""],
        ["r", "g", "", "freeform", "", "5", "", ""],
        ["nobody", "h", "", "enum", "", "", "", ""],
        ["s", "", "", "enum", "", "", "", ""],
        ["s", "glob", "", "enum", "", "", "", "Regions"],
      ],
      [
        ["r", "g", "X", ""],
        ["s", "glob", "UK", ""],
        ["r", "zz", "X", ""],
        ["r", "a", "X", ""],
      ],
    ));
    expect(result.rules).toEqual([]);
    expect(result.errors).toEqual([
      'Rules row 3: the rule_key "r" is on the Rules sheet twice.',
      "Rules row 4: rule_key is empty.",
      'Rules row 5: "myspace" is not a platform.',
      'Segments row 2: kind must be enum or freeform, not "list".',
      'Segments row 4: there is no Global definition named "Countries".',
      "Segments row 5: max_length must be a whole number above 0.",
      'Segments row 6: required must be true or false, not "maybe".',
      'Segments row 8: segment_key "g" appears twice in Rule "r".',
      'Segments row 9: there is no Rule "nobody" on the Rules sheet.',
      "Segments row 10: segment_key is empty.",
      'Values row 2: "g" in Rule "r" is freeform, so it takes no values.',
      'Values row 3: "glob" in Rule "s" takes its values from a Global definition.',
      'Values row 4: there is no segment "zz" in Rule "r" on the Segments sheet.',
      'Segments row 3: enum segment "b" needs rows on the Values sheet or a global_definition.',
      'Rules row 6: Rule "empty" has no segments on the Segments sheet.',
    ]);
  });

  it("names a missing sheet header or required column", () => {
    const result = importSheets({ rules: [], segments: [["rule_key", "kind"]], values: [RULE_SHEET_COLUMNS.values] });
    expect(result.errors).toEqual(["The Rules sheet has no header row.", "The Segments sheet is missing the column segment_key."]);
  });

  it("refuses a workbook with only headers", () => {
    expect(importSheets(sheets([], [])).errors).toEqual(["The workbook has no Rules in it."]);
  });
});
