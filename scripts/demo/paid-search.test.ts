// Proves the demo Rule Set against the engine before anything writes it: no
// authoring issues, the round trip on both Rules, the tracking URL the ad
// group produces, and the counts Check will report on the sample CSV.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildTrackingUrl, checkRuleSetIssues, compose, resolveRule, rollup, validate, type Rule, type RuleScan } from '@taxo/shared';
import { demoDefinitions } from './definitions';
import { AD_GROUPS_RULE_ID, CAMPAIGNS_RULE_ID, expectedCsv, paidSearchRuleSet } from './paid-search';

function resolved(ruleId: string): Rule {
  const rule = paidSearchRuleSet.rules.find((candidate) => candidate.id === ruleId);
  if (!rule) throw new Error(`No Rule ${ruleId}`);
  const result = resolveRule(rule, paidSearchRuleSet, demoDefinitions);
  expect(result.errors).toEqual([]);
  return result.rule;
}

function readCsv(): Record<string, string[]> {
  const text = readFileSync(new URL('./paid-search-names.csv', import.meta.url), 'utf8');
  const [header, ...rows] = text.trim().split('\n');
  const columns = header.split(',');
  const values: Record<string, string[]> = Object.fromEntries(columns.map((column) => [column, []]));
  for (const row of rows) {
    row.split(',').forEach((cell, index) => values[columns[index]].push(cell));
  }
  return values;
}

describe('the demo Rule Set', () => {
  it('has no authoring issues against the demo definitions', () => {
    expect(checkRuleSetIssues(paidSearchRuleSet, demoDefinitions)).toEqual({ ruleSet: [], rules: {} });
  });

  it('round-trips a campaign name', () => {
    const rule = resolved(CAMPAIGNS_RULE_ID);
    const built = compose(rule, { game: 'lol', market: 'uk', campaign_type: 'brand', theme: 'summer-sale' });
    expect(built).toEqual({ name: 'lol_uk_brand_summer-sale', errors: [] });
    expect(validate(rule, built.name).valid).toBe(true);
  });

  it('round-trips an ad group name with the inherited segments first', () => {
    const rule = resolved(AD_GROUPS_RULE_ID);
    expect(rule.segments.map((segment) => segment.key)).toEqual(['game', 'market', 'match_type', 'audience', 'device']);
    const built = compose(rule, { game: 'lol', market: 'uk', match_type: 'brd', audience: 'gamers', device: 'mob' });
    expect(built).toEqual({ name: 'lol_uk_brd_gamers_mob', errors: [] });
    expect(validate(rule, built.name).valid).toBe(true);
  });

  it('builds the tracking URL for an ad group under its campaign', () => {
    const rule = resolved(AD_GROUPS_RULE_ID);
    const result = buildTrackingUrl(rule, paidSearchRuleSet, {
      names: { [CAMPAIGNS_RULE_ID]: 'lol_uk_brand_summer-sale', [AD_GROUPS_RULE_ID]: 'lol_uk_brd_gamers_mob' },
      selections: { game: 'lol', market: 'uk', match_type: 'brd', audience: 'gamers', device: 'mob' },
    });
    expect(result.errors).toEqual([]);
    expect(result.url).toBe('https://www.example.com/esports?utm_source=google&utm_medium=cpc&utm_campaign=lol_uk_brand_summer-sale&utm_content=lol_uk_brd_gamers_mob&utm_term=brd');
  });

  it('builds the tracking URL for a campaign on its own', () => {
    const rule = resolved(CAMPAIGNS_RULE_ID);
    const result = buildTrackingUrl(rule, paidSearchRuleSet, {
      names: { [CAMPAIGNS_RULE_ID]: 'val_us_gen_launch_q3' },
      selections: { game: 'val', market: 'us', campaign_type: 'gen', theme: 'launch', quarter: 'q3' },
    });
    expect(result.url).toBe('https://www.example.com/esports?utm_source=google&utm_medium=cpc&utm_campaign=val_us_gen_launch_q3');
  });
});

describe('the sample CSV', () => {
  const csv = readCsv();

  it('holds the expected number of distinct names per column', () => {
    for (const rule of paidSearchRuleSet.rules) {
      const names = csv[rule.source.nameColumn];
      expect(names).toHaveLength(expectedCsv.rows);
      expect(new Set(names).size).toBe(expectedCsv.rows);
    }
  });

  it('gives each Rule 7 of 12 and pools to 14 of 24', () => {
    const scans: RuleScan[] = paidSearchRuleSet.rules.map((rule) => {
      const names = csv[rule.source.nameColumn];
      const valid = names.filter((name) => validate(resolved(rule.id), name).valid).length;
      return { ruleId: rule.id, ruleKey: rule.key, ruleName: rule.name, tags: rule.tags, scanned: names.length, valid };
    });
    for (const scan of scans) {
      expect({ scanned: scan.scanned, valid: scan.valid }).toEqual(expectedCsv.perRule[scan.ruleId]);
    }
    expect(rollup(scans).total).toEqual(expectedCsv.pooled);
  });

  it('has 7 rows that pass every Rule', () => {
    const rules = paidSearchRuleSet.rules.map((rule) => ({ column: rule.source.nameColumn, rule: resolved(rule.id) }));
    let passing = 0;
    for (let row = 0; row < expectedCsv.rows; row += 1) {
      if (rules.every(({ column, rule }) => validate(rule, csv[column][row]).valid)) passing += 1;
    }
    expect(passing).toBe(expectedCsv.strictRows);
  });

  it('fails each invalid name for the intended reason', () => {
    const campaigns = resolved(CAMPAIGNS_RULE_ID);
    const adGroups = resolved(AD_GROUPS_RULE_ID);
    // One violation each, reported as "segment key: token: reason".
    const only = (rule: Rule, name: string) => {
      const { violations } = validate(rule, name);
      expect(violations).toHaveLength(1);
      return `${violations[0].segmentKey}: ${violations[0].token}: ${violations[0].reason}`;
    };
    expect(only(campaigns, 'fortnite_uk_brand_summer-sale')).toBe('game: fortnite: Value is not in the allowed list.');
    expect(only(campaigns, 'lol_uk_brand')).toMatch(/Expected 4 to 5 segments, found 3/);
    expect(only(campaigns, 'cs2_uk_gen_rival/promo')).toMatch(/^theme: rival\/promo: .*"\/"/);
    expect(only(campaigns, 'val_us_gen_this-theme-name-is-far-too-long')).toMatch(/^theme: .*24/);
    expect(only(campaigns, 'lol_uk_brand_q1_summer-sale')).toBe('quarter: summer-sale: Value is not in the allowed list.');
    expect(only(adGroups, 'lol_uk_broad_gamers')).toBe('match_type: broad: Value is not in the allowed list.');
    expect(only(adGroups, 'lol_uk_brd_gamers_mob_extra')).toMatch(/Expected 4 to 5 segments, found 6/);
    expect(only(adGroups, 'lol_uk_brd_gamers?uk')).toMatch(/^audience: gamers\?uk: .*"\?"/);
    expect(only(adGroups, 'val_us_phr_students-in-their-twenties')).toMatch(/^audience: .*20/);
    expect(only(adGroups, 'lol_uk_brd_mob_gamers')).toBe('device: gamers: Value is not in the allowed list.');
  });
});
