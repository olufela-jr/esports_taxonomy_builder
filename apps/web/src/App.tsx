import { useEffect, useMemo, useState } from 'react';
import { Route, Switch, Router as WouterRouter, useLocation } from 'wouter';

import { AppShell } from '@/components/AppShell';
import { Builder } from '@/components/Builder';
import { Compliance } from '@/components/Compliance';
import { CsvChecker } from '@/components/CsvChecker';
import { Dictionary } from '@/components/Dictionary';
import { Members, MembersAdminsOnly } from '@/components/Members';
import { Tenants, TenantsSuperOnly } from '@/components/Tenants';
import { ErrorBoundary } from '@/components/error-boundary';
import { NotFound } from '@/components/NotFound';
import { RuleSetEditor } from '@/components/RuleSetEditor';
import { RuleSetList } from '@/components/RuleSetList';
import { NoWorkspace, SignIn } from '@/components/SignIn';
import { createAuth, type Role, type User } from '@/data/auth';
import { detectMode } from '@/data/mode';
import { createInviteClaimer, createMembersService, type MembersService } from '@/data/members';
import { createScanner, type Scanner } from '@/data/scan';
import { createStore, type BuildDraft, type BuildDraftDraft, type Definition, type DefinitionDraft, type Invite, type RuleSet, type RuleSetDraft, type Store, type StoreSession, type Tenant, type TenantUser, type ValueRequest, type ValueRequestDraft } from '@/data/store';
import { createTenantsDirectory, type TenantsDirectory } from '@/data/tenants';
import { isActionPath, readUiState, writeUiState, type UiState } from '@/data/ui-state';

