import { useState, useEffect } from 'react';
import { buildTrackingUrl, checkDefinition, compose, parse, resolveRule, NAME_VIOLATION_KEY, type Definition, type ParentLine, type Rule, type Segment } from '@taxo/shared';
import { AlertCircle, ArrowRight, Check, Clock, Copy, Database, Filter, Link2, Lock, Zap } from 'lucide-react';
import type { User } from '@/data/auth';
import type { BuildDraft, BuildDraftDraft, RuleSet, ValueRequest, ValueRequestDraft } from '@/data/store';
import { BatchBuilder } from './BatchBuilder';
import { ChildBatchBuilder } from './ChildBatchBuilder';
import { PageHeading } from './PageHeading';
import { EmptyState as SharedEmptyState } from './results';
import { SegmentChipRow } from './SegmentChipRow';
import { exampleSelections } from '@/lib/examples';
import { segmentMeta } from '@/lib/segment-meta';
import { buttonPrimary, buttonQuiet, inputClass } from './styles';

function EmptyState() {
  return (
    <SharedEmptyState
      icon={<Filter className="h-6 w-6" />}
      title="No Rule selected"
      body="Select a Rule Set and a Rule from the sidebar to start building a name."
    />
  );
}

// Feature 2: compose a compliant name from the Rule selected in the shell.
// onSelectRule: chaining ("Build <child> under this") is the one place the app
// changes the persistent Rule selection for the user, by an explicit action.
type BuilderProps = {
  ruleSet: RuleSet | undefined;
  rule: Rule | undefined;
  definitions: Definition[];
  onSelectRule: (id: string) => void;
  // v3 D42: requests for a missing value and the drafts that wait on them.
  user: User;
  requests: ValueRequest[];
  drafts: BuildDraft[];
  onCreateRequest: (draft: ValueRequestDraft) => Promise<ValueRequest>;
  onCreateDraft: (draft: BuildDraftDraft) => Promise<BuildDraft>;
  onUpdateDraft: (id: string, draft: BuildDraftDraft, baseUpdatedAt: string) => Promise<string>;
  onDeleteDraft: (id: string) => Promise<void>;
};

function buildDraftOf(draft: BuildDraft): BuildDraftDraft {
  return { ruleSetId: draft.ruleSetId, ruleId: draft.ruleId, selections: draft.selections, parentName: draft.parentName, blockedSegmentId: draft.blockedSegmentId, blockedSegmentKey: draft.blockedSegmentKey, requestId: draft.requestId, status: draft.status };
}

