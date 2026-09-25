import { type FormEvent, useState, useEffect } from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BookOpen,
  Check,
  CheckCircle2,
  Database,
  Lock,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { checkRuleSet, entriesFromCodes, entryFromCode, isPlatform, PLATFORMS, type Definition, type EnumEntry, type FreeformSegment, type Rule, type Segment, type Tags } from '@taxo/shared';
import { Link } from 'wouter';
import type { RuleSet, RuleSetDraft, Store } from '@/data/store';
import { newId } from '@/lib/ids';
import { buttonDanger, buttonPrimary, buttonQuiet, iconButton, inputClass } from './styles';

// Editable slug derived from a display name. Keys are lowercase by convention;
// enum values are not touched, they match exactly and case-sensitively.
function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
}

// A cleared definitionId leaves the segment rather than lingering as undefined.
function mergeSegment(segment: Segment, updates: Partial<Segment>): Segment {
  const merged = { ...segment, ...updates } as Segment;
  if (merged.kind === 'enum' && merged.definitionId === undefined) delete merged.definitionId;
  return merged;
}

function emptyRule(index: number): Rule {
  return { id: newId(), key: `rule_${index + 1}`, name: `Rule ${index + 1}`, delimiter: '-', segments: [emptySegment(0)], source: { dataset: 'marketing', table: 'campaign_values', nameColumn: 'name' } };
}

function emptySegment(index: number): FreeformSegment {
  return { id: newId(), kind: 'freeform', key: `segment_${index + 1}`, label: `Segment ${index + 1}`, required: true, maxLength: 32, illegalChars: [' ', '/', '?', '#', '&'] };
}

// Drop empty tag values so a Rule with neither carries no tags object at all.
function cleanTags(tags: Tags): Tags | undefined {
  const next: Tags = {};
  if (tags.platform?.trim()) next.platform = tags.platform.trim();
  if (tags.entityType?.trim()) next.entityType = tags.entityType.trim();
  return Object.keys(next).length ? next : undefined;
}

function parseList(text: string): string[] {
  return text.split(',').map((value) => value.trim()).filter(Boolean);
}

// The editor still takes enum values as one comma list of codes. A code that
// already has an entry keeps its label; a new code gets itself as its label.
// Labels get their own control with the shared definitions (v3 phase 2).
function entriesFromCodeList(codes: string[], existing: EnumEntry[]): EnumEntry[] {
  return codes.map((code) => existing.find((entry) => entry.code === code) ?? entryFromCode(code));
}

// A comma-separated list bound to a string[] in state. Keeps its own text while
// the user types so a trailing comma or space survives the next render; only
// resyncs from the list when the list changed by other means (a kind switch).
function CommaListInput({ value, onChange, className, placeholder, testId }: { value: string[]; onChange: (list: string[]) => void; className: string; placeholder?: string; testId: string }) {
  const [draft, setDraft] = useState(() => value.join(', '));

  useEffect(() => {
    if (JSON.stringify(parseList(draft)) !== JSON.stringify(value)) {
      setDraft(value.join(', '));
    }
  }, [value]);

  return <input className={className} value={draft} onChange={(event) => { setDraft(event.target.value); onChange(parseList(event.target.value)); }} placeholder={placeholder} data-testid={testId} />;
}

