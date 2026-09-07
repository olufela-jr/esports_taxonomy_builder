import { createContext, useContext, useCallback, useEffect, useMemo, useState, ReactNode } from "react";
import type { Rule, Segment, EnumSegment, FreeformSegment, Source, Tags } from "@taxo/shared";
import { createStore, type RuleSet, type RuleSetDraft } from "@/data/store";

export type { Rule, Segment, EnumSegment, FreeformSegment, Source, Tags, RuleSet };

// Until Firebase Auth lands (Phase 5) every locally created Rule Set is owned by "you".
const LOCAL_OWNER_ID = "you";

type RuleSetsContextType = {
  ruleSets: RuleSet[];
  createRuleSet: (draft: RuleSetDraft) => Promise<RuleSet>;
  updateRuleSet: (id: string, draft: RuleSetDraft) => Promise<void>;
  deleteRuleSet: (id: string) => Promise<void>;
};

const RuleSetsContext = createContext<RuleSetsContextType | null>(null);

// Thin React binding over the store module. Phase 4b lifts this into App.tsx
// with useState and props; the store interface does not change.
export function RuleSetsProvider({ children }: { children: ReactNode }) {
  const store = useMemo(createStore, []);
  const [ruleSets, setRuleSets] = useState<RuleSet[]>(() => store.getSnapshot());

  useEffect(() => store.subscribe(setRuleSets), [store]);

  const createRuleSet = useCallback((draft: RuleSetDraft) => store.create(draft, LOCAL_OWNER_ID), [store]);
  const updateRuleSet = useCallback((id: string, draft: RuleSetDraft) => store.update(id, draft), [store]);
  const deleteRuleSet = useCallback((id: string) => store.remove(id), [store]);

  return (
    <RuleSetsContext.Provider value={{ ruleSets, createRuleSet, updateRuleSet, deleteRuleSet }}>
      {children}
    </RuleSetsContext.Provider>
  );
}

export function useRuleSets() {
  const ctx = useContext(RuleSetsContext);
  if (!ctx) throw new Error("useRuleSets must be used within RuleSetsProvider");
  return ctx;
}
