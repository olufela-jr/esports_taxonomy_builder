import { createContext, useContext, ReactNode, useEffect, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { useRuleSets, type RuleSet } from "@/hooks/use-rulesets";

type ActionPath = '/author' | '/build' | '/check';

export type CheckMode = 'single' | 'all';

// ruleId is the selected Rule's immutable id, never its editable key.
type UiState = {
  ruleSetId: string | null;
  ruleId: string | null;
  lastAction: ActionPath;
  checkMode: CheckMode;
};

type UiContextType = UiState & {
  setRuleSetId: (id: string | null) => void;
  setRuleId: (id: string | null) => void;
  setLastAction: (action: ActionPath) => void;
  setCheckMode: (mode: CheckMode) => void;
};

const UiContext = createContext<UiContextType | null>(null);

const STORAGE_KEY = "campaign-tool-ui-state-v4";
// v3 stored ruleId as the Rule's key (Rules had no ids yet).
const V3_STORAGE_KEY = "campaign-tool-ui-state-v3";
// v2 stored "All Rules" as a sentinel ruleId and the real Rule's key in individualRuleId.
const V2_STORAGE_KEY = "campaign-tool-ui-state-v2";

type StoredState = {
  ruleSetId?: string | null;
  ruleId?: string | null;
  individualRuleId?: string | null;
  lastAction?: string;
  checkMode?: string;
};

const defaultState: UiState = { ruleSetId: null, ruleId: null, lastAction: '/author', checkMode: 'single' };

function isActionPath(value: unknown): value is ActionPath {
  return value === '/author' || value === '/build' || value === '/check';
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

function readInitialState(ruleSets: RuleSet[]): UiState {
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
  return defaultState;
}

export function UiProvider({ children }: { children: ReactNode }) {
  const { ruleSets } = useRuleSets();
  const [state, setState] = useState<UiState>(() => readInitialState(ruleSets));

  const [location] = useLocation();

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    if (isActionPath(location)) {
      setState(s => (s.lastAction === location ? s : { ...s, lastAction: location }));
    }
  }, [location]);

  const setRuleSetId = useCallback((id: string | null) => setState(s => {
    if (s.ruleSetId === id) return s;
    return { ...s, ruleSetId: id, ruleId: null };
  }), []);

  const setRuleId = useCallback((id: string | null) => setState(s => {
    if (s.ruleId === id) return s;
    return { ...s, ruleId: id };
  }), []);

  const setLastAction = useCallback((action: ActionPath) => setState(s => {
    if (s.lastAction === action) return s;
    return { ...s, lastAction: action };
  }), []);

  const setCheckMode = useCallback((mode: CheckMode) => setState(s => {
    if (s.checkMode === mode) return s;
    return { ...s, checkMode: mode };
  }), []);

  return (
    <UiContext.Provider value={{ ...state, setRuleSetId, setRuleId, setLastAction, setCheckMode }}>
      {children}
    </UiContext.Provider>
  );
}

export function useUi() {
  const ctx = useContext(UiContext);
  if (!ctx) throw new Error("useUi must be used within UiProvider");
  return ctx;
}