// definitions and platform: the shared definitions an enum segment may take
// its values from, filtered to those on the Rule's platform (a definition with
// no platforms fits every Rule; a scoped one needs the Rule on that platform).
function SegmentEditor({ segment, ruleIndex, segmentIndex, segmentCount, definitions, platform, onChange, onMove, onRemove }: { segment: Segment; ruleIndex: number; segmentIndex: number; segmentCount: number; definitions: Definition[]; platform: string | undefined; onChange: (updates: Partial<Segment>) => void; onMove: (direction: -1 | 1) => void; onRemove: () => void }) {
  const definitionId = segment.kind === 'enum' ? segment.definitionId : undefined;
  const offered = definitions.filter((definition) => definition.platforms.length === 0 || (platform !== undefined && definition.platforms.includes(platform)) || definition.id === definitionId);
  const chosen = definitions.find((definition) => definition.id === definitionId);
  return <div className="rounded-lg border border-border/30 bg-background/50 p-4" data-testid={`card-segment-${ruleIndex}-${segmentIndex}`}><div className="grid gap-4 sm:grid-cols-[1fr_1fr_145px_auto] sm:items-end">
    <label className="text-[13px] font-bold text-foreground">Label:<input className={`${inputClass} mt-2`} value={segment.label} onChange={(event) => {
      const newLabel = event.target.value;
      onChange({ label: newLabel, key: slugify(newLabel) || `segment_${segmentIndex + 1}` });
    }} data-testid={`input-segment-label-${ruleIndex}-${segmentIndex}`} /></label>
    <label className="text-[13px] font-bold text-foreground">Key:<input className={`${inputClass} mt-2 font-mono`} value={segment.key} onChange={(event) => onChange({ key: event.target.value.toLowerCase().replaceAll(' ', '_') })} data-testid={`input-segment-key-${ruleIndex}-${segmentIndex}`} /></label>
    <label className="text-[13px] font-bold text-foreground">Type:<select className={`${inputClass} mt-2`} value={segment.kind} onChange={(event) => onChange(event.target.value === 'enum' ? { kind: 'enum', allowedValues: segment.kind === 'enum' ? segment.allowedValues : entriesFromCodes(['value']) } : { kind: 'freeform', maxLength: segment.kind === 'freeform' ? segment.maxLength : 32, illegalChars: segment.kind === 'freeform' ? segment.illegalChars : [' ', '/', '?', '#', '&'] })} data-testid={`select-segment-kind-${ruleIndex}-${segmentIndex}`}><option value="enum">Allowed values</option><option value="freeform">Freeform</option></select></label>
    <div className="mb-0.5 flex items-center gap-1">
      <button type="button" className={iconButton} onClick={() => onMove(-1)} disabled={segmentIndex === 0} aria-label="Move segment up" data-testid={`button-move-segment-up-${ruleIndex}-${segmentIndex}`}><ArrowUp className="h-4 w-4" /></button>
      <button type="button" className={iconButton} onClick={() => onMove(1)} disabled={segmentIndex === segmentCount - 1} aria-label="Move segment down" data-testid={`button-move-segment-down-${ruleIndex}-${segmentIndex}`}><ArrowDown className="h-4 w-4" /></button>
      <button type="button" className="rounded-md p-2 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive" onClick={onRemove} aria-label="Remove segment" data-testid={`button-remove-segment-${ruleIndex}-${segmentIndex}`}><Trash2 className="h-4 w-4" /></button>
    </div></div>
     <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end">{segment.kind === 'enum' ? <div className="flex flex-1 flex-col gap-4 sm:flex-row sm:items-end"><label className="text-[13px] font-bold text-foreground sm:w-60">Values from:<select className={`${inputClass} mt-2`} value={definitionId ?? ''} onChange={(event) => onChange(event.target.value ? { definitionId: event.target.value, allowedValues: [] } : { definitionId: undefined, allowedValues: segment.allowedValues.length > 0 ? segment.allowedValues : entriesFromCodes(['value']) })} data-testid={`select-segment-source-${ruleIndex}-${segmentIndex}`}><option value="">This Rule's own list</option>{offered.map((definition) => <option key={definition.id} value={definition.id}>{definition.name}{definition.platforms.length > 0 ? ` (${definition.platforms.join(', ')})` : ''}</option>)}</select></label>{definitionId ? <div className="flex-1 text-[12px] text-muted-foreground" data-testid={`text-segment-definition-${ruleIndex}-${segmentIndex}`}>{chosen ? <>Shared values from <Link href="/dictionary" className="font-semibold text-primary underline">the Dictionary</Link>: {chosen.entries.length === 0 ? 'none yet' : chosen.entries.map((entry) => `${entry.label} (${entry.code})`).join(', ')}</> : <span className="font-semibold text-destructive">This definition no longer exists.</span>}</div> : <label className="flex-1 text-[13px] font-bold text-foreground">Allowed values: <span className="font-normal text-muted-foreground ml-1">(comma separated, matched exactly)</span><CommaListInput className={`${inputClass} mt-2 font-mono`} value={segment.allowedValues.map((entry) => entry.code)} onChange={(codes) => onChange({ allowedValues: entriesFromCodeList(codes, segment.allowedValues) })} placeholder="na, emea, apac" testId={`input-segment-values-${ruleIndex}-${segmentIndex}`} /></label>}</div> : <><label className="flex-1 text-[13px] font-bold text-foreground">Max characters:<input type="number" min="1" max="200" className={`${inputClass} mt-2`} value={segment.maxLength || ''} onChange={(event) => onChange({ maxLength: event.target.value === '' ? 0 : Number(event.target.value) })} data-testid={`input-segment-max-length-${ruleIndex}-${segmentIndex}`} /></label><label className="flex-1 text-[13px] font-bold text-foreground">Illegal characters: <span className="font-normal text-muted-foreground ml-1">(the delimiter is always illegal)</span><input className={`${inputClass} mt-2 font-mono`} value={segment.illegalChars.join('')} onChange={(event) => onChange({ illegalChars: Array.from(new Set([...event.target.value])) })} data-testid={`input-segment-illegal-chars-${ruleIndex}-${segmentIndex}`} /></label></>}<label className="flex items-center gap-2 pb-2 text-[13px] font-bold text-foreground"><input type="checkbox" checked={segment.required} onChange={(event) => onChange({ required: event.target.checked })} className="h-4 w-4 rounded-sm border-gray-300 text-primary focus:ring-primary bg-[#EAE8E3]" data-testid={`checkbox-segment-required-${ruleIndex}-${segmentIndex}`} /> Required</label></div>
  </div>;
}

// Feature 1: author one Rule Set and its Rules. Storage arrives as props.
// readOnly: the signed-in user is not a workspace admin (only admins may
// change Rule Sets, under the Security Rules); every control is disabled and
// the Save and Delete buttons give way to a hint.
export function RuleSetEditor({ existing, definitions, readOnly = false, storeKind, justCreated, onCreate, onUpdate, onDelete, onSaved, onClose }: { existing: RuleSet | null; definitions: Definition[]; readOnly?: boolean; storeKind: Store['kind']; justCreated?: boolean; onCreate: (draft: RuleSetDraft) => Promise<RuleSet>; onUpdate: (id: string, draft: RuleSetDraft, baseUpdatedAt: string) => Promise<string>; onDelete: (id: string) => Promise<void>; onSaved: (id: string) => void; onClose: () => void }) {
  const isNew = existing === null;
  const [name, setName] = useState(existing?.name ?? 'Untitled Rule Set');
  const [rules, setRules] = useState<Rule[]>(existing?.rules ?? [emptyRule(0)]);
  // The version this editor loaded. `existing` keeps following the store, so a
  // save by someone else shows up as existing.updatedAt moving past this;
  // the store refuses a save from an older base, and Reload here catches up.
  const [baseUpdatedAt, setBaseUpdatedAt] = useState(existing?.updatedAt ?? '');
  const stale = !isNew && !readOnly && existing.updatedAt !== baseUpdatedAt;
  const reload = () => {
    if (isNew) return;
    setName(existing.name);
    setRules(existing.rules);
    setBaseUpdatedAt(existing.updatedAt);
    setError('');
  };
  // Creating a Rule Set remounts this editor under the new id, so the
  // "saved" flash for a create arrives through justCreated.
  const [saved, setSaved] = useState(Boolean(justCreated));
  // A save against Firestore can take seconds on a cold connection; while one
  // is in flight the form stays put and Save is disabled, so a second click
  // cannot create a duplicate Rule Set.
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!saved) return;
    const timer = window.setTimeout(() => setSaved(false), 2200);
    return () => window.clearTimeout(timer);
  }, [saved]);
  const isDirty = isNew
    || name !== existing.name
    || JSON.stringify(rules) !== JSON.stringify(existing.rules);

  const updateRule = (ruleIndex: number, updates: Partial<Rule>) => setRules((current) => current.map((rule, index) => index === ruleIndex ? { ...rule, ...updates } : rule));
  const updateTags = (ruleIndex: number, patch: Tags) => setRules((current) => current.map((rule, index) => index === ruleIndex ? { ...rule, tags: cleanTags({ ...rule.tags, ...patch }) } : rule));
  const updateSegment = (ruleIndex: number, segmentIndex: number, updates: Partial<Segment>) => setRules((current) => current.map((rule, index) => index === ruleIndex ? { ...rule, segments: rule.segments.map((segment: Segment, segIndex: number) => segIndex === segmentIndex ? mergeSegment(segment, updates) : segment) } : rule));
  const addSegment = (ruleIndex: number) => setRules((current) => current.map((rule, index) => index === ruleIndex ? { ...rule, segments: [...rule.segments, emptySegment(rule.segments.length)] } : rule));
  const removeSegment = (ruleIndex: number, segmentIndex: number) => setRules((current) => current.map((rule, index) => index === ruleIndex ? { ...rule, segments: rule.segments.filter((_: Segment, segIndex: number) => segIndex !== segmentIndex) } : rule));
  const moveRule = (ruleIndex: number, direction: -1 | 1) => setRules((current) => { const next = [...current]; const target = ruleIndex + direction; if (target < 0 || target >= next.length) return current; [next[ruleIndex], next[target]] = [next[target], next[ruleIndex]]; return next; });
  // Array order is the segment position, so reordering is just swapping entries.
  const moveSegment = (ruleIndex: number, segmentIndex: number, direction: -1 | 1) => setRules((current) => current.map((rule, index) => {
    if (index !== ruleIndex) return rule;
    const target = segmentIndex + direction;
    if (target < 0 || target >= rule.segments.length) return rule;
    const segments = [...rule.segments];
    [segments[segmentIndex], segments[target]] = [segments[target], segments[segmentIndex]];
    return { ...rule, segments };
  }));

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (readOnly || saving) return;
    const draft = { name: name.trim(), rules };
    const errors = checkRuleSet({ id: existing?.id ?? '', ...draft }, definitions);
    if (errors.length > 0) {
      setError(errors[0]);
      return;
    }

    setError('');
    setSaving(true);
    try {
      if (isNew) {
        const created = await onCreate(draft);
        onSaved(created.id);
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

  return <form onSubmit={onSubmit}>
    <div className="mb-8 flex flex-col gap-5 border-b border-border pb-8 sm:flex-row sm:items-start sm:justify-between"><div><button type="button" onClick={onClose} className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground transition hover:text-foreground" data-testid="button-back-overview"><ArrowLeft className="h-3.5 w-3.5" /> Overview</button><div className="font-mono text-[10px] font-semibold uppercase tracking-widest text-primary">{isNew ? 'New Rule Set' : 'Edit Rule Set'}</div><h1 className="mt-2 font-display text-3xl font-medium tracking-tight text-foreground sm:text-4xl">{isNew ? 'Create Rule Set' : 'Edit Rule Set'}</h1><p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">Define naming rules and required segments for campaigns.</p></div><div className="flex items-center gap-3">{readOnly ? <span className="inline-flex items-center gap-2 rounded-[4px] border border-border bg-card px-3 py-2 text-xs font-semibold text-muted-foreground" data-testid="text-read-only"><Lock className="h-3.5 w-3.5" /> Read only: only a workspace admin can change Rule Sets. Build and Check still work.</span> : <>{saved ? <span className="mr-2 inline-flex items-center gap-1.5 text-xs font-semibold text-primary" data-testid="text-save-confirmation"><CheckCircle2 className="h-4 w-4" /> {storeKind === 'firestore' ? 'Saved' : 'Saved locally'}</span> :isDirty ? <span className="mr-2 text-xs font-semibold text-muted-foreground">Unsaved — save to use in Build</span> : null}{!isNew && <button type="button" className={buttonDanger} disabled={saving} onClick={() => { if (window.confirm('Delete this Rule Set?')) { void onDelete(existing.id); onClose(); } }} data-testid="button-delete-ruleset"><Trash2 className="h-4 w-4" /> Delete</button>}<button type="submit" className={buttonPrimary} disabled={saving} data-testid="button-save-ruleset"><Check className="h-4 w-4" /> {saving ? 'Saving' : 'Save Rule Set'}</button></>}</div></div>
    <fieldset disabled={readOnly} className="mx-auto min-w-0 max-w-4xl">
      {error && <div className="mb-6 flex items-center gap-3 rounded-[4px] border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive" role="alert" data-testid="status-ruleset-error"><AlertCircle className="h-5 w-5 shrink-0" /> {error}</div>}
      {stale && <div className="mb-6 flex flex-wrap items-center gap-3 rounded-[4px] border border-border bg-card px-4 py-3 text-sm font-medium text-foreground" role="status" data-testid="status-ruleset-stale"><RefreshCw className="h-4 w-4 shrink-0 text-muted-foreground" /> <span className="flex-1">This Rule Set changed since you opened it. Saving now will be refused.</span><button type="button" className={buttonQuiet} onClick={reload} data-testid="button-reload-ruleset">Reload and drop my edits</button></div>}
      <section className="mb-8 rounded-xl bg-card p-6 shadow-sm border border-border/30"><div className="mb-6 flex items-start justify-between"><div className="flex flex-col"><h2 className="font-display text-2xl font-medium text-foreground">General information</h2><p className="text-xs font-bold text-muted-foreground mt-1">Name this Rule Set to identify it in the workspace.</p></div><div className="flex h-5 w-5 items-center justify-center rounded-full border border-muted-foreground/30 text-muted-foreground"><BookOpen className="h-3 w-3" /></div></div><label className="block text-[13px] font-bold text-foreground">Rule Set name:<input value={name} onChange={(event) => setName(event.target.value)} className={`${inputClass} mt-2 font-display text-lg`} placeholder="e.g. Regional paid media" data-testid="input-ruleset-name" /></label></section>
      <div className="mb-5 flex items-end justify-between"><div><h2 className="font-display text-2xl font-medium tracking-tight text-foreground">Rules</h2><p className="mt-1.5 text-[13px] font-bold text-muted-foreground">Define the structural rules that campaign names are built from.</p></div><button type="button" className={buttonQuiet} onClick={() => setRules((current) => [...current, emptyRule(current.length)])} data-testid="button-add-rule"><Plus className="h-4 w-4" /> Add Rule</button></div>
      <div className="space-y-6">{rules.map((rule, ruleIndex) => <section className="rounded-xl bg-card p-6 shadow-sm border border-border/30" key={rule.id} data-testid={`card-rule-${ruleIndex}`}>
        <div className="flex items-start justify-between gap-4"><div className="flex min-w-0 items-center gap-4"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border/50 bg-muted/50 font-display text-lg text-foreground shadow-sm">{ruleIndex + 1}</div><div><h3 className="font-display text-xl font-medium text-foreground">Rule {ruleIndex + 1}</h3><p className="text-[11px] font-bold text-muted-foreground mt-1">{rule.segments.length} segment{rule.segments.length === 1 ? '' : 's'}</p></div></div><div className="flex items-center gap-1.5"><button type="button" className={iconButton} onClick={() => moveRule(ruleIndex, -1)} disabled={ruleIndex === 0} aria-label="Move rule up" data-testid={`button-move-rule-up-${ruleIndex}`}><ArrowUp className="h-4 w-4" /></button><button type="button" className={iconButton} onClick={() => moveRule(ruleIndex, 1)} disabled={ruleIndex === rules.length - 1} aria-label="Move rule down" data-testid={`button-move-rule-down-${ruleIndex}`}><ArrowDown className="h-4 w-4" /></button><button type="button" className="rounded-md p-2 text-muted-foreground transition hover:bg-destructive/15 hover:text-destructive" onClick={() => setRules((current) => current.filter((_, index) => index !== ruleIndex))} aria-label="Remove rule" data-testid={`button-remove-rule-${ruleIndex}`}><Trash2 className="h-4 w-4" /></button></div></div>
        <div className="mt-6 grid gap-4 sm:grid-cols-[1fr_1fr_120px]">
          <label className="text-[13px] font-bold text-foreground">Rule name:<input className={`${inputClass} mt-2`} value={rule.name} onChange={(event) => {
            const newName = event.target.value;
            updateRule(ruleIndex, { name: newName, key: slugify(newName) || `rule_${ruleIndex + 1}` });
          }} placeholder="e.g. Google Campaigns" data-testid={`input-rule-name-${ruleIndex}`} /></label>
          <label className="text-[13px] font-bold text-foreground">Key: <span className="font-normal text-muted-foreground ml-1">(machine name)</span><input className={`${inputClass} mt-2 font-mono`} value={rule.key} onChange={(event) => updateRule(ruleIndex, { key: event.target.value.toLowerCase().replaceAll(' ', '_') })} data-testid={`input-rule-key-${ruleIndex}`} /></label>
          <label className="text-[13px] font-bold text-foreground">Join with:<input className={`${inputClass} mt-2 font-mono text-center`} maxLength={1} value={rule.delimiter} onChange={(event) => updateRule(ruleIndex, { delimiter: event.target.value })} placeholder="-" data-testid={`input-rule-delimiter-${ruleIndex}`} /></label>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
           <label className="text-[13px] font-bold text-foreground">Platform: <span className="font-normal text-muted-foreground ml-1">(optional)</span><select className={`${inputClass} mt-2`} value={rule.tags?.platform ?? ''} onChange={(event) => updateTags(ruleIndex, { platform: event.target.value })} data-testid={`input-rule-platform-${ruleIndex}`}><option value="">None</option>{rule.tags?.platform && !isPlatform(rule.tags.platform) ? <option value={rule.tags.platform}>{rule.tags.platform} (not a known platform)</option> : null}{PLATFORMS.map((platform) => <option key={platform.id} value={platform.id}>{platform.name}</option>)}</select></label>
           <label className="text-[13px] font-bold text-foreground">Entity type: <span className="font-normal text-muted-foreground ml-1">(optional)</span><input className={`${inputClass} mt-2`} value={rule.tags?.entityType ?? ''} onChange={(event) => updateTags(ruleIndex, { entityType: event.target.value })} placeholder="e.g. campaign, ad_set" data-testid={`input-rule-entity-type-${ruleIndex}`} /></label>
        </div>

        <div className="mt-5 rounded-lg border border-border/50 bg-muted/20 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><Database className="h-4 w-4 text-muted-foreground" /><div><div className="text-[13px] font-bold text-foreground">Source mapping</div><div className="text-[11px] font-bold text-muted-foreground mt-0.5">Used for live scanning in Stage 2.</div></div></div><button type="button" className="text-[13px] font-bold text-foreground underline-offset-2 hover:underline" onClick={() => {
          if (rule.source.filter) {
            const newSource = { ...rule.source };
            delete newSource.filter;
            updateRule(ruleIndex, { source: newSource });
          } else {
            updateRule(ruleIndex, { source: { ...rule.source, filter: { column: 'status', in: ['active'] } } });
          }
        }} data-testid={`button-toggle-filter-${ruleIndex}`}>{rule.source.filter ? 'Remove filter' : 'Add filter'}</button></div><div className="mt-4 grid gap-3 sm:grid-cols-3"><label className="text-[11px] font-bold text-foreground">Dataset:<input className={`${inputClass} mt-1.5 font-mono text-[12px]`} value={rule.source.dataset} onChange={(event) => updateRule(ruleIndex, { source: { ...rule.source, dataset: event.target.value } })} data-testid={`input-source-dataset-${ruleIndex}`} /></label><label className="text-[11px] font-bold text-foreground">Table:<input className={`${inputClass} mt-1.5 font-mono text-[12px]`} value={rule.source.table} onChange={(event) => updateRule(ruleIndex, { source: { ...rule.source, table: event.target.value } })} data-testid={`input-source-table-${ruleIndex}`} /></label><label className="text-[11px] font-bold text-foreground">Name column:<input className={`${inputClass} mt-1.5 font-mono text-[12px]`} value={rule.source.nameColumn} onChange={(event) => updateRule(ruleIndex, { source: { ...rule.source, nameColumn: event.target.value } })} data-testid={`input-source-name-column-${ruleIndex}`} /></label></div>{rule.source.filter && <div className="mt-4 grid gap-3 sm:grid-cols-2 border-t border-border/50 pt-4"><label className="text-[11px] font-bold text-foreground">Filter column:<input className={`${inputClass} mt-1.5 font-mono text-[12px]`} value={rule.source.filter.column} onChange={(event) => updateRule(ruleIndex, { source: { ...rule.source, filter: { ...rule.source.filter!, column: event.target.value } } })} data-testid={`input-source-filter-col-${ruleIndex}`} /></label><label className="text-[11px] font-bold text-foreground">Filter values: <span className="font-normal text-muted-foreground ml-1">(comma separated)</span><CommaListInput className={`${inputClass} mt-1.5 font-mono text-[12px]`} value={rule.source.filter.in} onChange={(list) => updateRule(ruleIndex, { source: { ...rule.source, filter: { ...rule.source.filter!, in: list } } })} placeholder="active, published" testId={`input-source-filter-in-${ruleIndex}`} /></label></div>}</div>
        <div className="mt-6 border-t border-border/50 pt-6"><div className="mb-4 flex items-center justify-between"><div><h4 className="font-display text-lg font-medium text-foreground">Segments</h4></div><button type="button" className="inline-flex h-8 items-center gap-1.5 rounded-[4px] border border-border px-3 text-xs font-bold text-foreground transition hover:bg-muted" onClick={() => addSegment(ruleIndex)} data-testid={`button-add-segment-${ruleIndex}`}><Plus className="h-3.5 w-3.5" /> Add segment</button></div>
          {rule.segments.length === 0 && <div className="rounded-lg border border-dashed border-border/50 bg-background/30 px-4 py-8 text-center text-[13px] font-bold text-muted-foreground">No segments defined.</div>}
          <div className="space-y-4">{rule.segments.map((segment: Segment, segmentIndex: number) => <SegmentEditor key={segment.id} segment={segment} ruleIndex={ruleIndex} segmentIndex={segmentIndex} segmentCount={rule.segments.length} definitions={definitions} platform={rule.tags?.platform} onChange={(updates) => updateSegment(ruleIndex, segmentIndex, updates)} onMove={(direction) => moveSegment(ruleIndex, segmentIndex, direction)} onRemove={() => removeSegment(ruleIndex, segmentIndex)} />)}</div>
        </div>
      </section>)}</div>
      <div className="mt-8 rounded-xl border border-border/30 bg-card p-5 text-[13px] font-bold leading-relaxed text-muted-foreground shadow-sm"><div className="flex items-center gap-2 text-foreground mb-1"><ShieldCheck className="h-4 w-4" /> Governance constraint</div><p>Keys should remain stable once a Rule Set is in use.</p></div>
    </fieldset>
  </form>;
}
