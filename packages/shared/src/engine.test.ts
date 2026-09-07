import { describe, expect, it } from "vitest";

import {
  checkRule,
  checkRuleSet,
  compose,
  rollup,
  validate,
  type EnumSegment,
  type FreeformSegment,
  type Rule,
  type RuleScan,
} from "./engine";

const typeSegment: EnumSegment = {
  id: "s_type",
  kind: "enum",
  key: "campaign_type",
  label: "Campaign Type",
  required: true,
  allowedValues: ["brand", "perf", "rtg"],
};

const marketSegment: EnumSegment = {
  id: "s_market",
  kind: "enum",
  key: "market",
  label: "Market",
  required: true,
  allowedValues: ["uk", "us", "de"],
};

const customSegment: FreeformSegment = {
  id: "s_custom",
  kind: "freeform",
  key: "custom_id",
  label: "Custom ID",
  required: false,
  maxLength: 12,
  illegalChars: [" ", "/"],
};

const campaignRule: Rule = {
  id: "r_campaign",
  key: "campaign",
  name: "Campaign",
  delimiter: "_",
  segments: [typeSegment, marketSegment, customSegment],
  source: {
    dataset: "marketing",
    table: "campaigns",
    nameColumn: "campaign_name",
  },
};

describe("naming rule engine", () => {
  it("accepts a valid name", () => {
    expect(validate(campaignRule, "brand_uk_launch01")).toEqual({
      valid: true,
      violations: [],
    });
  });

  it("reports a missing required segment", () => {
    const result = validate(campaignRule, "brand");
    expect(result.valid).toBe(false);
    expect(result.violations[0]?.reason).toContain("Expected 2 to 3 segments");
  });

  it("reports enum, length, and illegal-character violations", () => {
    const enumResult = validate(campaignRule, "brand_gb");
    expect(enumResult.violations[0]?.reason).toContain("allowed list");
    expect(enumResult.violations[0]?.suggestion).toContain("uk");

    const lengthResult = validate(campaignRule, "brand_uk_identifier-too-long");
    expect(lengthResult.violations[0]?.reason).toContain("longer than 12");

    const illegalResult = validate(campaignRule, "brand_uk_launch/01");
    expect(illegalResult.violations[0]?.reason).toContain("illegal character");
  });

  it("rejects an empty name and too many segments", () => {
    expect(validate(campaignRule, "").violations[0]?.reason).toBe("Name cannot be empty.");
    expect(validate(campaignRule, "brand_uk_a_b").violations[0]?.reason).toContain("found 4");
  });

  it("matches enum values exactly and case-sensitively", () => {
    const upperRule: Rule = {
      ...campaignRule,
      segments: [
        { ...marketSegment, allowedValues: ["UK", "US"] },
      ],
    };

    expect(validate(upperRule, "UK").valid).toBe(true);
    expect(validate(upperRule, "uk").valid).toBe(false);
    expect(validate(upperRule, "uk").violations[0]?.reason).toContain("allowed list");
  });

  it("rejects the delimiter inside a value without the author listing it", () => {
    const composed = compose(campaignRule, {
      campaign_type: "brand",
      market: "uk",
      custom_id: "a_b",
    });

    expect(composed.errors).toContain('Custom ID: Value cannot contain the "_" delimiter.');
  });

  it("keeps compose and validate in round-trip agreement", () => {
    const composed = compose(campaignRule, {
      campaign_type: "perf",
      market: "de",
      custom_id: "autumn24",
    });

    expect(composed.errors).toEqual([]);
    expect(composed.name).toBe("perf_de_autumn24");
    expect(validate(campaignRule, composed.name).valid).toBe(true);
  });

  it("reports a filled segment after an empty optional one", () => {
    const withTwoOptional: Rule = {
      ...campaignRule,
      segments: [
        ...campaignRule.segments,
        { id: "s_suffix", kind: "freeform", key: "suffix", label: "Suffix", required: false, maxLength: 5, illegalChars: [] },
      ],
    };

    const composed = compose(withTwoOptional, { campaign_type: "brand", market: "uk", suffix: "x" });
    expect(composed.errors).toContain("Suffix cannot be filled after an optional segment is empty.");
  });

  it("rejects invalid authoring order and duplicate keys", () => {
    const invalidRule: Rule = {
      ...campaignRule,
      segments: [
        { ...campaignRule.segments[2], required: false },
        { ...campaignRule.segments[0], key: "custom_id", required: true },
      ],
    };

    const result = compose(invalidRule, {
      custom_id: "brand",
    });

    expect(result.errors).toContain("Optional segments must appear at the end of a rule.");
    expect(result.errors).toContain('Segment keys must be unique: "custom_id".');
  });
});

