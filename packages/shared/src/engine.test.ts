import { describe, expect, it } from "vitest";

import { compose, rollup, validate, type Rule, type RuleScan } from "./engine";

const campaignRule: Rule = {
  key: "campaign",
  label: "Campaign",
  delimiter: "_",
  segments: [
    {
      kind: "enum",
      key: "campaign_type",
      label: "Campaign Type",
      required: true,
      allowedValues: ["brand", "perf", "rtg"],
    },
    {
      kind: "enum",
      key: "market",
      label: "Market",
      required: true,
      allowedValues: ["uk", "us", "de"],
    },
    {
      kind: "freeform",
      key: "custom_id",
      label: "Custom ID",
      required: false,
      maxLength: 12,
      illegalChars: [" ", "/"],
    },
  ],
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

describe("All Rules rollup", () => {
  const scans: RuleScan[] = [
    {
      ruleKey: "google_campaigns",
      ruleName: "Google Campaigns",
      tags: { platform: "google", entityType: "campaign" },
      scanned: 2,
      valid: 1,
    },
    {
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
      { ruleKey: "tiktok_creatives", ruleName: "TikTok Creatives", scanned: 4, valid: 4 },
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

    const result = rollup([{ ruleKey: "empty", ruleName: "Empty", scanned: 0, valid: 0 }]);
    expect(result.total).toEqual({ scanned: 0, valid: 0, invalid: 0 });
    expect(result.perRule[0]?.invalid).toBe(0);
  });
});