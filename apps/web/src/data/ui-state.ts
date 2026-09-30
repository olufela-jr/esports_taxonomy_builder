import type { RuleSet } from './types';

// The persistent workspace context: which Rule Set and Rule are selected, and
// the last action used. Per-browser, so it lives in localStorage; Rule Set data
// itself goes through the store module.

export type ActionPath = '/author' | '/build' | '/check' | '/compliance' | '/dictionary' | '/members';

// ruleId is the selected Rule's immutable id, never its editable key.
export type UiState = {
  ruleSetId: string | null;
  ruleId: string | null;
  lastAction: ActionPath;
};

export const defaultUiState: UiState = { ruleSetId: null, ruleId: null, lastAction: '/author' };

const STORAGE_KEY = 'campaign-tool-ui-state-v4';
// v3 stored ruleId as the Rule's key (Rules had no ids yet).
const V3_STORAGE_KEY = 'campaign-tool-ui-state-v3';
// v2 stored "All Rules" as a sentinel ruleId and the real Rule's key in individualRuleId.
const V2_STORAGE_KEY = 'campaign-tool-ui-state-v2';

type StoredState = {
  ruleSetId?: string | null;
  ruleId?: string | null;
  individualRuleId?: string | null;
  lastAction?: string;
  checkMode?: string;
};

export function isActionPath(value: unknown): value is ActionPath {
  return value === '/author' || value === '/build' || value === '/check' || value === '/compliance' || value === '/dictionary' || value === '/members';
}

// Check's All Rules scope became the Compliance board, so someone who was last
// working there lands there rather than on a Check screen that no longer has
// it. The key is not bumped: an unknown lastAction already falls back, and a
// new key would throw away everyone's Rule Set selection for nothing.
function actionFrom(lastAction: unknown, wasAllRules: boolean): ActionPath {
  const action = isActionPath(lastAction) ? lastAction : '/author';
  return action === '/check' && wasAllRules ? '/compliance' : action;
}

// Older versions stored the Rule's key; look up the id it now has.
function ruleIdFromKey(ruleSets: RuleSet[], ruleSetId: string | null, ruleKey: string | null): string | null {
  if (!ruleSetId || !ruleKey) return null;
  const ruleSet = ruleSets.find((item) => item.id === ruleSetId);
  return ruleSet?.rules.find((rule) => rule.key === ruleKey)?.id ?? null;
}

export function readUiState(ruleSets: RuleSet[]): UiState {
  try {
    const current = window.localStorage.getItem(STORAGE_KEY);
    if (current) {
      const parsed = JSON.parse(current) as StoredState;
      return {
        ruleSetId: parsed.ruleSetId ?? null,
        ruleId: parsed.ruleId ?? null,
        lastAction: actionFrom(parsed.lastAction, parsed.checkMode === 'all'),
      };
    }

    const v3 = window.localStorage.getItem(V3_STORAGE_KEY);
    if (v3) {
      const old = JSON.parse(v3) as StoredState;
      // 'new' was a sentinel for "creating a Rule Set"; it no longer exists.
      const ruleSetId = old.ruleSetId && old.ruleSetId !== 'new' ? old.ruleSetId : null;
      return {
        ruleSetId,
        ruleId: ruleIdFromKey(ruleSets, ruleSetId, old.ruleId ?? null),
        lastAction: actionFrom(old.lastAction, old.checkMode === 'all'),
      };
    }

    const v2 = window.localStorage.getItem(V2_STORAGE_KEY);
    if (v2) {
      const old = JSON.parse(v2) as StoredState;
      const wasAllRules = old.ruleId === 'all_rules';
      const ruleSetId = old.ruleSetId && old.ruleSetId !== 'new' ? old.ruleSetId : null;
      const ruleKey = wasAllRules ? old.individualRuleId ?? null : old.ruleId ?? null;
      return {
        ruleSetId,
        ruleId: ruleIdFromKey(ruleSets, ruleSetId, ruleKey),
        lastAction: actionFrom(old.lastAction, wasAllRules),
      };
    }
  } catch {
    // Corrupt or unavailable storage: start fresh.
  }
  return defaultUiState;
}

export function writeUiState(state: UiState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage unavailable: the selection still works for this session.
  }
}
