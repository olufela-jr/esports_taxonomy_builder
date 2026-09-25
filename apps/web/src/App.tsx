import { useEffect, useMemo, useState } from 'react';
import { Route, Switch, Router as WouterRouter, useLocation } from 'wouter';

import { AppShell } from '@/components/AppShell';
import { Builder } from '@/components/Builder';
import { CsvChecker } from '@/components/CsvChecker';
import { ErrorBoundary } from '@/components/error-boundary';
import { NotFound } from '@/components/NotFound';
import { RuleSetEditor } from '@/components/RuleSetEditor';
import { RuleSetList } from '@/components/RuleSetList';
import { NoWorkspace, SignIn } from '@/components/SignIn';
import { createAuth, type User } from '@/data/auth';
import { detectMode } from '@/data/mode';
import { createStore, type RuleSet, type RuleSetDraft, type Store } from '@/data/store';
import { isActionPath, readUiState, writeUiState, type CheckMode, type UiState } from '@/data/ui-state';

// App owns all shared state with useState: the signed-in user, the Rule Sets
// (from the store) and the persistent workspace context. Everything below
// receives props.
function App() {
  // The mode is decided once; the session and the store both follow it.
  const mode = useMemo(detectMode, []);
  const auth = useMemo(() => createAuth(mode), [mode]);
  const [user, setUser] = useState<User | null | undefined>(() => auth.getUser());
  useEffect(() => auth.subscribe(setUser), [auth]);

  // The store belongs to the signed-in tenant, so it exists only while a
  // workspace member is signed in; its listener starts then and stops on sign-out.
  const tenantId = user?.tenantId ?? null;
  const uid = user?.uid ?? null;
  const store = useMemo(() => (tenantId && uid ? createStore(mode, { tenantId, uid }) : null), [mode, tenantId, uid]);
  const [ruleSets, setRuleSets] = useState<RuleSet[]>(() => store?.ruleSets.getSnapshot() ?? []);
  useEffect(() => {
    if (!store) {
      setRuleSets([]);
      return;
    }
    return store.ruleSets.subscribe(setRuleSets);
  }, [store]);

  // The workspace context is per browser, not per user, so it survives sign-out and sign-in.
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

  if (user === undefined) {
    return <div className="flex min-h-[100dvh] items-center justify-center bg-background text-sm font-semibold text-muted-foreground" data-testid="screen-loading">Loading</div>;
  }
  if (user === null) {
    return <SignIn kind={auth.kind} onSignIn={auth.signIn} />;
  }
  // Signed in without a tenant or role claim: nothing is readable yet.
  if (!user.tenantId || !user.role || !store) {
    return <NoWorkspace user={user} onRetry={auth.refreshClaims} onSignOut={auth.signOut} />;
  }

  return (
    <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <Workspace
        user={user}
        canEdit={user.role === 'admin'}
        ruleSets={ruleSets}
        storeKind={store.kind}
        ui={ui}
        selectedRuleSet={selectedRuleSet}
        selectedRule={selectedRule}
        onSelectRuleSet={selectRuleSet}
        onSelectRule={selectRule}
        onCheckModeChange={setCheckMode}
        onLocationChange={setLastAction}
        onSignOut={auth.signOut}
        onCreate={(draft) => store.ruleSets.create(draft)}
        onUpdate={(id, draft, baseUpdatedAt) => store.ruleSets.update(id, draft, baseUpdatedAt)}
        onDelete={(id) => store.ruleSets.remove(id)}
      />
    </WouterRouter>
  );
}

type WorkspaceProps = {
  user: User;
  // Admins author; standard users only build and check (D36).
  canEdit: boolean;
  ruleSets: RuleSet[];
  storeKind: Store['kind'];
  ui: UiState;
  selectedRuleSet: RuleSet | undefined;
  selectedRule: RuleSet['rules'][number] | undefined;
  onSelectRuleSet: (id: string | null) => void;
  onSelectRule: (id: string) => void;
  onCheckModeChange: (mode: CheckMode) => void;
  onLocationChange: (path: string) => void;
  onSignOut: () => Promise<void>;
  onCreate: (draft: RuleSetDraft) => Promise<RuleSet>;
  onUpdate: (id: string, draft: RuleSetDraft, baseUpdatedAt: string) => Promise<string>;
  onDelete: (id: string) => Promise<void>;
};

// Inside the router: syncs the last action with the URL, redirects the root to
// it, and renders the shell plus the three actions.
function Workspace(props: WorkspaceProps) {
  const { user, canEdit, ruleSets, storeKind, ui, selectedRuleSet, selectedRule, onSelectRuleSet, onSelectRule, onCheckModeChange, onLocationChange, onSignOut, onCreate, onUpdate, onDelete } = props;
  const [location, setLocation] = useLocation();

  useEffect(() => {
    if (location === '/') {
      setLocation(ui.lastAction || '/author');
      return;
    }
    onLocationChange(location);
  }, [location, ui.lastAction, setLocation, onLocationChange]);

  // Author: an open Rule Set edits it (read only unless the user is an admin);
  // otherwise the list, or a new draft.
  const [creating, setCreating] = useState(false);
  const [justCreatedId, setJustCreatedId] = useState<string | null>(null);
  useEffect(() => {
    // Picking a Rule Set from the shell while a draft is open abandons the draft.
    if (ui.ruleSetId) setCreating(false);
  }, [ui.ruleSetId]);

  const author = selectedRuleSet
    ? <RuleSetEditor key={selectedRuleSet.id} existing={selectedRuleSet} readOnly={!canEdit} storeKind={storeKind} justCreated={selectedRuleSet.id === justCreatedId} onCreate={onCreate} onUpdate={onUpdate} onDelete={onDelete} onSaved={onSelectRuleSet} onClose={() => onSelectRuleSet(null)} />
    : creating && canEdit
      ? <RuleSetEditor key="new" existing={null} storeKind={storeKind} onCreate={onCreate} onUpdate={onUpdate} onDelete={onDelete} onSaved={(id) => { setCreating(false); setJustCreatedId(id); onSelectRuleSet(id); }} onClose={() => setCreating(false)} />
      : <RuleSetList ruleSets={ruleSets} canCreate={canEdit} storeKind={storeKind} onOpen={onSelectRuleSet} onCreate={() => setCreating(true)} />;

  return (
    <AppShell user={user} ruleSets={ruleSets} storeKind={storeKind} ruleSetId={ui.ruleSetId} ruleId={ui.ruleId} onSelectRuleSet={onSelectRuleSet} onSelectRule={onSelectRule} onSignOut={onSignOut}>
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