export function Builder({ ruleSet, rule, definitions, onSelectRule, user, requests, drafts, onCreateRequest, onCreateDraft, onUpdateDraft, onDeleteDraft }: BuilderProps) {
  const ruleSetId = ruleSet?.id;
  const ruleId = rule?.id;

  const [values, setValues] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);
  // The parent name each child Rule is being built under, kept per Rule so
  // switching Rules (or chaining from a parent) never loses it.
  const [parentNames, setParentNames] = useState<Record<string, string>>({});
  // A base URL typed at build time, per Rule, when the mapping allows editing.
  const [baseUrls, setBaseUrls] = useState<Record<string, string>>({});
  const [copiedUrl, setCopiedUrl] = useState(false);
  // Single is today's flow; Batch generates every combination as a CSV (phase 3).
  const [mode, setMode] = useState<'single' | 'batch'>('single');
  // Parent names carried from a parent-level batch into a child batch, per child Rule (D34).
  const [carried, setCarried] = useState<Record<string, ParentLine[]>>({});
  // The draft this build is, once a value has been requested or a draft resumed.
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [requesting, setRequesting] = useState<string | null>(null); // segment key with the form open
  const [requestLabel, setRequestLabel] = useState('');
  const [requestCode, setRequestCode] = useState('');
  const [requestNote, setRequestNote] = useState('');
  const [requestError, setRequestError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setValues({});
    setCopied(false);
    setActiveDraftId(null);
    setRequesting(null);
  }, [ruleSetId, ruleId]);

  if (!ruleSet || !rule) {
    return (
      <div>
        <PageHeading eyebrow="Workspace" title="Compose a name" description="Select a Rule Set and Rule, and fill the required segments to generate a compliant name." />
        <EmptyState />
      </div>
    );
  }

  // Build works on the resolved Rule: parent segments inherited and shared
  // definitions filled in (D46). A Rule that cannot be resolved cannot be built.
  const resolution = resolveRule(rule, ruleSet, definitions);
  if (resolution.errors.length > 0) {
    return (
      <div>
        <PageHeading eyebrow="Workspace" title="Compose a name" description={`${rule.name} cannot be built until Author fixes the problems below.`} />
        <ul className="list-disc rounded-xl border border-destructive/30 bg-destructive/10 py-4 pl-9 pr-4 text-sm font-semibold text-destructive" data-testid="text-build-resolution-errors">{resolution.errors.map((message) => <li key={message}>{message}</li>)}</ul>
      </div>
    );
  }
  const active = resolution.rule;
  const segments = active.segments ?? [];

  // The parent step (v2 Journey 2): a child Rule is built under a parent name,
  // pasted or carried across from a build of the parent. The name is parsed
  // against the resolved parent; its inherited selections fill and lock the
  // child's inherited controls. A parent name that fails validation stops the
  // flow with the parent's violations shown.
  const parentRule = rule.parent ? ruleSet.rules.find((candidate) => candidate.id === rule.parent?.ruleId) : undefined;
  const resolvedParent = parentRule ? resolveRule(parentRule, ruleSet, definitions).rule : undefined;
  const parentName = parentNames[rule.id] ?? '';
  const parentParse = resolvedParent ? parse(resolvedParent, parentName) : undefined;
  const inheritedIds = new Set(rule.parent?.inheritSegmentIds ?? []);
  const inheritedKeys = new Set(segments.filter((segment) => inheritedIds.has(segment.id)).map((segment) => segment.key));
  const inheritedValues: Record<string, string> = {};
  if (parentParse?.valid) {
    for (const key of inheritedKeys) {
      if (parentParse.selections[key] !== undefined) inheritedValues[key] = parentParse.selections[key];
    }
  }
  const parentReady = !rule.parent || Boolean(parentName && parentParse?.valid);
  // An example parent name, from compose over sample values.
  const parentExample = resolvedParent ? compose(resolvedParent, exampleSelections(resolvedParent)).name : '';
  const meta = segmentMeta(rule, ruleSet);
  const children = ruleSet.rules.filter((candidate) => candidate.parent?.ruleId === rule.id);

  const selections = { ...values, ...inheritedValues };
  const result = compose(active, selections);
  const blockedKeyPlaceholder = drafts.some((draft) => draft.id === activeDraftId && draft.status === 'blocked');
  const valid = parentReady && result.errors.length === 0 && Boolean(segments.length) && !blockedKeyPlaceholder;
  const displayOutput = result.name || 'Fill segments to generate a name';
  const missing = segments.filter((segment) => segment.required && !selections[segment.key]?.trim());
  const copyName = async () => { if (!valid) return; await navigator.clipboard?.writeText(result.name); setCopied(true); window.setTimeout(() => setCopied(false), 1800); };
  // D42: the active draft and the segment it blocks. While the request is
  // pending (or was rejected) the segment is locked and the name cannot be
  // copied; an approved request makes the draft ready to resume.
  const activeDraft = drafts.find((draft) => draft.id === activeDraftId && draft.status !== 'done');
  const activeRequest = activeDraft ? requests.find((request) => request.id === activeDraft.requestId) : undefined;
  const blockedKey = activeDraft && activeDraft.status === 'blocked' ? activeDraft.blockedSegmentKey : null;
  const myDrafts = drafts.filter((draft) => draft.ruleId === rule.id && draft.createdBy === user.uid && draft.status !== 'done');

  const openRequest = (segment: Segment) => {
    setRequesting(segment.key);
    setRequestLabel(''); setRequestCode(''); setRequestNote(''); setRequestError('');
  };
  // Which shared definition a segment reads, from the stored Rule (the
  // resolved one no longer says).
  const definitionFor = (segment: Segment): Definition | undefined => {
    const stored = rule.segments.find((item) => item.id === segment.id);
    const definitionId = stored && stored.kind === 'enum' ? stored.definitionId : undefined;
    return definitionId ? definitions.find((definition) => definition.id === definitionId) : undefined;
  };
  const submitRequest = async (segment: Segment) => {
    const definition = definitionFor(segment);
    if (!definition || busy) return;
    const proposal = { label: requestLabel.trim(), code: requestCode.trim() };
    const collision = checkDefinition({ ...definition, entries: [...definition.entries, proposal] });
    if (!proposal.label || !proposal.code) { setRequestError('A label and a code are needed.'); return; }
    if (collision.length > 0) { setRequestError(collision[0]); return; }
    setBusy(true);
    setRequestError('');
    try {
      const request = await onCreateRequest({ definitionId: definition.id, label: proposal.label, code: proposal.code, note: requestNote.trim(), requestedByName: user.name, status: 'pending', reason: '' });
      const draft = await onCreateDraft({ ruleSetId: ruleSet.id, ruleId: rule.id, selections: values, parentName, blockedSegmentId: segment.id, blockedSegmentKey: segment.key, requestId: request.id, status: 'blocked' });
      setActiveDraftId(draft.id);
      setRequesting(null);
    } catch (cause) {
      setRequestError(cause instanceof Error ? cause.message : 'Sending the request failed.');
    } finally {
      setBusy(false);
    }
  };
  const resumeDraft = async (draft: BuildDraft) => {
    const request = requests.find((item) => item.id === draft.requestId);
    setValues(draft.status === 'ready' && request ? { ...draft.selections, [draft.blockedSegmentKey]: request.code } : draft.selections);
    if (draft.parentName) setParentNames((current) => ({ ...current, [rule.id]: draft.parentName }));
    if (draft.status === 'ready') {
      // The approved value is in the definition now; the draft has done its job.
      setActiveDraftId(null);
      await onUpdateDraft(draft.id, { ...buildDraftOf(draft), status: 'done' }, draft.updatedAt);
    } else {
      setActiveDraftId(draft.id);
    }
  };
  const discardDraft = async (draft: BuildDraft) => {
    if (!window.confirm('Discard this draft? The request stays with the admins.')) return;
    if (activeDraftId === draft.id) setActiveDraftId(null);
    await onDeleteDraft(draft.id);
  };

  // Step 8: the tracking URL, from the built names of this Rule and its parent
  // (the parent step's name), the selections and the base URL in use.
  const mapping = active.utm;
  const names: Record<string, string> = {};
  if (valid) names[rule.id] = result.name;
  if (parentRule && parentParse?.valid) names[parentRule.id] = parentName;
  const baseUrl = mapping ? (mapping.baseUrlEditable ? (baseUrls[rule.id] ?? mapping.baseUrl ?? '') : (mapping.baseUrl ?? '')) : '';
  const tracking = mapping && valid ? buildTrackingUrl(active, ruleSet, { names, selections, baseUrl }) : undefined;
  const copyUrl = async () => { if (!tracking?.url) return; await navigator.clipboard?.writeText(tracking.url); setCopiedUrl(true); window.setTimeout(() => setCopiedUrl(false), 1800); };

  const buildChild = (childId: string) => {
    setParentNames((current) => ({ ...current, [childId]: result.name }));
    onSelectRule(childId);
  };
  const carryToChild = (childId: string, lines: ParentLine[]) => {
    setCarried((current) => ({ ...current, [childId]: lines }));
    setMode('batch');
    onSelectRule(childId);
  };

  return (
    <div>
      <PageHeading eyebrow="Workspace" title="Compose a name" description={mode === 'single' ? 'Fill the required segments to generate a compliant name.' : 'Pick the values to combine and generate every name at once.'} action={<div className="inline-flex rounded-[4px] border border-border bg-card p-0.5" role="group" aria-label="Build mode">{(['single', 'batch'] as const).map((item) => <button key={item} type="button" className={`rounded-[3px] px-3 py-1.5 text-[12px] font-bold capitalize transition ${mode === item ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`} onClick={() => setMode(item)} aria-pressed={mode === item} data-testid={`button-build-mode-${item}`}>{item}</button>)}</div>} />
      {mode === 'batch' ? (rule.parent && resolvedParent
        ? <ChildBatchBuilder rule={rule} active={active} parentRule={resolvedParent} ruleSet={ruleSet} baseUrl={baseUrl} carried={carried[rule.id] ?? []} />
        : <BatchBuilder rule={rule} active={active} ruleSet={ruleSet} inheritedValues={inheritedValues} parentName={parentName} baseUrl={baseUrl} children={children} onCarry={carryToChild} />) : (
      <div className="grid gap-6 xl:grid-cols-[1.2fr_.8fr]">
        <section className="rounded-xl bg-card p-6 shadow-sm border border-border/30">
          <div className="mb-8 flex items-start justify-between gap-4">
            <div className="flex flex-col">
              <div className="font-display text-2xl font-medium text-foreground">Naming parameters</div>
              <p className="text-[13px] font-bold text-muted-foreground mt-1">Values for {rule.name}.</p>
            </div>
            <div className="flex h-5 w-5 items-center justify-center rounded-full border border-muted-foreground/30 text-muted-foreground"><Zap className="h-3 w-3" /></div>
          </div>

          {rule.parent && parentRule && (
            <div className="mb-6 rounded-lg border border-border/50 bg-muted/20 p-4" data-testid="section-build-parent">
              <label htmlFor="build-parent" className="text-[13px] font-bold text-foreground">Under {parentRule.name}:<span className="ml-2 font-normal text-muted-foreground">paste the {parentRule.name.toLowerCase()} name this belongs to</span></label>
              <input id="build-parent" className={`${inputClass} mt-2 font-mono`} value={parentName} onChange={(event) => setParentNames((current) => ({ ...current, [rule.id]: event.target.value }))} placeholder={parentExample ? `e.g. ${parentExample}` : undefined} data-testid="input-build-parent" />
              {parentName && parentParse && !parentParse.valid && (
                <ul className="mt-3 list-disc pl-5 text-xs font-semibold text-destructive" data-testid="status-build-parent-violations">{parentParse.violations.map((violation) => <li key={`${violation.segmentKey}-${violation.reason}`}>{violation.segmentKey === NAME_VIOLATION_KEY ? violation.reason : `${violation.segmentKey}: ${violation.reason}`}</li>)}</ul>
              )}
              {!parentName && <div className="mt-2 flex flex-col gap-2"><p className="text-[11px] font-bold text-muted-foreground">The inherited segments fill in from the {parentRule.name.toLowerCase()} name. For example:</p>{resolvedParent && <SegmentChipRow rule={resolvedParent} meta={segmentMeta(parentRule, ruleSet)} mode="example" compact testId="chips-build-parent-example" />}</div>}
              {parentParse?.valid && <p className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-bold text-primary" data-testid="text-build-parent-ok"><Check className="h-3.5 w-3.5" /> Valid {parentRule.name.toLowerCase()} name; inherited segments locked.</p>}
            </div>
          )}

          <div className="space-y-5" hidden={!parentReady} data-testid="section-build-segments">
            {segments.map((segment: Segment) => (
              <div key={segment.id}>
                <div className="mb-2.5 flex items-center justify-between">
                  <label htmlFor={`build-${segment.key}`} className="text-[13px] font-bold text-foreground">
                    {segment.label}:<span className="ml-2 font-mono text-[10px] font-normal text-muted-foreground">{segment.key}</span>
                  </label>
                  {inheritedKeys.has(segment.key) ? <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2 py-0.5" data-testid={`badge-inherited-${segment.key}`}><Lock className="h-3 w-3 text-muted-foreground" /><span className="text-[10px] font-bold text-foreground">Inherited</span></span> : segment.required ? <span className="inline-flex items-center gap-1.5 rounded-full border border-destructive/50 bg-destructive/10 px-2 py-0.5"><span className="h-2 w-2 rounded-full bg-destructive" /><span className="text-[10px] font-bold text-foreground">Required</span></span> : <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/30 px-2 py-0.5"><span className="h-2 w-2 rounded-full bg-muted-foreground" /><span className="text-[10px] font-bold text-foreground">Optional</span></span>}
                </div>
                {segment.kind === 'enum' ? (
                  <select
                    id={`build-${segment.key}`}
                    className={inputClass}
                    value={selections[segment.key] ?? ''}
                    disabled={inheritedKeys.has(segment.key) || blockedKey === segment.key}
                    title={inheritedKeys.has(segment.key) ? `From the ${parentRule?.name ?? 'parent'} name` : blockedKey === segment.key ? 'Waiting for an admin to approve the requested value' : undefined}
                    onChange={(event) => setValues((current) => ({ ...current, [segment.key]: event.target.value }))}
                    data-testid={`select-build-${segment.key}`}
                  >
                    <option value="">Select {segment.label.toLowerCase()}</option>
                    {/* The label is what the builder sees; the code is what goes into the name. */}
                    {segment.allowedValues.map((entry) => <option key={entry.code} value={entry.code}>{entry.label === entry.code ? entry.label : `${entry.label} (${entry.code})`}</option>)}
                  </select>
                ) : (
                  <input
                    id={`build-${segment.key}`}
                    className={inputClass}
                    maxLength={segment.maxLength}
                    value={selections[segment.key] ?? ''}
                    disabled={inheritedKeys.has(segment.key)}
                    title={inheritedKeys.has(segment.key) ? `From the ${parentRule?.name ?? 'parent'} name` : undefined}
                    onChange={(event) => setValues((current) => ({ ...current, [segment.key]: event.target.value }))}
                    placeholder={`Enter ${segment.label.toLowerCase()}`}
                    data-testid={`input-build-${segment.key}`}
                  />
                )}
                {blockedKey === segment.key && activeRequest && (
                  <div className="mt-2 rounded-[4px] border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] font-semibold text-amber-900" data-testid={`status-build-blocked-${segment.key}`}>
                    <span className="inline-flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> {activeRequest.status === 'rejected' ? `Your request for "${activeRequest.label}" (${activeRequest.code}) was rejected${activeRequest.reason ? `: ${activeRequest.reason}` : '.'}` : `Waiting for an admin to approve "${activeRequest.label}" (${activeRequest.code}). This build is saved as a draft.`}</span>
                    {activeDraft && <button type="button" className="ml-3 underline" onClick={() => void discardDraft(activeDraft)} data-testid="button-discard-draft">Discard draft</button>}
                  </div>
                )}
                {segment.kind === 'enum' && !inheritedKeys.has(segment.key) && blockedKey !== segment.key && definitionFor(segment) && (
                  requesting === segment.key ? (
                    <div className="mt-3 rounded-lg border border-border/50 bg-muted/20 p-4" data-testid={`form-request-${segment.key}`}>
                      <div className="text-[12px] font-bold text-foreground">Request a value for {segment.label}</div>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <input className={inputClass} value={requestLabel} onChange={(event) => setRequestLabel(event.target.value)} placeholder="Label, e.g. Germany" aria-label="Requested label" data-testid={`input-request-label-${segment.key}`} />
                        <input className={`${inputClass} font-mono`} value={requestCode} onChange={(event) => setRequestCode(event.target.value)} placeholder="Code, e.g. de" aria-label="Requested code" data-testid={`input-request-code-${segment.key}`} />
                      </div>
                      <input className={`${inputClass} mt-2`} value={requestNote} onChange={(event) => setRequestNote(event.target.value)} placeholder="Why it is needed (optional)" aria-label="Note" data-testid={`input-request-note-${segment.key}`} />
                      {requestError && <p className="mt-2 text-[12px] font-semibold text-destructive" data-testid={`text-request-error-${segment.key}`}>{requestError}</p>}
                      <div className="mt-3 flex gap-2"><button type="button" className={buttonPrimary} disabled={busy} onClick={() => void submitRequest(segment)} data-testid={`button-submit-request-${segment.key}`}>{busy ? 'Sending' : 'Send request and save draft'}</button><button type="button" className={buttonQuiet} onClick={() => setRequesting(null)}>Cancel</button></div>
                    </div>
                  ) : (
                    <button type="button" className="mt-2 text-[12px] font-bold text-primary underline-offset-2 hover:underline" onClick={() => openRequest(segment)} data-testid={`button-request-value-${segment.key}`}>Value missing? Request it</button>
                  )
                )}
              </div>
            ))}
          </div>
          {myDrafts.length > 0 && (
            <div className="mt-6 rounded-lg border border-border/50 bg-muted/20 p-4" data-testid="section-build-drafts">
              <div className="text-[12px] font-bold text-foreground">Your drafts for {rule.name}</div>
              <ul className="mt-2 flex flex-col gap-2">
                {myDrafts.map((draft) => {
                  const request = requests.find((item) => item.id === draft.requestId);
                  const label = request ? `"${request.label}" (${request.code})` : 'a value';
                  return (
                    <li key={draft.id} className="flex flex-col gap-2 rounded-[4px] bg-card px-3 py-2 text-[12px] sm:flex-row sm:items-center sm:justify-between" data-testid={`row-draft-${draft.id}`}>
                      <span className="flex flex-col gap-1.5 font-semibold text-foreground">{Object.values(draft.selections).some(Boolean) ? <SegmentChipRow rule={active} meta={meta} mode="values" selections={draft.selections} compact testId={`chips-draft-${draft.id}`} /> : 'Nothing chosen yet'} <span className="font-normal text-muted-foreground" data-testid={`text-draft-status-${draft.id}`}>{draft.status === 'ready' ? `${label} approved, ready to resume` : request?.status === 'rejected' ? `${label} rejected${request.reason ? `: ${request.reason}` : ''}` : `waiting for ${label}`}</span></span>
                      <span className="flex gap-2"><button type="button" className={buttonQuiet} onClick={() => void resumeDraft(draft)} data-testid={`button-resume-draft-${draft.id}`}>{draft.status === 'ready' ? 'Resume' : 'Open'}</button><button type="button" className={buttonQuiet} onClick={() => void discardDraft(draft)} data-testid={`button-delete-draft-${draft.id}`}>Discard</button></span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>
        <section className="self-start xl:sticky xl:top-[92px]">
          <div className="overflow-hidden rounded-xl bg-card p-6 shadow-sm border border-border/30">
            <div className="flex items-center justify-between">
              <div className="font-display text-2xl font-medium text-foreground">Output</div>
              {valid ? <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5"><span className="h-2 w-2 rounded-full bg-primary" /><span className="text-[10px] font-bold text-foreground">Compliant</span></div> : <div className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/30 px-2 py-0.5"><span className="h-2 w-2 rounded-full bg-muted-foreground" /><span className="text-[10px] font-bold text-foreground">Incomplete</span></div>}
            </div>
            <div className="mt-6"><SegmentChipRow rule={active} meta={meta} mode="values" selections={selections} badges={false} testId="chips-build-output" /></div>
            <div className="my-6 break-all font-mono text-xl leading-relaxed text-primary sm:text-2xl" data-testid="text-build-preview">{displayOutput}</div>
            <div className="border-t border-border/50 pt-5">
              <div className="flex items-center justify-between text-[11px] font-bold text-muted-foreground">
                <span>{valid ? 'Name is compliant' : `${missing.length} required segment${missing.length === 1 ? '' : 's'} remaining`}</span>
                <span className="font-mono">{segments.length - missing.length}/{segments.length}</span>
              </div>
              <button type="button" className={`${buttonPrimary} mt-5 w-full`} disabled={!valid} onClick={copyName} data-testid="button-copy-build-name">
                {copied ? <><Check className="h-4 w-4" /> Copied</> : <><Copy className="h-4 w-4" /> Copy name</>}
              </button>
              {children.length > 0 && (
                <div className="mt-4 flex flex-col gap-2" data-testid="section-build-children">
                  {children.map((child) => <button key={child.id} type="button" className={`${buttonQuiet} w-full justify-between`} disabled={!valid} onClick={() => buildChild(child.id)} data-testid={`button-build-child-${child.id}`}>Build {child.name} under this <ArrowRight className="h-4 w-4" /></button>)}
                </div>
              )}
            </div>
          </div>
          {mapping && (
            <div className="mt-4 rounded-xl bg-card p-6 shadow-sm border border-border/30" data-testid="section-build-url">
              <div className="flex items-center gap-2 font-display text-xl font-medium text-foreground"><Link2 className="h-4 w-4 text-muted-foreground" /> Tracking URL</div>
              <label className="mt-4 block text-[11px] font-bold text-muted-foreground">Base URL<input className={`${inputClass} mt-1.5 font-mono`} value={baseUrl} disabled={!mapping.baseUrlEditable} title={mapping.baseUrlEditable ? undefined : 'Fixed by the Rule'} onChange={(event) => setBaseUrls((current) => ({ ...current, [rule.id]: event.target.value }))} placeholder="https://www.example.com/landing" data-testid="input-build-base-url" /></label>
              {!valid && <p className="mt-3 text-[11px] font-bold text-muted-foreground">Complete the name first.</p>}
              {tracking && (
                <>
                  <ul className="mt-4 flex flex-col gap-1.5" data-testid="list-build-utm">
                    {tracking.values.map((value) => <li key={value.param} className="flex flex-col gap-0.5 text-[12px]"><span><span className="font-mono font-bold text-foreground">utm_{value.param}</span> <span className="font-mono text-primary">{value.value || '(empty)'}</span></span>{value.errors.map((message) => <span key={message} className="font-semibold text-destructive">{message}</span>)}</li>)}
                  </ul>
                  {tracking.errors.length > 0 && <ul className="mt-3 list-disc pl-5 text-[12px] font-semibold text-destructive" data-testid="status-build-url-errors">{tracking.errors.map((message) => <li key={message}>{message}</li>)}</ul>}
                  {tracking.url && <div className="mt-4 break-all rounded-[4px] bg-muted/40 p-3 font-mono text-[12px] text-foreground" data-testid="text-build-url">{tracking.url}</div>}
                  <button type="button" className={`${buttonQuiet} mt-4 w-full`} disabled={!tracking.url} onClick={copyUrl} data-testid="button-copy-build-url">{copiedUrl ? <><Check className="h-4 w-4" /> Copied</> : <><Copy className="h-4 w-4" /> Copy URL</>}</button>
                </>
              )}
            </div>
          )}
          {result.errors.length > 0 && (
            <div className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 p-5 text-[13px] font-bold text-destructive shadow-sm" data-testid="status-build-violations">
              <div className="flex items-center gap-2"><AlertCircle className="h-4 w-4" /> Validation error</div>
              <p className="mt-1.5 leading-relaxed opacity-90">{result.errors.join(' ')}</p>
            </div>
          )}
          <div className="mt-4 rounded-xl border border-border/50 bg-muted/20 p-5 text-[13px] font-bold leading-relaxed text-muted-foreground shadow-sm">
            <div className="flex items-center gap-2 text-foreground"><Database className="h-4 w-4" /> Rule source</div>
            <p className="mt-1.5">Evaluating against <span className="font-mono text-[11px] text-foreground font-bold">{ruleSet.name} - {rule.name}</span>.</p>
          </div>
        </section>
      </div>
      )}
    </div>
  );
}
