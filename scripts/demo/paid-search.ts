// The demonstration Rule Set "Paid search (demo)": two Google Rules, the ad
// group inheriting game and market from the campaign, both backed by shared
// definitions and both carrying a tracking URL mapping. Pure data, so the test
// next to it can prove it against the engine and `seed-ruleset.ts` can write
// it. Everything is lowercase and URL-unreserved because both mappings use the
// "lower" case policy (that is why `demo-objective`, with uppercase codes, is
// not used here).
import type { RuleSet, UtmMapping } from '@taxo/shared';

export const CAMPAIGNS_RULE_ID = 'rule-google-campaigns';
export const AD_GROUPS_RULE_ID = 'rule-google-ad-groups';
export const DEMO_RULE_SET_ID = 'demo-paid-search';

const illegalChars = [' ', '/', '?', '#', '&'];
const baseUrl = 'https://www.example.com/esports';

const campaignUtm: UtmMapping = {
  source: { kind: 'tag', ruleId: CAMPAIGNS_RULE_ID, tag: 'platform' },
  medium: { kind: 'literal', value: 'cpc' },
  campaign: { kind: 'ruleName', ruleId: CAMPAIGNS_RULE_ID },
  baseUrl,
  baseUrlEditable: true,
  casePolicy: 'lower',
};

const adGroupUtm: UtmMapping = {
  source: { kind: 'tag', ruleId: AD_GROUPS_RULE_ID, tag: 'platform' },
  medium: { kind: 'literal', value: 'cpc' },
  campaign: { kind: 'ruleName', ruleId: CAMPAIGNS_RULE_ID },
  content: { kind: 'ruleName', ruleId: AD_GROUPS_RULE_ID },
  term: { kind: 'segment', segmentId: 'seg-match-type' },
  baseUrl,
  baseUrlEditable: true,
  casePolicy: 'lower',
};

export const paidSearchRuleSet: RuleSet = {
  id: DEMO_RULE_SET_ID,
  name: 'Paid search (demo)',
  rules: [
    {
      id: CAMPAIGNS_RULE_ID,
      key: 'google_campaigns',
      name: 'Google Campaigns',
      tags: { platform: 'google', entityType: 'campaign' },
      delimiter: '_',
      source: { dataset: 'marketing', table: 'paid_search_names', nameColumn: 'campaign_name' },
      segments: [
        { id: 'seg-game', kind: 'enum', key: 'game', label: 'Game', required: true, allowedValues: [], definitionId: 'demo-game' },
        { id: 'seg-market', kind: 'enum', key: 'market', label: 'Market', required: true, allowedValues: [], definitionId: 'demo-market' },
        { id: 'seg-campaign-type', kind: 'enum', key: 'campaign_type', label: 'Campaign type', required: true, allowedValues: [
          { label: 'Brand', code: 'brand' }, { label: 'Generic', code: 'gen' }, { label: 'Competitor', code: 'comp' },
        ] },
        { id: 'seg-theme', kind: 'freeform', key: 'theme', label: 'Theme', required: true, maxLength: 24, illegalChars },
        { id: 'seg-quarter', kind: 'enum', key: 'quarter', label: 'Quarter', required: false, allowedValues: [
          { label: 'Q1', code: 'q1' }, { label: 'Q2', code: 'q2' }, { label: 'Q3', code: 'q3' }, { label: 'Q4', code: 'q4' },
        ] },
      ],
      utm: campaignUtm,
    },
    {
      id: AD_GROUPS_RULE_ID,
      key: 'google_ad_groups',
      name: 'Google Ad Groups',
      tags: { platform: 'google', entityType: 'ad_group' },
      delimiter: '_',
      parent: { ruleId: CAMPAIGNS_RULE_ID, inheritSegmentIds: ['seg-game', 'seg-market'] },
      source: { dataset: 'marketing', table: 'paid_search_names', nameColumn: 'ad_group_name' },
      segments: [
        { id: 'seg-match-type', kind: 'enum', key: 'match_type', label: 'Match type', required: true, allowedValues: [], definitionId: 'demo-match-type' },
        { id: 'seg-audience', kind: 'freeform', key: 'audience', label: 'Audience', required: true, maxLength: 20, illegalChars },
        { id: 'seg-device', kind: 'enum', key: 'device', label: 'Device', required: false, allowedValues: [
          { label: 'Mobile', code: 'mob' }, { label: 'Desktop', code: 'dsk' },
        ] },
      ],
      utm: adGroupUtm,
    },
  ],
};

// What Check reports on `paid-search-names.csv` (also the BigQuery table
// `marketing.paid_search_names`): each column holds 7 valid and 5 invalid
// names, one per violation type, so All Rules pools to 14 of 24 and the strict
// per-row view shows 7 of 12 rows passing both Rules.
export const expectedCsv: { rows: number; perRule: Record<string, { scanned: number; valid: number }>; pooled: { scanned: number; valid: number; invalid: number }; strictRows: number } = {
  rows: 12,
  perRule: {
    [CAMPAIGNS_RULE_ID]: { scanned: 12, valid: 7 },
    [AD_GROUPS_RULE_ID]: { scanned: 12, valid: 7 },
  },
  pooled: { scanned: 24, valid: 14, invalid: 10 },
  strictRows: 7,
};
