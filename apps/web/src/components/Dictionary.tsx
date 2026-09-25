import { useEffect, useState, type FormEvent } from 'react';
import { BookOpen, Check, Plus, Trash2, X } from 'lucide-react';
import { checkDefinition, platformName, PLATFORMS, type EnumEntry } from '@taxo/shared';
import type { User } from '@/data/auth';
import type { Definition, DefinitionDraft, Store, Tenant, ValueRequest, ValueRequestDraft } from '@/data/store';
import { newId } from '@/lib/ids';
import { PageHeading } from './PageHeading';
import { buttonDanger, buttonPrimary, buttonQuiet, iconButton, inputClass } from './styles';

// The Dictionary: the tenant's shared definitions (v3 D37), visible to every
// member. Admins create and edit them here; standard users read them and
// request a new value (D41), which an admin approves or rejects here too.
// Drafts and Build blocking (D42) are phase 5.

type DictionaryProps = {
  user: User;
  canEdit: boolean;
  definitions: Definition[];
  requests: ValueRequest[];
  tenant: Tenant | null;
  storeKind: Store['kind'];
  onCreateDefinition: (draft: DefinitionDraft) => Promise<Definition>;
  onUpdateDefinition: (id: string, draft: DefinitionDraft, baseUpdatedAt: string) => Promise<string>;
  onDeleteDefinition: (id: string) => Promise<void>;
  onCreateRequest: (draft: ValueRequestDraft) => Promise<ValueRequest>;
  onUpdateRequest: (id: string, draft: ValueRequestDraft, baseUpdatedAt: string) => Promise<string>;
};

const NEW = 'new';

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
  return { definitionId: request.definitionId, label: request.label, code: request.code, note: request.note, requestedByName: request.requestedByName, status: request.status, reason: request.reason };
}

export function Dictionary(props: DictionaryProps) {
  const { user, canEdit, definitions, requests, tenant, storeKind, onCreateDefinition, onUpdateDefinition, onDeleteDefinition, onCreateRequest, onUpdateRequest } = props;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = definitions.find((definition) => definition.id === selectedId);

  // A deleted or never-selected definition falls back to the first one.
  useEffect(() => {
    if (selectedId === NEW) return;
    if (!selected && definitions.length > 0) setSelectedId(definitions[0].id);
    if (!selected && definitions.length === 0) setSelectedId(null);
  }, [selected, selectedId, definitions]);

  const sorted = [...definitions].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div>
      <PageHeading eyebrow="Shared definitions" title="Dictionary" description={canEdit ? 'The values every Rule Set in this workspace can share. Add definitions, set their codes and platforms, and handle requests from your team.' : 'The values every Rule Set in this workspace shares. If a value you need is missing, request it and an admin will add it.'} action={canEdit ? <button type="button" className={buttonPrimary} onClick={() => setSelectedId(NEW)} data-testid="button-create-definition"><Plus className="h-4 w-4" /> New definition</button> : undefined} />

      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        <nav className="flex flex-col gap-2" aria-label="Definitions" data-testid="list-definitions">
          {sorted.length === 0 && selectedId !== NEW && <div className="rounded-xl border border-dashed border-border bg-card/50 px-5 py-8 text-center text-xs text-muted-foreground"><BookOpen className="mx-auto mb-2 h-5 w-5" />{canEdit ? 'No definitions yet. Create the first one.' : 'No shared definitions yet. A workspace admin creates them.'}</div>}
          {sorted.map((definition) => (
            <button key={definition.id} type="button" onClick={() => setSelectedId(definition.id)} className={`w-full rounded-xl border p-4 text-left transition ${definition.id === selectedId ? 'border-primary/50 bg-card shadow-md' : 'border-border/30 bg-card hover:border-primary/40'}`} data-testid={`card-definition-${definition.id}`}>
              <div className="font-display text-lg font-medium text-foreground">{definition.name}</div>
              <div className="mt-1.5 flex items-center justify-between gap-2"><PlatformChips platforms={definition.platforms} /><span className="text-[11px] font-bold text-muted-foreground">{definition.entries.length} {definition.entries.length === 1 ? 'value' : 'values'}</span></div>
            </button>
          ))}
        </nav>

        <div>
          {selectedId === NEW && canEdit && <DefinitionEditor key="new" existing={null} tenant={tenant} storeKind={storeKind} onCreate={onCreateDefinition} onUpdate={onUpdateDefinition} onDelete={onDeleteDefinition} onDone={(id) => setSelectedId(id)} />}
          {selected && canEdit && <DefinitionEditor key={selected.id} existing={selected} tenant={tenant} storeKind={storeKind} onCreate={onCreateDefinition} onUpdate={onUpdateDefinition} onDelete={onDeleteDefinition} onDone={(id) => setSelectedId(id)} />}
          {selected && !canEdit && <DefinitionView key={selected.id} definition={selected} user={user} onCreateRequest={onCreateRequest} />}
          {!selected && selectedId !== NEW && <div className="rounded-xl border border-dashed border-border bg-card/50 px-6 py-12 text-center text-sm text-muted-foreground">Select a definition to see its values.</div>}
        </div>
      </div>

      <RequestsPanel canEdit={canEdit} definitions={definitions} requests={requests} onUpdateDefinition={onUpdateDefinition} onUpdateRequest={onUpdateRequest} />
    </div>
  );
}

