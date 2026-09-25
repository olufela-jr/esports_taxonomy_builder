import type { RuleSet } from './types';

// The persistent workspace context: which Rule Set and Rule are selected, the
// last action used, and the Check scope. Per-browser, so it lives in
// localStorage; Rule Set data itself goes through the store module.

export type ActionPath = '/author' | '/build' | '/check' | '/dictionary';
export type CheckMode = 'single' | 'all';

// ruleId is the selected Rule's immutable id, never its editable key.
export type UiState = {
  ruleSetId: string | null;
  ruleId: string | null;
  lastAction: ActionPath;
  checkMode: CheckMode;
};

export const defaultUiState: UiState = { ruleSetId: null, ruleId: null, lastAction: '/author', checkMode: 'single' };

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
  return value === '/author' || value === '/build' || value === '/check' || value === '/dictionary';
}

function isCheckMode(value: unknown): value is CheckMode {
  return value === 'single' || value === 'all';
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
        lastAction: isActionPath(parsed.lastAction) ? parsed.lastAction : '/author',
        checkMode: isCheckMode(parsed.checkMode) ? parsed.checkMode : 'single',
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
        lastAction: isActionPath(old.lastAction) ? old.lastAction : '/author',
        checkMode: isCheckMode(old.checkMode) ? old.checkMode : 'single',
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
        lastAction: isActionPath(old.lastAction) ? old.lastAction : '/author',
        checkMode: wasAllRules ? 'all' : 'single',
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
