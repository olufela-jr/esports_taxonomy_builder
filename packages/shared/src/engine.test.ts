import { describe, expect, it } from "vitest";

import { compose, validate, type Rule } from "./engine";

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