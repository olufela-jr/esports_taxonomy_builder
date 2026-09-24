import { describe, expect, it } from "vitest";

import {
  checkRule,
  checkRuleSet,
  compose,
  entriesFromCodes,
  resolveRule,
  rollup,
  validate,
  type EnumSegment,
  type FreeformSegment,
  type Rule,
  type RuleScan,
  type RuleSet,
} from "./engine";

const typeSegment: EnumSegment = {
  id: "s_type",
  kind: "enum",
  key: "campaign_type",
  label: "Campaign Type",
  required: true,
  allowedValues: entriesFromCodes(["brand", "perf", "rtg"]),
};

const marketSegment: EnumSegment = {
  id: "s_market",
  kind: "enum",
  key: "market",
  label: "Market",
  required: true,
  allowedValues: entriesFromCodes(["uk", "us", "de"]),
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
        { ...marketSegment, allowedValues: entriesFromCodes(["UK", "US"]) },
      ],
    };

    expect(validate(upperRule, "UK").valid).toBe(true);
    expect(validate(upperRule, "uk").valid).toBe(false);
    expect(validate(upperRule, "uk").violations[0]?.reason).toContain("allowed list");
  });

  it("writes and matches codes, never labels", () => {
    const labelledRule: Rule = {
      ...campaignRule,
      segments: [
        { ...typeSegment, allowedValues: [{ label: "Awareness", code: "AWA" }, { label: "Performance", code: "PRF" }] },
        marketSegment,
      ],
    };

    const composed = compose(labelledRule, { campaign_type: "AWA", market: "uk" });
    expect(composed.errors).toEqual([]);
    expect(composed.name).toBe("AWA_uk");
    expect(validate(labelledRule, composed.name).valid).toBe(true);

    // The label is display only: it is not accepted in a name or a selection.
    expect(validate(labelledRule, "Awareness_uk").valid).toBe(false);
    expect(compose(labelledRule, { campaign_type: "Awareness", market: "uk" }).errors).toContain(
      "Campaign Type: Value is not in the allowed list.",
    );
    expect(validate(labelledRule, "AWB_uk").violations[0]?.suggestion).toBe('Did you mean "AWA"?');
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
        { ...marketSegment, allowedValues: entriesFromCodes(["uk", "u--s"]) },
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

  it("requires unique codes and labels with nothing blank in an enum list", () => {
    const duplicates: Rule = {
      ...campaignRule,
      segments: [
        {
          ...typeSegment,
          allowedValues: [
            { label: "Awareness", code: "AWA" },
            { label: "Awareness again", code: "AWA" },
            { label: "Awareness", code: "AW2" },
            { label: "", code: " " },
          ],
        },
      ],
    };

    const errors = checkRule(duplicates);
    expect(errors).toContain('Campaign Type has the code "AWA" more than once.');
    expect(errors).toContain('Campaign Type has the label "Awareness" more than once.');
    expect(errors).toContain("Campaign Type has an allowed value without a code or a label.");
    // The label may differ from the code without being an error.
    expect(checkRule({ ...campaignRule, segments: [{ ...typeSegment, allowedValues: [{ label: "Awareness", code: "AWA" }] }] })).toEqual([]);
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

// ---- resolveRule -----------------------------------------------------------------

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const inner of Object.values(value as object)) {
      deepFreeze(inner);
    }
  }
  return value;
}

const targetingSegment: EnumSegment = {
  id: "s_targeting",
  kind: "enum",
  key: "targeting",
  label: "Targeting",
  required: true,
  allowedValues: entriesFromCodes(["broad", "exact"]),
};

const audienceSegment: FreeformSegment = {
  id: "s_audience",
  kind: "freeform",
  key: "audience",
  label: "Audience",
  required: true,
  maxLength: 20,
  illegalChars: [" "],
};

const formatSegment: EnumSegment = {
  id: "s_format",
  kind: "enum",
  key: "format",
  label: "Format",
  required: true,
  allowedValues: entriesFromCodes(["video", "image"]),
};

const adGroupRule: Rule = {
  id: "r_ad_group",
  key: "ad_group",
  name: "Ad Group",
  delimiter: "_",
  parent: { ruleId: "r_campaign", inheritSegmentIds: ["s_type", "s_market"] },
  segments: [targetingSegment, audienceSegment],
  source: { dataset: "marketing", table: "ad_groups", nameColumn: "ad_group_name" },
};

const adRule: Rule = {
  id: "r_ad",
  key: "ad",
  name: "Ad",
  delimiter: "_",
  parent: { ruleId: "r_ad_group", inheritSegmentIds: ["s_type", "s_market", "s_targeting"] },
  segments: [formatSegment],
  source: { dataset: "marketing", table: "ads", nameColumn: "ad_name" },
};

// Every fixture is deep-frozen so any mutation by resolveRule throws.
function ruleSetOf(...rules: Rule[]): RuleSet {
  return deepFreeze(structuredClone({ id: "rs_1", name: "Acme", rules }));
}

function childOf(ruleSet: RuleSet, id: string): Rule {
  const rule = ruleSet.rules.find((candidate) => candidate.id === id);
  if (!rule) throw new Error(`fixture missing ${id}`);
  return rule;
}

describe("resolveRule", () => {
  const chain = ruleSetOf(campaignRule, adGroupRule, adRule);

  it("returns a copy of a Rule without a parent", () => {
    const result = resolveRule(childOf(chain, "r_campaign"), chain);

    expect(result.errors).toEqual([]);
    expect(result.rule).toEqual(campaignRule);
    expect(result.rule).not.toBe(childOf(chain, "r_campaign"));
    expect(result.rule.segments).not.toBe(childOf(chain, "r_campaign").segments);
    expect("parent" in result.rule).toBe(false);
  });

  it("flattens one level: inherited segments first, then the child's own", () => {
    const result = resolveRule(childOf(chain, "r_ad_group"), chain);

    expect(result.errors).toEqual([]);
    expect(result.rule.parent).toBeUndefined();
    expect(result.rule.segments.map((segment) => segment.id)).toEqual([
      "s_type",
      "s_market",
      "s_targeting",
      "s_audience",
    ]);
    expect(result.rule.segments[0]).toEqual(typeSegment);
    expect(result.rule.id).toBe("r_ad_group");
    expect(result.rule.name).toBe("Ad Group");
    expect(result.rule.source).toEqual(adGroupRule.source);
  });

  it("flattens two levels through the parent's own inherited segments", () => {
    const result = resolveRule(childOf(chain, "r_ad"), chain);

    expect(result.errors).toEqual([]);
    expect(result.rule.segments.map((segment) => segment.key)).toEqual([
      "campaign_type",
      "market",
      "targeting",
      "format",
    ]);
  });

  it("keeps compose and validate in round-trip agreement on a resolved child", () => {
    const resolved = resolveRule(childOf(chain, "r_ad_group"), chain).rule;
    const parentName = compose(campaignRule, { campaign_type: "perf", market: "uk" }).name;
    const composed = compose(resolved, {
      campaign_type: "perf",
      market: "uk",
      targeting: "broad",
      audience: "runners",
    });

    expect(composed.errors).toEqual([]);
    expect(composed.name).toBe("perf_uk_broad_runners");
    expect(composed.name.startsWith(`${parentName}_`)).toBe(true);
    expect(validate(resolved, composed.name).valid).toBe(true);
    expect(validate(resolved, "perf_fr_broad_runners").valid).toBe(false);
  });

  function expectFailure(rule: Rule, ruleSet: RuleSet, ...messages: string[]) {
    const result = resolveRule(rule, ruleSet);
    expect(result.errors).toEqual(messages);
    // The input comes back untouched, parent still set, so the guard catches misuse.
    expect(result.rule).toBe(rule);
    expect(result.rule.parent).toBeDefined();
  }

  it("rejects a cycle between two Rules", () => {
    const a: Rule = { ...campaignRule, id: "r_a", name: "A", parent: { ruleId: "r_b", inheritSegmentIds: ["s_type"] } };
    const b: Rule = { ...campaignRule, id: "r_b", name: "B", parent: { ruleId: "r_a", inheritSegmentIds: ["s_type"] } };
    const ruleSet = ruleSetOf(a, b);

    expectFailure(
      childOf(ruleSet, "r_a"),
      ruleSet,
      'Parent "B" cannot be resolved: Parent Rules form a cycle through "A".',
    );
  });

  it("rejects a Rule that names itself as parent", () => {
    const self: Rule = { ...adGroupRule, parent: { ruleId: "r_ad_group", inheritSegmentIds: ["s_targeting"] } };
    const ruleSet = ruleSetOf(campaignRule, self);

    expectFailure(childOf(ruleSet, "r_ad_group"), ruleSet, 'Parent Rules form a cycle through "Ad Group".');
  });

  it("rejects a missing parent", () => {
    const ruleSet = ruleSetOf(adGroupRule);

    expectFailure(childOf(ruleSet, "r_ad_group"), ruleSet, "The parent Rule no longer exists in this Rule Set.");
  });

  it("rejects an inherited segment id that is not on the parent", () => {
    const child: Rule = { ...adGroupRule, parent: { ruleId: "r_campaign", inheritSegmentIds: ["s_type", "s_gone"] } };
    const ruleSet = ruleSetOf(campaignRule, child);

    expectFailure(
      childOf(ruleSet, "r_ad_group"),
      ruleSet,
      'Inherited segment "s_gone" does not exist on parent "Campaign".',
    );
  });

  it("rejects inherited ids that are not the parent's leading run, or are out of order", () => {
    const skipping: Rule = { ...adGroupRule, parent: { ruleId: "r_campaign", inheritSegmentIds: ["s_type", "s_custom"] } };
    const reordered: Rule = { ...adGroupRule, parent: { ruleId: "r_campaign", inheritSegmentIds: ["s_market", "s_type"] } };
    const message =
      'Inherited segments must be the first 2 segments of parent "Campaign" in order: "campaign_type", "market".';

    const skippingSet = ruleSetOf(campaignRule, skipping);
    expectFailure(childOf(skippingSet, "r_ad_group"), skippingSet, message);

    const reorderedSet = ruleSetOf(campaignRule, reordered);
    expectFailure(childOf(reorderedSet, "r_ad_group"), reorderedSet, message);
  });

  it("rejects inheriting an optional parent segment", () => {
    const child: Rule = {
      ...adGroupRule,
      parent: { ruleId: "r_campaign", inheritSegmentIds: ["s_type", "s_market", "s_custom"] },
    };
    const ruleSet = ruleSetOf(campaignRule, child);

    expectFailure(
      childOf(ruleSet, "r_ad_group"),
      ruleSet,
      'Inherited segment "Custom ID" is optional; only required parent segments can be inherited.',
    );
  });

  it("rejects a delimiter that differs from the parent's", () => {
    const child: Rule = { ...adGroupRule, delimiter: "-" };
    const ruleSet = ruleSetOf(campaignRule, child);

    expectFailure(
      childOf(ruleSet, "r_ad_group"),
      ruleSet,
      'The delimiter "-" must match parent "Campaign", which uses "_".',
    );
  });

  it("rejects a key collision between an inherited and an own segment", () => {
    const child: Rule = { ...adGroupRule, segments: [{ ...targetingSegment, key: "market" }] };
    const ruleSet = ruleSetOf(campaignRule, child);

    expectFailure(childOf(ruleSet, "r_ad_group"), ruleSet, 'Segment keys must be unique: "market".');
  });

  it("rejects an id collision between an inherited and an own segment", () => {
    const child: Rule = { ...adGroupRule, segments: [{ ...targetingSegment, id: "s_market" }] };
    const ruleSet = ruleSetOf(campaignRule, child);

    expectFailure(childOf(ruleSet, "r_ad_group"), ruleSet, 'Segment ids must be unique: "s_market".');
  });

  it("resolves a parent link that inherits nothing to the child's own segments", () => {
    const child: Rule = { ...adGroupRule, parent: { ruleId: "r_campaign", inheritSegmentIds: [] } };
    const ruleSet = ruleSetOf(campaignRule, child);
    const result = resolveRule(childOf(ruleSet, "r_ad_group"), ruleSet);

    expect(result.errors).toEqual([]);
    expect(result.rule.parent).toBeUndefined();
    expect(result.rule.segments.map((segment) => segment.id)).toEqual(["s_targeting", "s_audience"]);
  });

  it("reports a broken parent from the grandchild, naming the parent", () => {
    const brokenAdGroup: Rule = { ...adGroupRule, delimiter: "-" };
    const ruleSet = ruleSetOf(campaignRule, brokenAdGroup, adRule);

    expectFailure(
      childOf(ruleSet, "r_ad"),
      ruleSet,
      'Parent "Ad Group" cannot be resolved: The delimiter "-" must match parent "Campaign", which uses "_".',
    );
  });
});