describe("authoring checks", () => {
  it("passes a well-formed rule", () => {
    expect(checkRule(campaignRule)).toEqual([]);
  });

  it("reports every authoring problem with its reason", () => {
    const broken: Rule = {
      ...campaignRule,
      key: "",
      delimiter: "--",
      segments: [
        { ...typeSegment, allowedValues: [] },
        { ...marketSegment, allowedValues: ["uk", "u--s"] },
        { ...customSegment, key: "", label: "", maxLength: 0 },
      ],
      source: { dataset: "", table: "campaigns", nameColumn: "campaign_name" },
    };

    const errors = checkRule(broken);
    expect(errors).toContain("The rule needs a key and a name.");
    expect(errors).toContain("The delimiter must be a single character.");
    expect(errors).toContain("Campaign Type needs at least one allowed value.");
    expect(errors).toContain('Market has an allowed value containing the "--" delimiter.');
    expect(errors).toContain("Segment 3 needs a key and a label.");
    expect(errors).toContain("Segment 3 needs a maximum length of at least 1.");
    expect(errors).toContain("The source needs a dataset, table, and name column.");
  });

  it("requires at least one segment and a rule set name", () => {
    const errors = checkRuleSet({ id: "rs", name: " ", rules: [{ ...campaignRule, segments: [] }] });
    expect(errors).toEqual([
      "Give this Rule Set a name.",
      "Rule 1: The rule needs at least one segment.",
    ]);
  });
});

describe("All Rules rollup", () => {
  const scans: RuleScan[] = [
    {
      ruleId: "r_google",
      ruleKey: "google_campaigns",
      ruleName: "Google Campaigns",
      tags: { platform: "google", entityType: "campaign" },
      scanned: 2,
      valid: 1,
    },
    {
      ruleId: "r_meta",
      ruleKey: "meta_ad_sets",
      ruleName: "Meta Ad Sets",
      tags: { platform: "meta", entityType: "ad_set" },
      scanned: 3,
      valid: 2,
    },
  ];

  it("pools valid and scanned counts across rules", () => {
    const result = rollup(scans);

    expect(result.total).toEqual({ scanned: 5, valid: 3, invalid: 2 });
    expect(result.perRule.map((rule) => rule.invalid)).toEqual([1, 1]);
  });

  it("groups counts by platform and entity type, defaulting to untagged", () => {
    const result = rollup([
      ...scans,
      { ruleId: "r_tiktok", ruleKey: "tiktok_creatives", ruleName: "TikTok Creatives", scanned: 4, valid: 4 },
    ]);

    expect(result.byPlatform).toEqual({
      google: { scanned: 2, valid: 1, invalid: 1 },
      meta: { scanned: 3, valid: 2, invalid: 1 },
      untagged: { scanned: 4, valid: 4, invalid: 0 },
    });
    expect(result.byEntityType.campaign).toEqual({ scanned: 2, valid: 1, invalid: 1 });
    expect(result.byEntityType.untagged).toEqual({ scanned: 4, valid: 4, invalid: 0 });
  });

  it("returns zero counts for no scans and for rules with nothing to scan", () => {
    expect(rollup([]).total).toEqual({ scanned: 0, valid: 0, invalid: 0 });

    const result = rollup([{ ruleId: "r_empty", ruleKey: "empty", ruleName: "Empty", scanned: 0, valid: 0 }]);
    expect(result.total).toEqual({ scanned: 0, valid: 0, invalid: 0 });
    expect(result.perRule[0]?.invalid).toBe(0);
  });
});
