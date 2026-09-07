import { createContext, useContext, ReactNode, useEffect, useState, useCallback } from "react";
import { useLocation } from "wouter";

type ActionPath = '/author' | '/build' | '/check';

export type CheckMode = 'single' | 'all';

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

const STORAGE_KEY = "campaign-tool-ui-state-v3";
// v2 stored "All Rules" as a sentinel ruleId; v3 stores it as checkMode.
const LEGACY_STORAGE_KEY = "campaign-tool-ui-state-v2";

type LegacyUiState = {
  ruleSetId?: string | null;
  ruleId?: string | null;
  individualRuleId?: string | null;
  lastAction?: string;
};

const defaultState: UiState = { ruleSetId: null, ruleId: null, lastAction: '/author', checkMode: 'single' };

function isActionPath(value: unknown): value is ActionPath {
  return value === '/author' || value === '/build' || value === '/check';
}

function readInitialState(): UiState {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as Partial<UiState>;
      return { ...defaultState, ...parsed };
    }

    const legacy = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy) {
      const old = JSON.parse(legacy) as LegacyUiState;
      const wasAllRules = old.ruleId === 'all_rules';
      return {
        ruleSetId: old.ruleSetId ?? null,
        ruleId: wasAllRules ? old.individualRuleId ?? null : old.ruleId ?? null,
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
  const [state, setState] = useState<UiState>(readInitialState);

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
