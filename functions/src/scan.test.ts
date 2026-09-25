import { describe, expect, it } from 'vitest';
import { entriesFromCodes, type EnumSegment, type Rule } from '@taxo/shared';
import { buildScanQuery, evaluateNames, impactOf, RESULT_CAP } from './scan';

const rule: Rule = {
  id: 'r1',
  key: 'campaign',
  name: 'Campaign',
  delimiter: '_',
  segments: [
    { id: 's1', kind: 'enum', key: 'type', label: 'Type', required: true, allowedValues: entriesFromCodes(['brand', 'perf']) },
    { id: 's2', kind: 'enum', key: 'market', label: 'Market', required: true, allowedValues: entriesFromCodes(['uk', 'us']) },
  ],
  source: { dataset: 'marketing', table: 'campaigns', nameColumn: 'campaign_name' },
};

function codeOf(run: () => unknown): string {
  try { run(); } catch (error) { return (error as { code: string }).code; }
  return 'no error';
}

describe('buildScanQuery', () => {
  it('selects distinct names from the whitelisted source, filter as a parameter', () => {
    expect(buildScanQuery('proj', rule.source)).toEqual({
      query: 'SELECT DISTINCT `campaign_name` AS name FROM `proj.marketing.campaigns` WHERE `campaign_name` IS NOT NULL',
      params: {},
    });
    expect(buildScanQuery('proj', { ...rule.source, filter: { column: 'status', in: ['active', 'paused'] } })).toEqual({
      query: 'SELECT DISTINCT `campaign_name` AS name FROM `proj.marketing.campaigns` WHERE `campaign_name` IS NOT NULL AND `status` IN UNNEST(@filterIn)',
      params: { filterIn: ['active', 'paused'] },
    });
  });

  it('refuses any identifier that is not letters, digits and underscores', () => {
    expect(codeOf(() => buildScanQuery('proj', { ...rule.source, dataset: 'market-ing' }))).toBe('invalid-argument');
    expect(codeOf(() => buildScanQuery('proj', { ...rule.source, table: 'campaigns; DROP TABLE x' }))).toBe('invalid-argument');
    expect(codeOf(() => buildScanQuery('proj', { ...rule.source, nameColumn: 'name`' }))).toBe('invalid-argument');
    expect(codeOf(() => buildScanQuery('proj', { ...rule.source, filter: { column: 'status = 1 OR', in: [] } }))).toBe('invalid-argument');
    // Filter values are never in the query text, so anything goes there.
    expect(buildScanQuery('proj', { ...rule.source, filter: { column: 'status', in: ["x' OR 1=1"] } }).query).not.toContain('OR 1=1');
  });
});

describe('evaluateNames', () => {
  it('counts exactly over every name and annotates up to the cap', () => {
    const result = evaluateNames(rule, ['brand_uk', 'perf_fr', 'perf_us', 'nonsense']);
    expect(result).toMatchObject({ scanned: 4, valid: 2, invalid: 2, truncated: false });
    expect(result.results.map((item) => item.valid)).toEqual([true, false, true, false]);
    expect(result.results[1].violations[0].segmentKey).toBe('market');

    const many = Array.from({ length: RESULT_CAP + 7 }, (_, index) => (index % 2 === 0 ? 'brand_uk' : 'bad'));
    const capped = evaluateNames(rule, many);
    expect(capped.scanned).toBe(RESULT_CAP + 7);
    expect(capped.valid + capped.invalid).toBe(RESULT_CAP + 7);
    expect(capped.truncated).toBe(true);
    expect(capped.results).toHaveLength(RESULT_CAP);
  });
});

describe('impactOf', () => {
  it('counts the names that pass today and would fail under the proposed Rule', () => {
    const market = rule.segments[1] as EnumSegment;
    const proposed: Rule = { ...rule, segments: [rule.segments[0], { ...market, allowedValues: entriesFromCodes(['uk', 'de']) }] };
    const impact = impactOf(rule, proposed, ['brand_uk', 'brand_us', 'perf_us', 'already_bad']);
    expect(impact).toEqual({ scanned: 4, wouldFail: 2, examples: ['brand_us', 'perf_us'] });
  });
});
