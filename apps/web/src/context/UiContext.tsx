import { createContext, useContext, ReactNode, useEffect, useState, useCallback } from "react";
import { useLocation } from "wouter";

type ActionPath = '/author' | '/build' | '/check';

type UiState = {
  ruleSetId: string | null;
  ruleId: string | null;
  individualRuleId: string | null;
  lastAction: ActionPath;
};

type UiContextType = UiState & {
  setRuleSetId: (id: string | null) => void;
  setRuleId: (id: string | null) => void;
  setLastAction: (action: ActionPath) => void;
};

const UiContext = createContext<UiContextType | null>(null);

const STORAGE_KEY = "campaign-tool-ui-state-v2";

function isActionPath(value: string): value is ActionPath {
  return value === '/author' || value === '/build' || value === '/check';
}

export function UiProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<UiState>(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch {}
    return { ruleSetId: null, ruleId: null, individualRuleId: null, lastAction: '/author' };
  });

  const [location] = useLocation();

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    if (isActionPath(location)) {
      setState(s => {
        let next = s;
        if (s.lastAction !== location) {
          next = { ...next, lastAction: location };
        }
        if (location !== '/check' && next.ruleId === 'all_rules') {
          next = { ...next, ruleId: next.individualRuleId };
        }
        return next === s ? s : next;
      });
    }
  }, [location]);

  const setRuleSetId = useCallback((id: string | null) => setState(s => {
    if (s.ruleSetId === id) return s;
    return { ...s, ruleSetId: id, ruleId: null, individualRuleId: null };
  }), []);
  
  const setRuleId = useCallback((id: string | null) => setState(s => {
    if (s.ruleId === id) return s;
    return { 
      ...s, 
      ruleId: id,
      individualRuleId: id === 'all_rules' ? s.individualRuleId : id
    };
  }), []);
  
  const setLastAction = useCallback((action: ActionPath) => setState(s => {
    if (s.lastAction === action) return s;
    return { ...s, lastAction: action };
  }), []);

  return (
    <UiContext.Provider value={{ ...state, setRuleSetId, setRuleId, setLastAction }}>
      {children}
    </UiContext.Provider>
  );
}

export function useUi() {
  const ctx = useContext(UiContext);
  if (!ctx) throw new Error("useUi must be used within UiProvider");
  return ctx;
}