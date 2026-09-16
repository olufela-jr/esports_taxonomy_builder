import { useEffect, useMemo, useState } from 'react';
import { Route, Switch, Router as WouterRouter, useLocation } from 'wouter';

import { AppShell } from '@/components/AppShell';
import { Builder } from '@/components/Builder';
import { CsvChecker } from '@/components/CsvChecker';
import { ErrorBoundary } from '@/components/error-boundary';
import { NotFound } from '@/components/NotFound';
import { RuleSetEditor } from '@/components/RuleSetEditor';
import { RuleSetList } from '@/components/RuleSetList';
import { createStore, type RuleSet, type RuleSetDraft, type RuleSetStore } from '@/data/store';
import { isActionPath, readUiState, writeUiState, type CheckMode, type UiState } from '@/data/ui-state';

// Until Firebase Auth lands (Phase 5) every locally created Rule Set is owned by "you".
const LOCAL_OWNER_ID = 'you';

// App owns all shared state with useState: the Rule Sets (from the store) and
// the persistent workspace context. Everything below receives props.
function App() {
  const store = useMemo(createStore, []);
  const [ruleSets, setRuleSets] = useState<RuleSet[]>(() => store.getSnapshot());
  useEffect(() => store.subscribe(setRuleSets), [store]);

  const [ui, setUi] = useState<UiState>(() => readUiState(ruleSets));
  useEffect(() => writeUiState(ui), [ui]);

  const selectedRuleSet = ruleSets.find((item) => item.id === ui.ruleSetId);
  const selectedRule = selectedRuleSet?.rules.find((rule) => rule.id === ui.ruleId);

  // Keep the Rule selection valid for the selected Rule Set: fall back to its first Rule.
  useEffect(() => {
    if (selectedRuleSet && selectedRuleSet.rules.length > 0 && !selectedRule) {
      setUi((state) => ({ ...state, ruleId: selectedRuleSet.rules[0].id }));
    }
  }, [selectedRuleSet, selectedRule]);

  const selectRuleSet = (id: string | null) => setUi((state) => (state.ruleSetId === id ? state : { ...state, ruleSetId: id, ruleId: null }));
  const selectRule = (id: string) => setUi((state) => (state.ruleId === id ? state : { ...state, ruleId: id }));
  const setCheckMode = (mode: CheckMode) => setUi((state) => (state.checkMode === mode ? state : { ...state, checkMode: mode }));
  const setLastAction = (path: string) => {
    if (isActionPath(path)) setUi((state) => (state.lastAction === path ? state : { ...state, lastAction: path }));
  };

  return (
    <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <Workspace
        ruleSets={ruleSets}
        storeKind={store.kind}
        ui={ui}
        selectedRuleSet={selectedRuleSet}
        selectedRule={selectedRule}
        onSelectRuleSet={selectRuleSet}
        onSelectRule={selectRule}
        onCheckModeChange={setCheckMode}
        onLocationChange={setLastAction}
        onCreate={(draft) => store.create(draft, LOCAL_OWNER_ID)}
        onUpdate={(id, draft) => store.update(id, draft)}
        onDelete={(id) => store.remove(id)}
      />
    </WouterRouter>
  );
}

type WorkspaceProps = {
  ruleSets: RuleSet[];
  storeKind: RuleSetStore['kind'];
  ui: UiState;
  selectedRuleSet: RuleSet | undefined;
  selectedRule: RuleSet['rules'][number] | undefined;
  onSelectRuleSet: (id: string | null) => void;
  onSelectRule: (id: string) => void;
  onCheckModeChange: (mode: CheckMode) => void;
  onLocationChange: (path: string) => void;
  onCreate: (draft: RuleSetDraft) => Promise<RuleSet>;
  onUpdate: (id: string, draft: RuleSetDraft) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
};

// Inside the router: syncs the last action with the URL, redirects the root to
// it, and renders the shell plus the three actions.
function Workspace(props: WorkspaceProps) {
  const { ruleSets, storeKind, ui, selectedRuleSet, selectedRule, onSelectRuleSet, onSelectRule, onCheckModeChange, onLocationChange, onCreate, onUpdate, onDelete } = props;
  const [location, setLocation] = useLocation();

  useEffect(() => {
    if (location === '/') {
      setLocation(ui.lastAction || '/author');
      return;
    }
    onLocationChange(location);
  }, [location, ui.lastAction, setLocation, onLocationChange]);

  // Author: an open Rule Set edits it; otherwise the list, or a new draft.
  const [creating, setCreating] = useState(false);
  const [justCreatedId, setJustCreatedId] = useState<string | null>(null);
  useEffect(() => {
    // Picking a Rule Set from the shell while a draft is open abandons the draft.
    if (ui.ruleSetId) setCreating(false);
  }, [ui.ruleSetId]);

  const author = selectedRuleSet
    ? <RuleSetEditor key={selectedRuleSet.id} existing={selectedRuleSet} storeKind={storeKind} justCreated={selectedRuleSet.id === justCreatedId} onCreate={onCreate} onUpdate={onUpdate} onDelete={onDelete} onSaved={onSelectRuleSet} onClose={() => onSelectRuleSet(null)} />
    : creating
      ? <RuleSetEditor key="new" existing={null} storeKind={storeKind} onCreate={onCreate} onUpdate={onUpdate} onDelete={onDelete} onSaved={(id) => { setCreating(false); setJustCreatedId(id); onSelectRuleSet(id); }} onClose={() => setCreating(false)} />
      : <RuleSetList ruleSets={ruleSets} storeKind={storeKind} onOpen={onSelectRuleSet} onCreate={() => setCreating(true)} />;

  return (
    <AppShell ruleSets={ruleSets} storeKind={storeKind} ruleSetId={ui.ruleSetId} ruleId={ui.ruleId} onSelectRuleSet={onSelectRuleSet} onSelectRule={onSelectRule}>
      <ErrorBoundary resetKey={location}>
        <Switch>
          <Route path="/author">{author}</Route>
          <Route path="/build"><Builder ruleSet={selectedRuleSet} rule={selectedRule} /></Route>
          <Route path="/check"><CsvChecker ruleSet={selectedRuleSet} rule={selectedRule} checkMode={ui.checkMode} onCheckModeChange={onCheckModeChange} /></Route>
          <Route path="/">{author}</Route>
          <Route component={NotFound} />
        </Switch>
      </ErrorBoundary>
    </AppShell>
  );
}

export default App;