// App owns all shared state with useState: the signed-in user, the Rule Sets
// (from the store) and the persistent workspace context. Everything below
// receives props.
function App() {
  // The mode is decided once; the session and the store both follow it.
  const mode = useMemo(detectMode, []);
  const auth = useMemo(() => createAuth(mode), [mode]);
  // The Cloud Functions (live scan, impact preview): only with the shared workspace.
  const scanner = useMemo(() => createScanner(mode), [mode]);
  // Claims a waiting invite for an account with no workspace yet.
  const inviteClaimer = useMemo(() => createInviteClaimer(mode), [mode]);
  const [user, setUser] = useState<User | null | undefined>(() => auth.getUser());
  useEffect(() => auth.subscribe(setUser), [auth]);

  // The workspace context is per browser, not per user, so it survives sign-out and sign-in.
  const [ui, setUi] = useState<UiState>(() => readUiState([]));
  useEffect(() => writeUiState(ui), [ui]);

  // The super user's directory of tenants, and the workspace being looked at:
  // a member's own tenant; for the super user the one they picked, their own
  // by default, else the first tenant there is.
  const isSuper = user?.superuser === true;
  const directory = useMemo(() => (isSuper ? createTenantsDirectory(mode) : null), [mode, isSuper]);
  const [tenants, setTenants] = useState<Tenant[]>(() => directory?.getSnapshot() ?? []);
  useEffect(() => {
    if (!directory) {
      setTenants([]);
      return;
    }
    return directory.subscribe(setTenants);
  }, [directory]);
  const uid = user?.uid ?? null;
  const viewedTenantId = isSuper ? (ui.tenantId ?? user?.tenantId ?? tenants[0]?.id ?? null) : (user?.tenantId ?? null);
  // The caller's role in the workspace shown; null when they are not a member of it.
  const roleHere: Role | null = user && viewedTenantId && user.tenantId === viewedTenantId ? user.role : null;
  const canEdit = roleHere === 'admin';
  const readAll = canEdit || isSuper;

  // The store belongs to the workspace shown, so it exists only while a
  // member (or the super user) is signed in; its listener starts then and
  // stops on sign-out.
  const session: StoreSession | null = viewedTenantId && uid ? { tenantId: viewedTenantId, uid, role: roleHere ?? 'user', readAll } : null;
  const sessionKey = session ? `${session.tenantId}:${session.uid}:${session.role}:${session.readAll}` : '';
  const store = useMemo(() => (session ? createStore(mode, session) : null), [mode, sessionKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // Membership changes: the Callables, or the memory double over the store.
  const membersService: MembersService | null = useMemo(() => (store && session ? createMembersService(mode, store, session) : null), [mode, store, sessionKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const [ruleSets, setRuleSets] = useState<RuleSet[]>(() => store?.ruleSets.getSnapshot() ?? []);
  const [definitions, setDefinitions] = useState<Definition[]>(() => store?.definitions.getSnapshot() ?? []);
  const [requests, setRequests] = useState<ValueRequest[]>(() => store?.requests.getSnapshot() ?? []);
  const [drafts, setDrafts] = useState<BuildDraft[]>(() => store?.drafts.getSnapshot() ?? []);
  const [tenant, setTenant] = useState<Tenant | null>(() => store?.tenant.getSnapshot() ?? null);
  const [members, setMembers] = useState<TenantUser[]>(() => store?.members.getSnapshot() ?? []);
  const [invites, setInvites] = useState<Invite[]>(() => store?.invites.getSnapshot() ?? []);
  useEffect(() => {
    if (!store) {
      setRuleSets([]);
      setDefinitions([]);
      setRequests([]);
      setDrafts([]);
      setTenant(null);
      setMembers([]);
      setInvites([]);
      return;
    }
    const stops = [store.ruleSets.subscribe(setRuleSets), store.definitions.subscribe(setDefinitions), store.requests.subscribe(setRequests), store.drafts.subscribe(setDrafts), store.tenant.subscribe(setTenant), store.members.subscribe(setMembers), store.invites.subscribe(setInvites)];
    return () => stops.forEach((stop) => stop());
  }, [store]);

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
  // Switching workspace (super user only) drops the Rule Set and Rule selection: they belong to the old one.
  const selectTenant = (id: string) => setUi((state) => (state.tenantId === id ? state : { ...state, tenantId: id, ruleSetId: null, ruleId: null }));
  const setLastAction = (path: string) => {
    if (isActionPath(path)) setUi((state) => (state.lastAction === path ? state : { ...state, lastAction: path }));
  };

  if (user === undefined) {
    return <div className="flex min-h-[100dvh] items-center justify-center bg-background text-sm font-semibold text-muted-foreground" data-testid="screen-loading">Loading</div>;
  }
  if (user === null) {
    return <SignIn kind={auth.kind} onSignIn={auth.signIn} />;
  }
  // The super user with no tenant to look at yet: only the Tenants screen makes sense.
  if (isSuper && directory && !viewedTenantId) {
    return <TenantsStandalone user={user} tenants={tenants} directory={directory} onSignOut={auth.signOut} />;
  }
  // Signed in without a tenant or role claim: nothing is readable yet.
  if (!isSuper && (!user.tenantId || !user.role)) {
    return <NoWorkspace user={user} onAcceptInvite={inviteClaimer.accept} onRetry={auth.refreshClaims} onSignOut={auth.signOut} />;
  }
  if (!viewedTenantId || !store || !membersService) {
    return <NoWorkspace user={user} onAcceptInvite={inviteClaimer.accept} onRetry={auth.refreshClaims} onSignOut={auth.signOut} />;
  }

  return (
    <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <Workspace
        user={user}
        canEdit={canEdit}
        isSuper={isSuper}
        roleHere={roleHere}
        tenants={tenants}
        directory={directory}
        viewedTenantId={viewedTenantId}
        onSelectTenant={selectTenant}
        ruleSets={ruleSets}
        definitions={definitions}
        requests={requests}
        drafts={drafts}
        tenant={tenant}
        members={members}
        invites={invites}
        membersService={membersService}
        scanner={scanner}
        storeKind={store.kind}
        ui={ui}
        selectedRuleSet={selectedRuleSet}
        selectedRule={selectedRule}
        onSelectRuleSet={selectRuleSet}
        onSelectRule={selectRule}
        onLocationChange={setLastAction}
        onSignOut={auth.signOut}
        onCreate={(draft) => store.ruleSets.create(draft)}
        onUpdate={(id, draft, baseUpdatedAt) => store.ruleSets.update(id, draft, baseUpdatedAt)}
        onDelete={(id) => store.ruleSets.remove(id)}
        onCreateDefinition={(draft) => store.definitions.create(draft)}
        onUpdateDefinition={(id, draft, baseUpdatedAt) => store.definitions.update(id, draft, baseUpdatedAt)}
        onDeleteDefinition={(id) => store.definitions.remove(id)}
        onCreateRequest={(draft) => store.requests.create(draft)}
        onUpdateRequest={(id, draft, baseUpdatedAt) => store.requests.update(id, draft, baseUpdatedAt)}
        onCreateDraft={(draft) => store.drafts.create(draft)}
        onUpdateDraft={(id, draft, baseUpdatedAt) => store.drafts.update(id, draft, baseUpdatedAt)}
        onDeleteDraft={(id) => store.drafts.remove(id)}
      />
    </WouterRouter>
  );
}

// The Tenants screen on its own, for a super user with nothing to open yet.
function TenantsStandalone({ user, tenants, directory, onSignOut }: { user: User; tenants: Tenant[]; directory: TenantsDirectory; onSignOut: () => Promise<void> }) {
  // Inviting needs a members service, which needs a workspace; with no tenant
  // yet there is nothing to invite into, so the cards' invite is a no-op here.
  const noInvites: MembersService = {
    async invite() { throw new Error('Open the tenant first, then invite from its Members screen.'); },
    async setRole() { throw new Error('Open the tenant first.'); },
    async remove() { throw new Error('Open the tenant first.'); },
    async revoke() { throw new Error('Open the tenant first.'); },
  };
  return (
    <div className="min-h-[100dvh] bg-background">
      <div className="mx-auto max-w-[1440px] px-5 py-8 sm:px-8 lg:px-10">
        <div className="mb-6 flex items-center justify-between text-xs text-muted-foreground"><span>Signed in as {user.email ?? user.name}, super user</span><button type="button" className="underline" onClick={() => void onSignOut()} data-testid="button-sign-out">Sign out</button></div>
        <Tenants tenants={tenants} directory={directory} membersService={noInvites} viewedTenantId={null} storeKind="firestore" onOpen={() => { /* the first tenant opens by default once it exists */ }} />
      </div>
    </div>
  );
}

type WorkspaceProps = {
  user: User;
  // Admins author; standard users only build and check (D36).
  canEdit: boolean;
  // The super user: the workspace switcher, the Tenants screen, read access everywhere.
  isSuper: boolean;
  roleHere: Role | null;
  tenants: Tenant[];
  directory: TenantsDirectory | null;
  viewedTenantId: string;
  onSelectTenant: (id: string) => void;
  ruleSets: RuleSet[];
  definitions: Definition[];
  requests: ValueRequest[];
  drafts: BuildDraft[];
  tenant: Tenant | null;
  members: TenantUser[];
  invites: Invite[];
  membersService: MembersService;
  scanner: Scanner | null;
  storeKind: Store['kind'];
  ui: UiState;
  selectedRuleSet: RuleSet | undefined;
  selectedRule: RuleSet['rules'][number] | undefined;
  onSelectRuleSet: (id: string | null) => void;
  onSelectRule: (id: string) => void;
  onLocationChange: (path: string) => void;
  onSignOut: () => Promise<void>;
  onCreate: (draft: RuleSetDraft) => Promise<RuleSet>;
  onUpdate: (id: string, draft: RuleSetDraft, baseUpdatedAt: string) => Promise<string>;
  onDelete: (id: string) => Promise<void>;
  onCreateDefinition: (draft: DefinitionDraft) => Promise<Definition>;
  onUpdateDefinition: (id: string, draft: DefinitionDraft, baseUpdatedAt: string) => Promise<string>;
  onDeleteDefinition: (id: string) => Promise<void>;
  onCreateRequest: (draft: ValueRequestDraft) => Promise<ValueRequest>;
  onUpdateRequest: (id: string, draft: ValueRequestDraft, baseUpdatedAt: string) => Promise<string>;
  onCreateDraft: (draft: BuildDraftDraft) => Promise<BuildDraft>;
  onUpdateDraft: (id: string, draft: BuildDraftDraft, baseUpdatedAt: string) => Promise<string>;
  onDeleteDraft: (id: string) => Promise<void>;
};

// Inside the router: syncs the last action with the URL, redirects the root to
// it, and renders the shell plus the actions (and the admin section).
function Workspace(props: WorkspaceProps) {
  const { user, canEdit, isSuper, roleHere, tenants, directory, viewedTenantId, onSelectTenant, ruleSets, definitions, requests, drafts, tenant, members, invites, membersService, scanner, storeKind, ui, selectedRuleSet, selectedRule, onSelectRuleSet, onSelectRule, onLocationChange, onSignOut, onCreate, onUpdate, onDelete, onCreateDefinition, onUpdateDefinition, onDeleteDefinition, onCreateRequest, onUpdateRequest, onCreateDraft, onUpdateDraft, onDeleteDraft } = props;
  // In-app notice (O17): an admin sees how many requests wait; a member sees
  // how many of theirs were decided since they last opened the Dictionary.
  const [seenDecided, setSeenDecided] = useState<string[]>(() => readSeenDecided());
  const decided = requests.filter((request) => request.status !== 'pending');
  const dictionaryBadge = canEdit ? requests.filter((request) => request.status === 'pending').length : decided.filter((request) => !seenDecided.includes(request.id)).length;
  const [location, setLocation] = useLocation();

  useEffect(() => {
    if (location === '/') {
      setLocation(ui.lastAction || '/author');
      return;
    }
    onLocationChange(location);
  }, [location, ui.lastAction, setLocation, onLocationChange]);

  // Opening the Dictionary marks every decided request as seen, in this browser.
  useEffect(() => {
    if (!location.startsWith('/dictionary') || canEdit) return;
    const ids = decided.map((request) => request.id);
    if (ids.some((id) => !seenDecided.includes(id))) {
      const next = [...new Set([...seenDecided, ...ids])];
      setSeenDecided(next);
      writeSeenDecided(next);
    }
  }, [location, canEdit, decided, seenDecided]);

  // Author: an open Rule Set edits it (read only unless the user is an admin);
  // otherwise the list, or a new draft.
  const [creating, setCreating] = useState(false);
  const [justCreatedId, setJustCreatedId] = useState<string | null>(null);
  useEffect(() => {
    // Picking a Rule Set from the shell while a draft is open abandons the draft.
    if (ui.ruleSetId) setCreating(false);
  }, [ui.ruleSetId]);

  const author = selectedRuleSet
    ? <RuleSetEditor key={selectedRuleSet.id} existing={selectedRuleSet} definitions={definitions} readOnly={!canEdit} storeKind={storeKind} justCreated={selectedRuleSet.id === justCreatedId} onCreate={onCreate} onUpdate={onUpdate} onDelete={onDelete} onSaved={onSelectRuleSet} onClose={() => onSelectRuleSet(null)} />
    : creating && canEdit
      ? <RuleSetEditor key="new" existing={null} definitions={definitions} storeKind={storeKind} onCreate={onCreate} onUpdate={onUpdate} onDelete={onDelete} onSaved={(id) => { setCreating(false); setJustCreatedId(id); onSelectRuleSet(id); }} onClose={() => setCreating(false)} />
      : <RuleSetList ruleSets={ruleSets} canCreate={canEdit} storeKind={storeKind} onOpen={onSelectRuleSet} onCreate={() => setCreating(true)} />;

  return (
    <AppShell user={user} ruleSets={ruleSets} storeKind={storeKind} ruleSetId={ui.ruleSetId} ruleId={ui.ruleId} onSelectRuleSet={onSelectRuleSet} onSelectRule={onSelectRule} onSignOut={onSignOut} dictionaryBadge={dictionaryBadge} canManage={canEdit || isSuper} isSuper={isSuper} roleHere={roleHere} tenants={tenants} tenantId={viewedTenantId} onSelectTenant={onSelectTenant}>
      <ErrorBoundary resetKey={location}>
        <Switch>
          <Route path="/author">{author}</Route>
          <Route path="/build"><Builder ruleSet={selectedRuleSet} rule={selectedRule} definitions={definitions} onSelectRule={onSelectRule} user={user} requests={requests} drafts={drafts} onCreateRequest={onCreateRequest} onCreateDraft={onCreateDraft} onUpdateDraft={onUpdateDraft} onDeleteDraft={onDeleteDraft} /></Route>
          <Route path="/check"><CsvChecker ruleSet={selectedRuleSet} rule={selectedRule} definitions={definitions} scanner={scanner} /></Route>
          <Route path="/compliance"><Compliance ruleSet={selectedRuleSet} definitions={definitions} scanner={scanner} onSelectRule={onSelectRule} /></Route>
          <Route path="/dictionary"><Dictionary user={user} canEdit={canEdit} definitions={definitions} requests={requests} ruleSets={ruleSets} tenant={tenant} scanner={scanner} storeKind={storeKind} onCreateDefinition={onCreateDefinition} onUpdateDefinition={onUpdateDefinition} onDeleteDefinition={onDeleteDefinition} onCreateRequest={onCreateRequest} onUpdateRequest={onUpdateRequest} drafts={drafts} onUpdateDraft={onUpdateDraft} /></Route>
          <Route path="/members">{canEdit || isSuper ? <Members user={user} members={members} invites={invites} service={membersService} storeKind={storeKind} canManageRoles={canEdit} inviteTenantId={isSuper ? viewedTenantId : undefined} /> : <MembersAdminsOnly />}</Route>
          <Route path="/tenants">{isSuper && directory ? <Tenants tenants={tenants} directory={directory} membersService={membersService} viewedTenantId={viewedTenantId} storeKind={storeKind} onOpen={(id) => { onSelectTenant(id); setLocation('/author'); }} /> : <TenantsSuperOnly />}</Route>
          <Route path="/">{author}</Route>
          <Route component={NotFound} />
        </Switch>
      </ErrorBoundary>
    </AppShell>
  );
}

// The decided requests a member has already seen: a per-browser convenience.
const SEEN_KEY = 'campaign-naming-seen-decided-v1';

function readSeenDecided(): string[] {
  try {
    const raw = window.localStorage.getItem(SEEN_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function writeSeenDecided(ids: string[]): void {
  try {
    window.localStorage.setItem(SEEN_KEY, JSON.stringify(ids));
  } catch {
    // Storage unavailable: the badge just stays until the next visit.
  }
}

export default App;
