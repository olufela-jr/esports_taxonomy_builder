import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { BookOpen, Check, Plus, Search, Trash2, X } from 'lucide-react';
import { checkDefinition, definitionDependents, platformName, PLATFORMS, type EnumEntry } from '@taxo/shared';
import { Link, useLocation } from 'wouter';
import type { User } from '@/data/auth';
import type { Scanner } from '@/data/scan';
import type { BuildDraft, BuildDraftDraft, Definition, DefinitionDraft, RuleSet, Store, Tenant, ValueRequest, ValueRequestDraft } from '@/data/store';
import { newId } from '@/lib/ids';
import { globalUsage, localLists, localUsage, ruleCount, type LocalList, type Usage } from '@/lib/value-lists';
import { PageHeading } from './PageHeading';
import { GlobalBadge } from './GlobalBadge';
import { buttonDanger, buttonPrimary, buttonQuiet, iconButton, inputClass } from './styles';

// Definitions: every value list in the workspace, visible to every member.
// Global lists are the tenant's stored definitions (v3 D37): admins create and
// edit them here; standard users read them and request a new value (D41),
// which an admin approves or rejects here too. Local lists are enum segments'
// own values, read off the Rule Sets and edited only in their Rule.

type DefinitionsProps = {
  user: User;
  canEdit: boolean;
  canOpenRules: boolean; // usage links lead into Manage Rules, for admins and the super user
  definitions: Definition[];
  requests: ValueRequest[];
  ruleSets: RuleSet[]; // the Local lists, usage, and delete protection
  scanner: Scanner | null; // D44: the impact preview, with the shared workspace only
  tenant: Tenant | null;
  storeKind: Store['kind'];
  onCreateDefinition: (draft: DefinitionDraft) => Promise<Definition>;
  onUpdateDefinition: (id: string, draft: DefinitionDraft, baseUpdatedAt: string) => Promise<string>;
  onDeleteDefinition: (id: string) => Promise<void>;
  onCreateRequest: (draft: ValueRequestDraft) => Promise<ValueRequest>;
  onUpdateRequest: (id: string, draft: ValueRequestDraft, baseUpdatedAt: string) => Promise<string>;
  drafts: BuildDraft[]; // the Build drafts waiting on requests (D42)
  onUpdateDraft: (id: string, draft: BuildDraftDraft, baseUpdatedAt: string) => Promise<string>;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
}

// The platforms an admin may scope a definition to: the tenant's own list, or
// every platform while the tenant has none set. A platform already on the
// definition stays offered so it can be unticked.
function offeredPlatforms(tenant: Tenant | null, current: string[]): string[] {
  const base = tenant && tenant.config.platforms.length > 0 ? tenant.config.platforms : PLATFORMS.map((platform) => platform.id);
  return [...new Set([...base, ...current])];
}

