// ALL calls to the Cloud Functions go through this module, the way store.ts
// owns storage and auth.ts owns sign-in. The Functions exist only for the
// shared workspace: in memory mode there is no scanner, and the screens say so.
import { httpsCallable } from 'firebase/functions';
import type { EnumEntry, Rule, RuleCompliance, Violation } from '@taxo/shared';
import { getFirebase } from '@/lib/firebase';
import type { Mode } from './mode';

export type ScanOutcome = {
  ruleId: string;
  scanned: number;
  valid: number;
  invalid: number;
  truncated: boolean;
  results: Array<{ name: string; valid: boolean; violations: Violation[] }>;
  // Computed over the whole scan, not the capped `results`. Optional because a
  // scan service deployed before this field still answers without it; the board
  // falls back to the capped list and says the reasons are a sample.
  breakdown?: RuleCompliance;
};

export type ImpactOutcome = {
  definitionId: string;
  total: number;
  perRule: Array<{ ruleSetName: string; ruleName: string; scanned: number; wouldFail: number; examples: string[] }>;
  skipped: Array<{ ruleName: string; reason: string }>;
};

export type Scanner = {
  // Exact counts over the Rule's whole BigQuery source, plus a capped list.
  scanRule(ruleSetId: string, ruleId: string): Promise<ScanOutcome>;
  // D44: live names that would start failing if the definition's entries became these.
  previewImpact(definitionId: string, entries: EnumEntry[]): Promise<ImpactOutcome>;
};

export type RuleScanOutcome = { rule: Rule; outcome: ScanOutcome | null; error: string };

// Every Rule in a Rule Set, one callable per Rule, in order. Sequential on
// purpose: each Rule runs its own BigQuery query, and a Rule that fails leaves
// the others' results standing rather than sinking the whole scan.
export async function scanRuleSet(scanner: Scanner, ruleSet: { id: string; rules: Rule[] }): Promise<RuleScanOutcome[]> {
  const outcomes: RuleScanOutcome[] = [];
  for (const rule of ruleSet.rules) {
    try {
      outcomes.push({ rule, outcome: await scanner.scanRule(ruleSet.id, rule.id), error: '' });
    } catch (cause) {
      outcomes.push({ rule, outcome: null, error: cause instanceof Error ? cause.message : 'The scan failed.' });
    }
  }
  return outcomes;
}

export function createScanner(mode: Mode): Scanner | null {
  if (mode !== 'firestore') return null;
  const { functions } = getFirebase();
  const scan = httpsCallable<{ ruleSetId: string; ruleId: string }, ScanOutcome>(functions, 'scanCampaigns');
  const impact = httpsCallable<{ definitionId: string; entries: EnumEntry[] }, ImpactOutcome>(functions, 'previewImpact');
  return {
    async scanRule(ruleSetId, ruleId) {
      return (await scan({ ruleSetId, ruleId })).data;
    },
    async previewImpact(definitionId, entries) {
      return (await impact({ definitionId, entries })).data;
    },
  };
}