// ---- Admin editor ---------------------------------------------------------------

type Row = { rowId: string; label: string; code: string };

function rowsOf(entries: EnumEntry[]): Row[] {
  return entries.map((entry) => ({ rowId: newId(), label: entry.label, code: entry.code }));
}

function DefinitionEditor({ existing, tenant, storeKind, onCreate, onUpdate, onDelete, onDone }: { existing: Definition | null; tenant: Tenant | null; storeKind: Store['kind']; onCreate: (draft: DefinitionDraft) => Promise<Definition>; onUpdate: (id: string, draft: DefinitionDraft, baseUpdatedAt: string) => Promise<string>; onDelete: (id: string) => Promise<void>; onDone: (id: string | null) => void }) {
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
  const isDirty = isNew || JSON.stringify(draft) !== JSON.stringify({ name: existing.name, platforms: existing.platforms, entries: existing.entries });

  const updateRow = (rowId: string, patch: Partial<Row>) => setRows((current) => current.map((row) => (row.rowId === rowId ? { ...row, ...patch } : row)));
  const togglePlatform = (id: string) => setPlatforms((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving || errors.length > 0) return;
    // D44 as amended at G0: a changed or removed code is a hard edit; confirm
    // in plain words until the phase 4 scan can count the names affected.
    if (!isNew) {
      const newCodes = new Set(entries.map((entry) => entry.code));
      const lost = existing.entries.filter((entry) => !newCodes.has(entry.code));
      if (lost.length > 0 && !window.confirm(`Names carrying the old code${lost.length > 1 ? 's' : ''} ${lost.map((entry) => `"${entry.code}"`).join(', ')} will fail Check. Save anyway?`)) return;
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
        <div><div className="font-mono text-[10px] font-semibold uppercase tracking-widest text-primary">{isNew ? 'New definition' : 'Edit definition'}</div><p className="mt-1 text-sm text-muted-foreground">Labels are what people pick; codes are what go into names.</p></div>
        <div className="flex items-center gap-2">
          {saved && <span className="mr-2 inline-flex items-center gap-1.5 text-xs font-semibold text-primary" data-testid="text-definition-saved"><Check className="h-4 w-4" /> {storeKind === 'firestore' ? 'Saved' : 'Saved locally'}</span>}
          {!isNew && <button type="button" className={buttonDanger} disabled={saving} onClick={() => { if (window.confirm(`Delete the definition "${existing.name}"?`)) { void onDelete(existing.id); onDone(null); } }} data-testid="button-delete-definition"><Trash2 className="h-4 w-4" /> Delete</button>}
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

function RequestsPanel({ canEdit, definitions, requests, onUpdateDefinition, onUpdateRequest }: { canEdit: boolean; definitions: Definition[]; requests: ValueRequest[]; onUpdateDefinition: (id: string, draft: DefinitionDraft, baseUpdatedAt: string) => Promise<string>; onUpdateRequest: (id: string, draft: ValueRequestDraft, baseUpdatedAt: string) => Promise<string> }) {
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
                <div><div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{definition?.name ?? 'Unknown definition'}</div><div className="mt-1 font-display text-lg font-medium text-foreground">{request.label} <span className="font-mono text-sm text-muted-foreground">{request.code}</span></div>{request.note && <p className="mt-1 text-xs text-muted-foreground">{request.note}</p>}<div className="mt-2 text-[11px] font-semibold text-muted-foreground">{request.requestedByName}, {formatDate(request.createdAt)}</div></div>
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