function PlatformChips({ platforms }: { platforms: string[] }) {
  if (platforms.length === 0) return <span className="text-[11px] font-bold text-muted-foreground">All platforms</span>;
  return <span className="flex flex-wrap gap-1">{platforms.map((id) => <span key={id} className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-foreground">{platformName(id)}</span>)}</span>;
}

function draftOf(request: ValueRequest): ValueRequestDraft {
  return { definitionId: request.definitionId, label: request.label, code: request.code, note: request.note, requestedByName: request.requestedByName, status: request.status, reason: request.reason, ...(request.draftId ? { draftId: request.draftId } : {}) };
}

function buildDraftOf(draft: BuildDraft): BuildDraftDraft {
  return { ruleSetId: draft.ruleSetId, ruleId: draft.ruleId, selections: draft.selections, parentName: draft.parentName, ...(draft.optional ? { optional: draft.optional } : {}), blockedSegmentId: draft.blockedSegmentId, blockedSegmentKey: draft.blockedSegmentKey, requestId: draft.requestId, status: draft.status };
}

// The page's own address says what is open: /definitions/new, a Global at
// /definitions/:id, a Local at /definitions/local/:ruleSetId/:segmentId.
type Selection = { kind: 'none' } | { kind: 'new' } | { kind: 'global'; id: string } | { kind: 'local'; ruleSetId: string; segmentId: string };

function selectionOf(location: string): Selection {
  const parts = location.replace(/^\/definitions\/?/, '').split('/').filter(Boolean);
  if (parts[0] === 'new') return { kind: 'new' };
  if (parts[0] === 'local' && parts[1] && parts[2]) return { kind: 'local', ruleSetId: parts[1], segmentId: parts[2] };
  if (parts[0]) return { kind: 'global', id: parts[0] };
  return { kind: 'none' };
}

const localHref = (list: LocalList) => `/definitions/local/${list.ruleSet.id}/${list.segment.id}`;

type Scope = 'all' | 'global' | 'local';

export function Definitions(props: DefinitionsProps) {
  const { user, canEdit, canOpenRules, definitions, requests, ruleSets, scanner, tenant, storeKind, onCreateDefinition, onUpdateDefinition, onDeleteDefinition, onCreateRequest, onUpdateRequest, drafts, onUpdateDraft } = props;
  const [location, setLocation] = useLocation();
  // Filters are per visit: they reset each time the page opens.
  const [scope, setScope] = useState<Scope>('all');
  const [platform, setPlatform] = useState('');
  const [includeUnrestricted, setIncludeUnrestricted] = useState(true);
  const [query, setQuery] = useState('');

  const locals = localLists(ruleSets);
  const needle = query.trim().toLowerCase();
  const globals = [...definitions]
    .sort((a, b) => a.name.localeCompare(b.name))
    .filter((definition) => scope !== 'local')
    .filter((definition) => !platform || definition.platforms.includes(platform) || (includeUnrestricted && definition.platforms.length === 0))
    .filter((definition) => !needle || definition.name.toLowerCase().includes(needle));
  const shownLocals = locals
    .sort((a, b) => a.segment.label.localeCompare(b.segment.label) || a.rule.name.localeCompare(b.rule.name))
    .filter(() => scope !== 'global')
    .filter((list) => !platform || list.platform === platform)
    .filter((list) => !needle || `${list.segment.label} ${list.rule.name} ${list.ruleSet.name}`.toLowerCase().includes(needle));

  // Nothing chosen: the first Global shown, as before, without changing the address.
  const chosen = selectionOf(location);
  const selection: Selection = chosen.kind === 'none' && globals.length > 0 ? { kind: 'global', id: globals[0].id } : chosen;
  const selected = selection.kind === 'global' ? definitions.find((definition) => definition.id === selection.id) : undefined;
  const selectedLocal = selection.kind === 'local' ? locals.find((list) => list.ruleSet.id === selection.ruleSetId && list.segment.id === selection.segmentId) : undefined;
  const platformOptions = PLATFORMS.map((item) => item.id).filter((id) => definitions.some((definition) => definition.platforms.includes(id)) || locals.some((list) => list.platform === id));

  return (
    <div>
      <PageHeading eyebrow="Value lists" title="Definitions" description={canEdit ? 'Every list of values in this workspace. Global definitions serve every Rule Set; Local lists belong to one Rule. Add Global definitions, set their codes and platforms, and handle requests from your team.' : 'Every list of values in this workspace. Global definitions serve every Rule Set; Local lists belong to one Rule. If a Global value you need is missing, request it and an admin will add it.'} action={canEdit ? <button type="button" className={buttonPrimary} onClick={() => setLocation('/definitions/new')} data-testid="button-create-definition"><Plus className="h-4 w-4" /> New Global definition</button> : undefined} />

      <div className="mb-5 flex flex-col gap-3 rounded-xl border border-border/30 bg-card p-4 shadow-sm lg:flex-row lg:items-center" data-testid="section-definition-filters">
        <div className="relative lg:w-64"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input className={`${inputClass} pl-9`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name or Rule" aria-label="Search definitions" data-testid="input-definitions-search" /></div>
        <div className="inline-flex rounded-[4px] border border-border bg-background p-0.5" role="group" aria-label="Scope">{(['all', 'global', 'local'] as const).map((item) => <button key={item} type="button" className={`rounded-[3px] px-3 py-1.5 text-[12px] font-bold capitalize transition ${scope === item ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`} onClick={() => setScope(item)} aria-pressed={scope === item} data-testid={`button-scope-${item}`}>{item}</button>)}</div>
        <select className={`${inputClass} lg:w-56`} value={platform} onChange={(event) => setPlatform(event.target.value)} aria-label="Platform" data-testid="select-definitions-platform"><option value="">All platforms</option>{platformOptions.map((id) => <option key={id} value={id}>{platformName(id)}</option>)}</select>
        {platform && scope !== 'local' && <label className="inline-flex items-center gap-2 text-[12px] font-bold text-foreground"><input type="checkbox" checked={includeUnrestricted} onChange={(event) => setIncludeUnrestricted(event.target.checked)} className="h-4 w-4 rounded-sm border-gray-300 text-primary focus:ring-primary" data-testid="checkbox-include-unrestricted" /> Include unrestricted Global definitions</label>}
      </div>

      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        <nav className="flex flex-col gap-2" aria-label="Definitions" data-testid="list-definitions">
          {globals.length === 0 && shownLocals.length === 0 && <div className="rounded-xl border border-dashed border-border bg-card/50 px-5 py-8 text-center text-xs text-muted-foreground" data-testid="text-definitions-empty"><BookOpen className="mx-auto mb-2 h-5 w-5" />{definitions.length === 0 && locals.length === 0 ? (canEdit ? 'No definitions yet. Create the first Global one.' : 'No definitions yet. A workspace admin creates them.') : 'Nothing matches these filters.'}</div>}
          {globals.map((definition) => {
            const count = ruleCount(globalUsage(ruleSets, definition.id));
            return (
              <Link key={definition.id} href={`/definitions/${definition.id}`} className={`w-full rounded-xl border p-4 text-left transition ${selection.kind === 'global' && definition.id === selection.id ? 'border-primary/50 bg-card shadow-md' : 'border-border/30 bg-card hover:border-primary/40'}`} data-testid={`card-definition-${definition.id}`}>
                <div className="flex items-start justify-between gap-2"><span className="font-display text-lg font-medium text-foreground">{definition.name}</span><GlobalBadge testId={`badge-scope-${definition.id}`} /></div>
                <div className="mt-1.5"><PlatformChips platforms={definition.platforms} /></div>
                <RowCounts values={definition.entries.length} rules={count} testId={`text-usage-${definition.id}`} />
              </Link>
            );
          })}
          {shownLocals.map((list) => {
            const isSelected = selection.kind === 'local' && selection.segmentId === list.segment.id && selection.ruleSetId === list.ruleSet.id;
            return (
              <Link key={`${list.ruleSet.id}/${list.segment.id}`} href={localHref(list)} className={`w-full rounded-xl border p-4 text-left transition ${isSelected ? 'border-primary/50 bg-card shadow-md' : 'border-border/30 bg-card hover:border-primary/40'}`} data-testid={`card-definition-local-${list.segment.id}`}>
                <div className="flex items-start justify-between gap-2"><span className="font-display text-lg font-medium text-foreground">{list.segment.label}</span></div>
                <div className="mt-1 text-[11px] font-bold text-muted-foreground">{list.ruleSet.name} / {list.rule.name}</div>
                <RowCounts values={list.segment.allowedValues.length} rules={ruleCount(localUsage(list))} testId={`text-usage-local-${list.segment.id}`} />
              </Link>
            );
          })}
        </nav>

        <div>
          {selection.kind === 'new' && canEdit && <DefinitionEditor key="new" existing={null} ruleSets={ruleSets} scanner={scanner} tenant={tenant} storeKind={storeKind} onCreate={onCreateDefinition} onUpdate={onUpdateDefinition} onDelete={onDeleteDefinition} onDone={(id) => setLocation(id ? `/definitions/${id}` : '/definitions')} />}
          {selected && <UsagePanel usage={globalUsage(ruleSets, selected.id)} canOpenRules={canOpenRules} note={canEdit ? 'Changing a code here changes what those Rules accept; deleting is blocked while any Rule uses it.' : undefined} />}
          {selected && canEdit && <DefinitionEditor key={selected.id} existing={selected} ruleSets={ruleSets} scanner={scanner} tenant={tenant} storeKind={storeKind} onCreate={onCreateDefinition} onUpdate={onUpdateDefinition} onDelete={onDeleteDefinition} onDone={(id) => setLocation(id ? `/definitions/${id}` : '/definitions')} />}
          {selected && !canEdit && <DefinitionView key={selected.id} definition={selected} user={user} onCreateRequest={onCreateRequest} />}
          {selectedLocal && <LocalView list={selectedLocal} canOpenRules={canOpenRules} />}
          {selection.kind !== 'new' && !selected && !selectedLocal && <div className="rounded-xl border border-dashed border-border bg-card/50 px-6 py-12 text-center text-sm text-muted-foreground" data-testid="text-definition-none">{selection.kind === 'none' ? 'Select a definition to see its values.' : 'This definition no longer exists.'}</div>}
        </div>
      </div>

      <RequestsPanel canEdit={canEdit} definitions={definitions} requests={requests} drafts={drafts} onUpdateDefinition={onUpdateDefinition} onUpdateRequest={onUpdateRequest} onUpdateDraft={onUpdateDraft} />
    </div>
  );
}

function RowCounts({ values, rules, testId }: { values: number; rules: number; testId: string }) {
  return <div className="mt-2 flex items-center justify-between gap-2 text-[11px] font-bold text-muted-foreground"><span>{values} {values === 1 ? 'value' : 'values'}</span><span data-testid={testId}>{rules === 0 ? 'Not used yet' : `Used by ${rules} ${rules === 1 ? 'Rule' : 'Rules'}`}</span></div>;
}

// The Rules that use a list, each opening the segment in its Rule's editor
// for those who can manage rules.
function UsagePanel({ usage, canOpenRules, note }: { usage: Usage[]; canOpenRules: boolean; note?: ReactNode }) {
  const count = ruleCount(usage);
  return (
    <section className="mb-4 rounded-xl border border-border/30 bg-card p-4 shadow-sm" data-testid="section-definition-usage">
      <div className="text-[13px] font-bold text-foreground">{count === 0 ? 'Not used by any Rule yet' : `Used by ${count} ${count === 1 ? 'Rule' : 'Rules'}`}</div>
      {usage.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1 text-[12px]" data-testid="text-definition-dependents">
          {usage.map((item) => {
            const text = `${item.ruleSetName} / ${item.ruleName} (${item.segmentLabel})`;
            return (
              <li key={`${item.ruleSetId}/${item.ruleId}/${item.segmentId}`} className="font-semibold text-muted-foreground">
                {canOpenRules ? <Link href={`/rules/${item.ruleSetId}/${item.ruleId}/segments/${item.segmentId}`} className="text-primary underline-offset-2 hover:underline" data-testid={`link-usage-${item.ruleId}`}>{text}</Link> : <span data-testid={`text-usage-rule-${item.ruleId}`}>{text}</span>}
                {item.inherited && <span className="ml-1.5 text-[11px]">inherited</span>}
              </li>
            );
          })}
        </ul>
      )}
      {note && count > 0 && <p className="mt-2 text-[11px] font-semibold text-muted-foreground">{note}</p>}
    </section>
  );
}

// A Local list: read only here; it is edited in its Rule.
function LocalView({ list, canOpenRules }: { list: LocalList; canOpenRules: boolean }) {
  const href = `/rules/${list.ruleSet.id}/${list.rule.id}/segments/${list.segment.id}`;
  return (
    <div>
      <UsagePanel usage={localUsage(list)} canOpenRules={canOpenRules} />
      <div className="rounded-xl border border-border/30 bg-card p-6 shadow-sm" data-testid="view-local-definition">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div><div className="flex items-center gap-2"><span className="font-display text-2xl font-medium text-foreground">{list.segment.label}</span></div><div className="mt-1 text-[12px] font-bold text-muted-foreground">Local to {list.ruleSet.name} / {list.rule.name}{list.platform ? `, ${platformName(list.platform)}` : ''}</div></div>
          {canOpenRules && <Link href={href} className={buttonQuiet} data-testid="link-local-edit">Edit in rule</Link>}
        </div>
        <table className="mt-5 w-full text-left text-[13px]"><thead><tr className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground"><th className="pb-2">Label</th><th className="pb-2">Code</th></tr></thead><tbody>
          {list.segment.allowedValues.length === 0 && <tr><td colSpan={2} className="py-3 text-muted-foreground">No values yet.</td></tr>}
          {list.segment.allowedValues.map((entry) => <tr key={entry.code} className="border-t border-border/40" data-testid={`row-local-value-${entry.code}`}><td className="py-2 font-semibold text-foreground">{entry.label}</td><td className="py-2 font-mono text-foreground">{entry.code}</td></tr>)}
        </tbody></table>
        <p className="mt-4 text-[11px] font-semibold text-muted-foreground">Local values belong to this Rule and are changed in its editor.</p>
      </div>
    </div>
  );
}

// ---- Admin editor ---------------------------------------------------------------

type Row = { rowId: string; label: string; code: string };

function rowsOf(entries: EnumEntry[]): Row[] {
  return entries.map((entry) => ({ rowId: newId(), label: entry.label, code: entry.code }));
}

function DefinitionEditor({ existing, ruleSets, scanner, tenant, storeKind, onCreate, onUpdate, onDelete, onDone }: { existing: Definition | null; ruleSets: RuleSet[]; scanner: Scanner | null; tenant: Tenant | null; storeKind: Store['kind']; onCreate: (draft: DefinitionDraft) => Promise<Definition>; onUpdate: (id: string, draft: DefinitionDraft, baseUpdatedAt: string) => Promise<string>; onDelete: (id: string) => Promise<void>; onDone: (id: string | null) => void }) {
  const isNew = existing === null;
  const [name, setName] = useState(existing?.name ?? '');
  const [platforms, setPlatforms] = useState<string[]>(existing?.platforms ?? []);
  // Rows carry their own ids so React keys never come from the array index,
  // which is the focus-loss bug class the migration fixed in the Rule editor.
  const [rows, setRows] = useState<Row[]>(existing ? rowsOf(existing.entries) : [{ rowId: newId(), label: '', code: '' }]);
  const [baseUpdatedAt, setBaseUpdatedAt] = useState(existing?.updatedAt ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!saved) return;
    const timer = window.setTimeout(() => setSaved(false), 2200);
    return () => window.clearTimeout(timer);
  }, [saved]);

  const entries: EnumEntry[] = rows.map((row) => ({ label: row.label.trim(), code: row.code.trim() }));
  const draft: DefinitionDraft = { name: name.trim(), platforms, entries };
  const errors = checkDefinition({ id: existing?.id ?? '', ...draft });
  const stale = !isNew && existing.updatedAt !== baseUpdatedAt;
  // A definition a Rule reads from cannot be deleted; the Rules must be moved
  // off it first. Editing its values stays allowed (D43), with the confirm below.
  const dependents = isNew ? [] : definitionDependents(ruleSets, existing.id);
  const isDirty = isNew || JSON.stringify(draft) !== JSON.stringify({ name: existing.name, platforms: existing.platforms, entries: existing.entries });

  const updateRow = (rowId: string, patch: Partial<Row>) => setRows((current) => current.map((row) => (row.rowId === rowId ? { ...row, ...patch } : row)));
  const togglePlatform = (id: string) => setPlatforms((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving || errors.length > 0) return;
    // D44: a changed or removed code is a hard edit (D43). With the shared
    // workspace the impact preview counts the live names that would start
    // failing, per Rule; without it, or if the scan fails, a plain confirm.
    if (!isNew) {
      const newCodes = new Set(entries.map((entry) => entry.code));
      const lost = existing.entries.filter((entry) => !newCodes.has(entry.code));
      if (lost.length > 0) {
        const codes = lost.map((entry) => `"${entry.code}"`).join(', ');
        let message = `Names carrying the old code${lost.length > 1 ? 's' : ''} ${codes} will fail Check. Save anyway?`;
        if (scanner && dependents.length > 0) {
          setSaving(true);
          try {
            const impact = await scanner.previewImpact(existing.id, entries);
            const lines = impact.perRule.map((item) => `${item.ruleSetName} / ${item.ruleName}: ${item.wouldFail.toLocaleString()} of ${item.scanned.toLocaleString()} live names would fail${item.examples.length > 0 ? ` (e.g. ${item.examples.slice(0, 3).join(', ')})` : ''}`);
            const skips = impact.skipped.map((item) => `${item.ruleName}: not scanned (${item.reason})`);
            message = `${impact.total.toLocaleString()} live name${impact.total === 1 ? '' : 's'} would start failing Check if ${codes} ${lost.length > 1 ? 'are' : 'is'} changed.\n\n${[...lines, ...skips].join('\n')}\n\nSave anyway?`;
          } catch (cause) {
            message = `The impact could not be counted (${cause instanceof Error ? cause.message : 'scan failed'}). ${message}`;
          } finally {
            setSaving(false);
          }
        }
        if (!window.confirm(message)) return;
      }
    }
    setError('');
    setSaving(true);
    try {
      if (isNew) {
        const created = await onCreate(draft);
        onDone(created.id);
        return;
      }
      setBaseUpdatedAt(await onUpdate(existing.id, draft, baseUpdatedAt));
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Saving failed.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="rounded-xl border border-border/30 bg-card p-6 shadow-sm" data-testid="form-definition">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div><div className="flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-widest text-primary">{isNew ? 'New Global definition' : 'Edit Global definition'} <GlobalBadge small /></div><p className="mt-1 text-sm text-muted-foreground">Labels are what people pick; codes are what go into names.</p></div>
        <div className="flex items-center gap-2">
          {saved && <span className="mr-2 inline-flex items-center gap-1.5 text-xs font-semibold text-primary" data-testid="text-definition-saved"><Check className="h-4 w-4" /> {storeKind === 'firestore' ? 'Saved' : 'Saved locally'}</span>}
          {!isNew && <button type="button" className={buttonDanger} disabled={saving || dependents.length > 0} title={dependents.length > 0 ? 'In use by a Rule; move the Rule off it first.' : undefined} onClick={() => { if (window.confirm(`Delete the definition "${existing.name}"?`)) { void onDelete(existing.id); onDone(null); } }} data-testid="button-delete-definition"><Trash2 className="h-4 w-4" /> Delete</button>}
          {isNew && <button type="button" className={buttonQuiet} onClick={() => onDone(null)} data-testid="button-cancel-definition">Cancel</button>}
          <button type="submit" className={buttonPrimary} disabled={saving || errors.length > 0 || !isDirty} data-testid="button-save-definition"><Check className="h-4 w-4" /> {saving ? 'Saving' : 'Save definition'}</button>
        </div>
      </div>
      {stale && <div className="mb-4 rounded-[4px] border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900" data-testid="text-definition-stale">Someone else saved this definition since you opened it. <button type="button" className="underline" onClick={() => { setName(existing.name); setPlatforms(existing.platforms); setRows(rowsOf(existing.entries)); setBaseUpdatedAt(existing.updatedAt); setError(''); }}>Reload</button> to see their version, then reapply your edits.</div>}
      {error && <div className="mb-4 rounded-[4px] border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive" data-testid="text-definition-error">{error}</div>}

      <label className="block text-[13px] font-bold text-foreground">Name<input className={`${inputClass} mt-2`} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Market, Campaign objective" data-testid="input-definition-name" /></label>

      <fieldset className="mt-5"><legend className="text-[13px] font-bold text-foreground">Platforms <span className="ml-1 font-normal text-muted-foreground">(none ticked means every platform)</span></legend>
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">{offeredPlatforms(tenant, platforms).map((id) => <label key={id} className="inline-flex items-center gap-2 text-[13px] font-semibold text-foreground"><input type="checkbox" checked={platforms.includes(id)} onChange={() => togglePlatform(id)} className="h-4 w-4 rounded-sm border-gray-300 text-primary focus:ring-primary" data-testid={`checkbox-platform-${id}`} /> {platformName(id)}</label>)}</div>
      </fieldset>

      <div className="mt-6">
        <div className="mb-2 grid grid-cols-[1fr_1fr_40px] gap-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground"><span>Label (shown in dropdowns)</span><span>Code (written into names)</span><span /></div>
        <div className="flex flex-col gap-2">
          {rows.map((row, index) => (
            <div key={row.rowId} className="grid grid-cols-[1fr_1fr_40px] items-center gap-3" data-testid={`row-entry-${index}`}>
              <input className={inputClass} value={row.label} onChange={(event) => updateRow(row.rowId, { label: event.target.value })} placeholder="Awareness" aria-label={`Entry ${index + 1} label`} data-testid={`input-entry-label-${index}`} />
              <input className={`${inputClass} font-mono`} value={row.code} onChange={(event) => updateRow(row.rowId, { code: event.target.value })} placeholder="AWA" aria-label={`Entry ${index + 1} code`} data-testid={`input-entry-code-${index}`} />
              <button type="button" className={iconButton} onClick={() => setRows((current) => current.filter((item) => item.rowId !== row.rowId))} aria-label={`Remove entry ${index + 1}`} data-testid={`button-remove-entry-${index}`}><X className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
        <button type="button" className={`${buttonQuiet} mt-3`} onClick={() => setRows((current) => [...current, { rowId: newId(), label: '', code: '' }])} data-testid="button-add-entry"><Plus className="h-4 w-4" /> Add value</button>
      </div>

      {errors.length > 0 && <ul className="mt-5 list-disc space-y-1 pl-5 text-xs font-semibold text-destructive" data-testid="list-definition-errors">{errors.map((message) => <li key={message}>{message}</li>)}</ul>}
    </form>
  );
}

// ---- Member view and request form ------------------------------------------------

function DefinitionView({ definition, user, onCreateRequest }: { definition: Definition; user: User; onCreateRequest: (draft: ValueRequestDraft) => Promise<ValueRequest> }) {
  const [label, setLabel] = useState('');
  const [code, setCode] = useState('');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  // The same rules the admin's save applies, so a request that could never be
  // approved is refused here instead of wasting the admin's time.
  const proposal = { label: label.trim(), code: code.trim() };
  const collision = proposal.label && proposal.code ? checkDefinition({ ...definition, entries: [...definition.entries, proposal] }) : [];

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (sending || !proposal.label || !proposal.code || collision.length > 0) return;
    setSending(true);
    setError('');
    try {
      await onCreateRequest({ definitionId: definition.id, label: proposal.label, code: proposal.code, note: note.trim(), requestedByName: user.name, status: 'pending', reason: '' });
      setLabel(''); setCode(''); setNote('');
      setSent(true);
      window.setTimeout(() => setSent(false), 3000);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Sending the request failed.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="rounded-xl border border-border/30 bg-card p-6 shadow-sm" data-testid="view-definition">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><div className="font-display text-2xl font-medium text-foreground">{definition.name}</div><div className="mt-2"><PlatformChips platforms={definition.platforms} /></div></div><span className="text-[11px] font-bold text-muted-foreground">Updated {formatDate(definition.updatedAt)}</span></div>
      <table className="mt-5 w-full text-left text-[13px]"><thead><tr className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground"><th className="pb-2">Label</th><th className="pb-2">Code</th></tr></thead><tbody>
        {definition.entries.length === 0 && <tr><td colSpan={2} className="py-3 text-muted-foreground">No values yet.</td></tr>}
        {definition.entries.map((entry) => <tr key={entry.code} className="border-t border-border/40" data-testid={`row-value-${entry.code}`}><td className="py-2 font-semibold text-foreground">{entry.label}</td><td className="py-2 font-mono text-foreground">{entry.code}</td></tr>)}
      </tbody></table>

      <form onSubmit={submit} className="mt-6 border-t border-border/40 pt-5" data-testid="form-request">
        <div className="font-mono text-[10px] font-semibold uppercase tracking-widest text-primary">Request a new value</div>
        <p className="mt-1 text-xs text-muted-foreground">An admin reviews it and, once approved, it appears here for everyone.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-[13px] font-bold text-foreground">Label<input className={`${inputClass} mt-2`} value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Awareness" data-testid="input-request-label" /></label>
          <label className="text-[13px] font-bold text-foreground">Code<input className={`${inputClass} mt-2 font-mono`} value={code} onChange={(event) => setCode(event.target.value)} placeholder="AWA" data-testid="input-request-code" /></label>
        </div>
        <label className="mt-3 block text-[13px] font-bold text-foreground">Why it is needed <span className="font-normal text-muted-foreground">(optional)</span><input className={`${inputClass} mt-2`} value={note} onChange={(event) => setNote(event.target.value)} placeholder="New market launching in Q4" data-testid="input-request-note" /></label>
        {collision.length > 0 && <ul className="mt-3 list-disc space-y-1 pl-5 text-xs font-semibold text-destructive" data-testid="list-request-errors">{collision.map((message) => <li key={message}>{message}</li>)}</ul>}
        {error && <div className="mt-3 text-xs font-semibold text-destructive" data-testid="text-request-error">{error}</div>}
        <div className="mt-4 flex items-center gap-3"><button type="submit" className={buttonPrimary} disabled={sending || !proposal.label || !proposal.code || collision.length > 0} data-testid="button-submit-request">{sending ? 'Sending' : 'Submit request'}</button>{sent && <span className="text-xs font-semibold text-primary" data-testid="text-request-sent">Request sent</span>}</div>
      </form>
    </div>
  );
}

// ---- Requests ---------------------------------------------------------------------

function StatusBadge({ status }: { status: ValueRequest['status'] }) {
  const tone = status === 'approved' ? 'border-primary/30 bg-primary/10' : status === 'rejected' ? 'border-destructive/30 bg-destructive/10 text-destructive' : 'border-amber-300 bg-amber-50 text-amber-900';
  return <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${tone}`}>{status}</span>;
}

function RequestsPanel({ canEdit, definitions, requests, drafts, onUpdateDefinition, onUpdateRequest, onUpdateDraft }: { canEdit: boolean; definitions: Definition[]; requests: ValueRequest[]; drafts: BuildDraft[]; onUpdateDefinition: (id: string, draft: DefinitionDraft, baseUpdatedAt: string) => Promise<string>; onUpdateRequest: (id: string, draft: ValueRequestDraft, baseUpdatedAt: string) => Promise<string>; onUpdateDraft: (id: string, draft: BuildDraftDraft, baseUpdatedAt: string) => Promise<string> }) {
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const pending = requests.filter((request) => request.status === 'pending');
  const decided = requests.filter((request) => request.status !== 'pending').slice(0, 20);
  if (requests.length === 0 && !canEdit) return null;

  const approve = async (request: ValueRequest, definition: Definition) => {
    setBusy(request.id);
    setError('');
    try {
      // The entry goes into the definition first; if that save is refused the
      // request stays pending and nothing is half done.
      await onUpdateDefinition(definition.id, { name: definition.name, platforms: definition.platforms, entries: [...definition.entries, { label: request.label, code: request.code }] }, definition.updatedAt);
      await onUpdateRequest(request.id, { ...draftOf(request), status: 'approved' }, request.updatedAt);
      // The requester's Build draft, if any, can resume now (D42).
      const waiting = drafts.find((draft) => draft.requestId === request.id);
      if (waiting && waiting.status === 'blocked') {
        await onUpdateDraft(waiting.id, { ...buildDraftOf(waiting), status: 'ready' }, waiting.updatedAt);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Approving failed.');
    } finally {
      setBusy(null);
    }
  };

  const reject = async (request: ValueRequest) => {
    setBusy(request.id);
    setError('');
    try {
      await onUpdateRequest(request.id, { ...draftOf(request), status: 'rejected', reason: (reasons[request.id] ?? '').trim() }, request.updatedAt);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Rejecting failed.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="mt-10" data-testid="section-requests">
      <h2 className="font-display text-2xl font-medium tracking-tight text-foreground">{canEdit ? 'Requests' : 'Your requests'}</h2>
      <p className="mt-1.5 text-sm text-muted-foreground">{canEdit ? 'Values your team has asked for. Approving adds the value to its definition.' : 'What you have asked for and where it stands.'}</p>
      {error && <div className="mt-3 text-xs font-semibold text-destructive" data-testid="text-requests-error">{error}</div>}
      {pending.length === 0 && <p className="mt-4 text-xs font-semibold text-muted-foreground" data-testid="text-no-pending">No pending requests.</p>}
      <div className="mt-4 grid gap-3">
        {pending.map((request) => {
          const definition = definitions.find((item) => item.id === request.definitionId);
          const collision = definition ? checkDefinition({ ...definition, entries: [...definition.entries, { label: request.label, code: request.code }] }) : ['This definition no longer exists.'];
          return (
            <div key={request.id} className="rounded-xl border border-border/30 bg-card p-5" data-testid={`card-request-${request.id}`}>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div><div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{definition?.name ?? 'Unknown definition'}</div><div className="mt-1 font-display text-lg font-medium text-foreground">{request.label} <span className="font-mono text-sm text-muted-foreground">{request.code}</span></div>{request.note && <p className="mt-1 text-xs text-muted-foreground">{request.note}</p>}<div className="mt-2 text-[11px] font-semibold text-muted-foreground">{request.requestedByName}, {formatDate(request.createdAt)}{drafts.some((draft) => draft.requestId === request.id && draft.status !== 'done') && <span className="ml-2 rounded-full border border-border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider" data-testid={`badge-request-draft-${request.id}`}>Build waiting</span>}</div></div>
                <StatusBadge status={request.status} />
              </div>
              {canEdit && (
                <div className="mt-4 flex flex-col gap-3 border-t border-border/40 pt-4 sm:flex-row sm:items-center">
                  {collision.length > 0 && <ul className="list-disc pl-5 text-xs font-semibold text-destructive sm:mr-auto" data-testid={`list-request-collision-${request.id}`}>{collision.map((message) => <li key={message}>{message}</li>)}</ul>}
                  <div className="flex flex-1 items-center gap-2 sm:justify-end">
                    <input className={`${inputClass} sm:max-w-xs`} value={reasons[request.id] ?? ''} onChange={(event) => setReasons((current) => ({ ...current, [request.id]: event.target.value }))} placeholder="Reason, if rejecting" aria-label="Rejection reason" data-testid={`input-reject-reason-${request.id}`} />
                    <button type="button" className={buttonDanger} disabled={busy === request.id} onClick={() => void reject(request)} data-testid={`button-reject-request-${request.id}`}>Reject</button>
                    <button type="button" className={buttonPrimary} disabled={busy === request.id || !definition || collision.length > 0} onClick={() => definition && void approve(request, definition)} data-testid={`button-approve-request-${request.id}`}><Check className="h-4 w-4" /> Approve</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {decided.length > 0 && (
        <div className="mt-6"><div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Decided</div>
          <ul className="mt-2 divide-y divide-border/40 rounded-xl border border-border/30 bg-card">
            {decided.map((request) => <li key={request.id} className="flex flex-col gap-1 px-4 py-3 text-[13px] sm:flex-row sm:items-center sm:gap-4" data-testid={`row-request-${request.id}`}><span className="font-semibold text-foreground">{request.label} <span className="font-mono text-muted-foreground">{request.code}</span></span><span className="text-xs text-muted-foreground">{definitions.find((item) => item.id === request.definitionId)?.name ?? 'Unknown definition'}</span><span className="sm:ml-auto" data-testid={`text-request-status-${request.id}`}><StatusBadge status={request.status} /></span>{request.reason && <span className="text-xs text-muted-foreground">{request.reason}</span>}</li>)}
          </ul>
        </div>
      )}
    </section>
  );
}
