import { type FormEvent, type ReactNode, useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import {
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BadgeCheck,
  BookOpen,
  Check,
  CheckCircle2,
  Database,
  Hash,
  Layers3,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { type FreeformSegment, type Rule, type Segment, type Source, type RuleSet, useRuleSets } from '@/hooks/use-rulesets';
import { useUi } from '@/context/UiContext';

const OWNER_NAMES: Record<string, string> = { maya: 'Maya Chen', jonah: 'Jonah Reed', alina: 'Alina Park', you: 'You' };
const inputClass = 'h-9 w-full rounded-[4px] border-0 bg-[#EAE8E3] px-3 text-[13px] font-semibold text-gray-900 shadow-inner outline-none transition-all placeholder:text-gray-500 focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50 hover:bg-[#F2F0EB]';
const buttonPrimary = 'inline-flex h-9 items-center justify-center gap-2 rounded-[4px] bg-primary px-4 text-[13px] font-bold text-primary-foreground transition-all hover:brightness-110 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50';
const buttonQuiet = 'inline-flex h-9 items-center justify-center gap-2 rounded-[4px] border border-border bg-card px-3.5 text-[13px] font-bold text-foreground transition-all hover:-translate-y-px hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50';
const buttonDanger = 'inline-flex h-9 items-center justify-center gap-2 rounded-[4px] border border-destructive/25 bg-destructive/10 px-3.5 text-[13px] font-bold text-destructive transition-all hover:bg-destructive/20';

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
}

function ownerName(ownerId: string) {
  return OWNER_NAMES[ownerId] ?? ownerId;
}

function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <div className="mb-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-primary">{eyebrow}</div>
        <h1 className="font-serif text-3xl font-medium tracking-tight text-foreground sm:text-4xl">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}

function StatCard({ label, value, caption, icon: Icon, status }: { label: string; value: string; caption: string; icon: typeof Layers3; status: string }) {
  return <div className="rounded-xl bg-card p-6 shadow-sm border border-border/30">
    <div className="flex items-start justify-between">
      <div>
        <div className="font-serif text-xl font-medium text-foreground">{label}</div>
        <div className="mt-1 text-[11px] font-bold text-muted-foreground">{caption}</div>
      </div>
      <div className="flex h-5 w-5 items-center justify-center rounded-full border border-muted-foreground/30 text-muted-foreground"><Icon className="h-3 w-3" /></div>
    </div>
    <div className="mt-8 font-serif text-4xl tracking-tight text-foreground" data-testid={`text-stat-${label.toLowerCase().replaceAll(' ', '-')}`}>{value}</div>
    <div className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5"><span className="h-2 w-2 rounded-full bg-primary" /><span className="text-[10px] font-bold text-foreground">{status}</span></div>
  </div>;
}

function EmptyState({ query }: { query: string }) {
  return <div className="rounded-xl border border-dashed border-border bg-card/50 px-6 py-12 text-center"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded bg-muted text-muted-foreground"><Search className="h-5 w-5" /></div><h3 className="mt-4 text-sm font-semibold text-foreground">{query ? 'No matching Rule Sets' : 'No Rule Sets configured'}</h3><p className="mt-1.5 text-xs text-muted-foreground">{query ? 'Try a different search term.' : 'Create a new Rule Set to define naming rules.'}</p></div>;
}

function RuleSetRow({ ruleSet, index, onSelect }: { ruleSet: RuleSet; index: number; onSelect: () => void }) {
  const segmentCount = ruleSet.rules.reduce((sum: number, rule: Rule) => sum + rule.segments.length, 0);
  return <button onClick={onSelect} className="w-full text-left group flex flex-col gap-4 rounded-xl border border-border/30 bg-card p-5 transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md sm:flex-row sm:items-center sm:justify-between" data-testid={`card-ruleset-${ruleSet.id}`}>
    <div className="flex min-w-0 items-center gap-4"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-muted font-mono text-sm text-foreground shadow-inner">{String(index + 1).padStart(2, '0')}</div><div className="min-w-0"><div className="flex items-center gap-2.5"><h3 className="truncate font-serif text-xl font-medium text-foreground">{ruleSet.name}</h3><span className="rounded-full bg-primary/10 border border-primary/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">Active</span></div><p className="mt-1.5 text-[13px] font-medium text-muted-foreground">Owned by {ownerName(ruleSet.ownerId)} · Updated {formatDate(ruleSet.updatedAt)}</p></div></div>
    <div className="flex items-center justify-between gap-5 pl-14 sm:justify-end sm:pl-0"><div className="text-right"><div className="font-serif text-2xl font-medium text-foreground">{ruleSet.rules.length}</div><div className="text-[11px] font-bold text-muted-foreground mt-0.5">Rules / {segmentCount} segments</div></div><ArrowRight className="h-5 w-5 text-muted-foreground transition-all group-hover:translate-x-1 group-hover:text-primary" /></div>
  </button>;
}

function Overview({ ruleSets, onCreate }: { ruleSets: RuleSet[]; onCreate: () => void }) {
  const [query, setQuery] = useState('');
  const { setRuleSetId } = useUi();
  const filtered = ruleSets.filter((item) => item.name.toLowerCase().includes(query.toLowerCase()));
  const totalSegments = ruleSets.reduce((sum, ruleSet) => sum + ruleSet.rules.reduce((ruleSum: number, rule: Rule) => ruleSum + rule.segments.length, 0), 0);
  return (
    <div>
      <PageHeading eyebrow="Marketing Operations" title="Rule Set overview" description="Manage campaign naming rules and structures across the organization." action={<button type="button" onClick={onCreate} className={buttonPrimary} data-testid="button-create-ruleset"><Plus className="h-4 w-4" /> New Rule Set</button>} />
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <StatCard label="Rule Sets" value={String(ruleSets.length)} caption="Active configurations" icon={Layers3} status="Active" />
        <StatCard label="Defined rules" value={String(ruleSets.reduce((sum, item) => sum + item.rules.length, 0))} caption={`${totalSegments} configured segments`} icon={Hash} status="Configured" />
        <StatCard label="Status" value="100%" caption="Local draft active" icon={BadgeCheck} status="Operational" />
      </div>
      <section id="rulesets">
        <div className="mb-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><h2 className="font-serif text-2xl font-medium tracking-tight text-foreground">Configured Rule Sets</h2><p className="mt-1.5 text-sm text-muted-foreground">Select a Rule Set to edit its rules and source mappings.</p></div><div className="relative w-full sm:w-72"><Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} className={`${inputClass} pl-10`} placeholder="Search Rule Sets" aria-label="Search Rule Sets" data-testid="input-search-rulesets" /></div></div>
        {filtered.length > 0 ? <div className="grid gap-4">{filtered.map((ruleSet, index) => <RuleSetRow key={ruleSet.id} ruleSet={ruleSet} index={index} onSelect={() => setRuleSetId(ruleSet.id)} />)}</div> : <EmptyState query={query} />}
      </section>
    </div>
  );
}

function emptyRule(index: number): Rule {
  return { key: `rule_${index + 1}`, label: `Rule ${index + 1}`, delimiter: '-', segments: [emptySegment(0)], source: { dataset: 'marketing', table: 'campaign_values', nameColumn: 'name' } };
}

function emptySegment(index: number): FreeformSegment {
  return { kind: 'freeform', key: `segment_${index + 1}`, label: `Segment ${index + 1}`, required: true, maxLength: 32, illegalChars: [' ', '/', '?', '#', '&', '-'] };
}

function SegmentEditor({ segment, delimiter, ruleIndex, segmentIndex, onChange, onRemove }: { segment: Segment; delimiter: string; ruleIndex: number; segmentIndex: number; onChange: (updates: Partial<Segment>) => void; onRemove: () => void }) {
  const isEnum = segment.kind === 'enum';
  const [allowedValuesDraft, setAllowedValuesDraft] = useState(() => (segment.kind === 'enum' ? segment.allowedValues?.join(', ') : ''));

  useEffect(() => {
    if (segment.kind === 'enum') {
      setAllowedValuesDraft(segment.allowedValues.join(', '));
    }
  }, [segment.kind]);

  return <div className="rounded-lg border border-border/30 bg-background/50 p-4"><div className="grid gap-4 sm:grid-cols-[1fr_1fr_145px_auto] sm:items-end">
    <label className="text-[13px] font-bold text-foreground">Label:<input className={`${inputClass} mt-2`} value={segment.label} onChange={(event) => {
      const newLabel = event.target.value;
      const newKey = newLabel.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
      onChange({ label: newLabel, key: newKey || `segment_${segmentIndex + 1}` });
    }} data-testid={`input-segment-label-${ruleIndex}-${segmentIndex}`} /></label>
    <label className="text-[13px] font-bold text-foreground">Key:<input className={`${inputClass} mt-2 font-mono`} value={segment.key} onChange={(event) => onChange({ key: event.target.value.toLowerCase().replaceAll(' ', '_') })} data-testid={`input-segment-key-${ruleIndex}-${segmentIndex}`} /></label>
    <label className="text-[13px] font-bold text-foreground">Type:<select className={`${inputClass} mt-2`} value={segment.kind} onChange={(event) => onChange(event.target.value === 'enum' ? { kind: 'enum', allowedValues: segment.kind === 'enum' ? segment.allowedValues : ['value'] } : { kind: 'freeform', maxLength: segment.kind === 'freeform' ? segment.maxLength : 32, illegalChars: Array.from(new Set([...(segment.kind === 'freeform' ? segment.illegalChars : [' ', '/', '?', '#', '&']), delimiter].filter(Boolean))) })} data-testid={`select-segment-kind-${ruleIndex}-${segmentIndex}`}><option value="enum">Allowed values</option><option value="freeform">Freeform</option></select></label><button type="button" className="mb-0.5 rounded p-2 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive" onClick={onRemove} aria-label="Remove segment" data-testid={`button-remove-segment-${ruleIndex}-${segmentIndex}`}><Trash2 className="h-4 w-4" /></button></div>
     <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end">{segment.kind === 'enum' ? <label className="flex-1 text-[13px] font-bold text-foreground">Allowed values: <span className="font-normal text-muted-foreground ml-1">(comma separated)</span><input className={`${inputClass} mt-2 font-mono`} value={allowedValuesDraft} onChange={(event) => { const draft = event.target.value; setAllowedValuesDraft(draft); onChange({ allowedValues: draft.split(',').map((value) => value.trim().toLowerCase()).filter(Boolean) }); }} placeholder="na, emea, apac" data-testid={`input-segment-values-${ruleIndex}-${segmentIndex}`} /></label> : <><label className="flex-1 text-[13px] font-bold text-foreground">Max characters:<input type="number" min="1" max="200" className={`${inputClass} mt-2`} value={segment.maxLength} onChange={(event) => onChange({ maxLength: Number(event.target.value) || 1 })} data-testid={`input-segment-max-length-${ruleIndex}-${segmentIndex}`} /></label><label className="flex-1 text-[13px] font-bold text-foreground">Illegal characters: <span className="font-normal text-muted-foreground ml-1">(includes delimiter)</span><input className={`${inputClass} mt-2 font-mono`} value={segment.illegalChars.join('')} onChange={(event) => onChange({ illegalChars: Array.from(new Set([...event.target.value, delimiter].filter(Boolean))) })} data-testid={`input-segment-illegal-chars-${ruleIndex}-${segmentIndex}`} /></label></>}<label className="flex items-center gap-2 pb-2 text-[13px] font-bold text-foreground"><input type="checkbox" checked={segment.required} onChange={(event) => onChange({ required: event.target.checked })} className="h-4 w-4 rounded-sm border-gray-300 text-primary focus:ring-primary bg-[#EAE8E3]" data-testid={`checkbox-segment-required-${ruleIndex}-${segmentIndex}`} /> Required</label></div>
  </div>;
}

function RuleSetEditor({ 
  existingId, 
  ruleSets, 
  createRuleSet, 
  updateRuleSet, 
  deleteRuleSet, 
  onClose 
}: { 
  existingId: string | null; 
  ruleSets: RuleSet[]; 
  createRuleSet: (draft: Pick<RuleSet, 'name' | 'rules'>) => RuleSet; 
  updateRuleSet: (id: string, draft: Pick<RuleSet, 'name' | 'rules'>) => void; 
  deleteRuleSet: (id: string) => void;
  onClose: () => void;
}) {
  const isNew = existingId === 'new';
  const existing = ruleSets.find((rs) => rs.id === existingId);
  const [name, setName] = useState(existing?.name ?? 'Untitled Rule Set');
  const [rules, setRules] = useState<Rule[]>(existing?.rules ?? [emptyRule(0)]);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const { setRuleSetId } = useUi();
  const isDirty = isNew
    || name !== (existing?.name ?? '')
    || JSON.stringify(rules) !== JSON.stringify(existing?.rules ?? []);

  const updateRule = (ruleIndex: number, updates: Partial<Rule>) => setRules((current) => current.map((rule, index) => index === ruleIndex ? { ...rule, ...updates } : rule));
  const updateSegment = (ruleIndex: number, segmentIndex: number, updates: Partial<Segment>) => setRules((current) => current.map((rule, index) => index === ruleIndex ? { ...rule, segments: rule.segments.map((segment: Segment, segIndex: number) => segIndex === segmentIndex ? { ...segment, ...updates } as Segment : segment) } : rule));
  const addSegment = (ruleIndex: number) => setRules((current) => current.map((rule, index) => {
    if (index !== ruleIndex) return rule;
    const segment = emptySegment(rule.segments.length);
    return {
      ...rule,
      segments: [
        ...rule.segments,
        { ...segment, illegalChars: Array.from(new Set([...segment.illegalChars, rule.delimiter].filter(Boolean))) },
      ],
    };
  }));
  const removeSegment = (ruleIndex: number, segmentIndex: number) => setRules((current) => current.map((rule, index) => index === ruleIndex ? { ...rule, segments: rule.segments.filter((_: Segment, segIndex: number) => segIndex !== segmentIndex) } : rule));
  const moveRule = (ruleIndex: number, direction: -1 | 1) => setRules((current) => { const next = [...current]; const target = ruleIndex + direction; if (target < 0 || target >= next.length) return current; [next[ruleIndex], next[target]] = [next[target], next[ruleIndex]]; return next; });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const newError: string[] = [];
    const normalizedRules = rules.map((rule) => ({
      ...rule,
      segments: rule.segments.map((segment) => segment.kind === 'freeform'
        ? { ...segment, illegalChars: Array.from(new Set([...segment.illegalChars, rule.delimiter].filter(Boolean))) }
        : segment),
    }));
    if (!name.trim()) newError.push('Give this Rule Set a name.');
    
    normalizedRules.forEach((rule, i) => {
      if (!rule.key.trim() || !rule.label.trim()) newError.push(`Rule ${i + 1} needs a key and label.`);
      if (!rule.delimiter || [...rule.delimiter].length > 1) newError.push(`Rule ${i + 1} must have a single-character delimiter.`);
      if (rule.segments.length === 0) newError.push(`Rule ${i + 1} must have at least one segment.`);
      if (!rule.source.dataset.trim() || !rule.source.table.trim() || !rule.source.nameColumn.trim()) {
        newError.push(`Rule ${i + 1} source must have a dataset, table, and name column.`);
      }
      
      const keys = new Set();
      let optionalSeen = false;
      rule.segments.forEach((segment: Segment) => {
        if (keys.has(segment.key)) newError.push(`Rule ${i + 1} has duplicate segment key "${segment.key}".`);
        keys.add(segment.key);
        
        if (!segment.required) optionalSeen = true;
        else if (optionalSeen) newError.push(`Rule ${i + 1}: Optional segments must be at the end.`);
        
        if (segment.kind === 'enum') {
          if (segment.allowedValues.length === 0) newError.push(`Segment "${segment.label}" needs allowed values.`);
          if (segment.allowedValues.some(v => v.includes(rule.delimiter))) newError.push(`Segment "${segment.label}" allowed values cannot contain delimiter "${rule.delimiter}".`);
        } else {
        }
      });
    });

    if (newError.length > 0) {
      setError(newError[0]);
      return;
    }
    
    setError('');
    setRules(normalizedRules);
    if (isNew) { 
      const created = createRuleSet({ name: name.trim(), rules: normalizedRules });
      setRuleSetId(created.id);
    } else if (existing) { 
      updateRuleSet(existing.id, { name: name.trim(), rules: normalizedRules });
    }
    setSaved(true); 
    window.setTimeout(() => setSaved(false), 2200);
  };

  return <form onSubmit={onSubmit}>
    <div className="mb-8 flex flex-col gap-5 border-b border-border pb-8 sm:flex-row sm:items-start sm:justify-between"><div><button type="button" onClick={onClose} className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground transition hover:text-foreground" data-testid="button-back-overview"><ArrowLeft className="h-3.5 w-3.5" /> Overview</button><div className="font-mono text-[10px] font-semibold uppercase tracking-widest text-primary">{isNew ? 'New Rule Set' : 'Edit Rule Set'}</div><h1 className="mt-2 font-serif text-3xl font-medium tracking-tight text-foreground sm:text-4xl">{isNew ? 'Create Rule Set' : 'Edit Rule Set'}</h1><p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">Define naming rules and required segments for campaigns.</p></div><div className="flex items-center gap-3">{saved ? <span className="mr-2 inline-flex items-center gap-1.5 text-xs font-semibold text-primary"><CheckCircle2 className="h-4 w-4" /> Saved locally</span> : isDirty ? <span className="mr-2 text-xs font-semibold text-muted-foreground">Unsaved — save to use in Build</span> : null}{!isNew && <button type="button" className={buttonDanger} onClick={() => { if (window.confirm('Delete this Rule Set?')) { deleteRuleSet(existing?.id ?? ''); onClose(); } }} data-testid="button-delete-ruleset"><Trash2 className="h-4 w-4" /> Delete</button>}<button type="submit" className={buttonPrimary} data-testid="button-save-ruleset"><Check className="h-4 w-4" /> Save Rule Set</button></div></div>
    <div className="mx-auto max-w-4xl">
      {error && <div className="mb-6 flex items-center gap-3 rounded-[4px] border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive" role="alert" data-testid="status-ruleset-error"><AlertCircle className="h-5 w-5 shrink-0" /> {error}</div>}
      <section className="mb-8 rounded-xl bg-card p-6 shadow-sm border border-border/30"><div className="mb-6 flex items-start justify-between"><div className="flex flex-col"><h2 className="font-serif text-2xl font-medium text-foreground">General information</h2><p className="text-xs font-bold text-muted-foreground mt-1">Name this Rule Set to identify it in the workspace.</p></div><div className="flex h-5 w-5 items-center justify-center rounded-full border border-muted-foreground/30 text-muted-foreground"><BookOpen className="h-3 w-3" /></div></div><label className="block text-[13px] font-bold text-foreground">Rule Set name:<input value={name} onChange={(event) => setName(event.target.value)} className={`${inputClass} mt-2 font-serif text-lg`} placeholder="e.g. Regional paid media" data-testid="input-ruleset-name" /></label></section>
      <div className="mb-5 flex items-end justify-between"><div><h2 className="font-serif text-2xl font-medium tracking-tight text-foreground">Rules</h2><p className="mt-1.5 text-[13px] font-bold text-muted-foreground">Define the structural rules that campaign names are built from.</p></div><button type="button" className={buttonQuiet} onClick={() => setRules((current) => [...current, emptyRule(current.length)])} data-testid="button-add-rule"><Plus className="h-4 w-4" /> Add Rule</button></div>
      <div className="space-y-6">{rules.map((rule, ruleIndex) => <section className="rounded-xl bg-card p-6 shadow-sm border border-border/30" key={`rule-${ruleIndex}`} data-testid={`card-rule-${ruleIndex}`}>
        <div className="flex items-start justify-between gap-4"><div className="flex min-w-0 items-center gap-4"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border/50 bg-muted/50 font-serif text-lg text-foreground shadow-sm">{ruleIndex + 1}</div><div><h3 className="font-serif text-xl font-medium text-foreground">Rule {ruleIndex + 1}</h3><p className="text-[11px] font-bold text-muted-foreground mt-1">{rule.segments.length} segment{rule.segments.length === 1 ? '' : 's'}</p></div></div><div className="flex items-center gap-1.5"><button type="button" className="rounded-md p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-30" onClick={() => moveRule(ruleIndex, -1)} disabled={ruleIndex === 0} aria-label="Move rule up" data-testid={`button-move-rule-up-${ruleIndex}`}><ArrowUp className="h-4 w-4" /></button><button type="button" className="rounded-md p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-30" onClick={() => moveRule(ruleIndex, 1)} disabled={ruleIndex === rules.length - 1} aria-label="Move rule down" data-testid={`button-move-rule-down-${ruleIndex}`}><ArrowDown className="h-4 w-4" /></button><button type="button" className="rounded-md p-2 text-muted-foreground transition hover:bg-destructive/15 hover:text-destructive" onClick={() => setRules((current) => current.filter((_, index) => index !== ruleIndex))} aria-label="Remove rule" data-testid={`button-remove-rule-${ruleIndex}`}><Trash2 className="h-4 w-4" /></button></div></div>
        <div className="mt-6 grid gap-4 sm:grid-cols-[1fr_1fr_120px]">
          <label className="text-[13px] font-bold text-foreground">Rule label:<input className={`${inputClass} mt-2`} value={rule.label} onChange={(event) => {
            const newLabel = event.target.value;
            const newKey = newLabel.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
            updateRule(ruleIndex, { label: newLabel, key: newKey || `rule_${ruleIndex + 1}` });
          }} data-testid={`input-rule-label-${ruleIndex}`} /></label>
          <label className="text-[13px] font-bold text-foreground">Key: <span className="font-normal text-muted-foreground ml-1">(machine name)</span><input className={`${inputClass} mt-2 font-mono`} value={rule.key} onChange={(event) => updateRule(ruleIndex, { key: event.target.value.toLowerCase().replaceAll(' ', '_') })} data-testid={`input-rule-key-${ruleIndex}`} /></label>
          <label className="text-[13px] font-bold text-foreground">Join with:<input className={`${inputClass} mt-2 font-mono text-center`} maxLength={1} value={rule.delimiter} onChange={(event) => {
            const delimiter = event.target.value;
            setRules((current) => current.map((currentRule, index) => index === ruleIndex ? {
              ...currentRule,
              delimiter,
              segments: currentRule.segments.map((segment) => segment.kind === 'freeform'
                ? { ...segment, illegalChars: Array.from(new Set([...segment.illegalChars, delimiter].filter(Boolean))) }
                : segment),
            } : currentRule));
          }} placeholder="-" data-testid={`input-rule-delimiter-${ruleIndex}`} /></label>
        </div>
        
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
           <label className="text-[13px] font-bold text-foreground">Platform: <span className="font-normal text-muted-foreground ml-1">(optional)</span><input className={`${inputClass} mt-2`} value={rule.platform || ''} onChange={(event) => updateRule(ruleIndex, { platform: event.target.value })} placeholder="e.g. Meta Ads, Google" data-testid={`input-rule-platform-${ruleIndex}`} /></label>
           <label className="text-[13px] font-bold text-foreground">Entity Type: <span className="font-normal text-muted-foreground ml-1">(optional)</span><input className={`${inputClass} mt-2`} value={rule.entityType || ''} onChange={(event) => updateRule(ruleIndex, { entityType: event.target.value })} placeholder="e.g. Ad Set, Campaign" data-testid={`input-rule-entity-type-${ruleIndex}`} /></label>
        </div>

        <div className="mt-5 rounded-lg border border-border/50 bg-muted/20 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><Database className="h-4 w-4 text-muted-foreground" /><div><div className="text-[13px] font-bold text-foreground">Source mapping</div><div className="text-[11px] font-bold text-muted-foreground mt-0.5">Used for live scanning in Stage 2.</div></div></div><button type="button" className="text-[13px] font-bold text-foreground underline-offset-2 hover:underline" onClick={() => {
          if (rule.source.filter) {
            const newSource = { ...rule.source };
            delete newSource.filter;
            updateRule(ruleIndex, { source: newSource });
          } else {
            updateRule(ruleIndex, { source: { ...rule.source, filter: { column: 'status', in: ['active'] } } });
          }
        }} data-testid={`button-toggle-filter-${ruleIndex}`}>{rule.source.filter ? 'Remove filter' : 'Add filter'}</button></div><div className="mt-4 grid gap-3 sm:grid-cols-3"><label className="text-[11px] font-bold text-foreground">Dataset:<input className={`${inputClass} mt-1.5 font-mono text-[12px]`} value={rule.source.dataset} onChange={(event) => updateRule(ruleIndex, { source: { ...rule.source, dataset: event.target.value } })} data-testid={`input-source-dataset-${ruleIndex}`} /></label><label className="text-[11px] font-bold text-foreground">Table:<input className={`${inputClass} mt-1.5 font-mono text-[12px]`} value={rule.source.table} onChange={(event) => updateRule(ruleIndex, { source: { ...rule.source, table: event.target.value } })} data-testid={`input-source-table-${ruleIndex}`} /></label><label className="text-[11px] font-bold text-foreground">Name column:<input className={`${inputClass} mt-1.5 font-mono text-[12px]`} value={rule.source.nameColumn} onChange={(event) => updateRule(ruleIndex, { source: { ...rule.source, nameColumn: event.target.value } })} data-testid={`input-source-name-column-${ruleIndex}`} /></label></div>{rule.source.filter && <div className="mt-4 grid gap-3 sm:grid-cols-2 border-t border-border/50 pt-4"><label className="text-[11px] font-bold text-foreground">Filter column:<input className={`${inputClass} mt-1.5 font-mono text-[12px]`} value={rule.source.filter.column} onChange={(event) => updateRule(ruleIndex, { source: { ...rule.source, filter: { ...rule.source.filter!, column: event.target.value } } })} data-testid={`input-source-filter-col-${ruleIndex}`} /></label><label className="text-[11px] font-bold text-foreground">Filter values: <span className="font-normal text-muted-foreground ml-1">(comma separated)</span><input className={`${inputClass} mt-1.5 font-mono text-[12px]`} value={rule.source.filter.in.join(', ')} onChange={(event) => updateRule(ruleIndex, { source: { ...rule.source, filter: { ...rule.source.filter!, in: event.target.value.split(',').map(v => v.trim()).filter(Boolean) } } })} placeholder="active, published" data-testid={`input-source-filter-in-${ruleIndex}`} /></label></div>}</div>
        <div className="mt-6 border-t border-border/50 pt-6"><div className="mb-4 flex items-center justify-between"><div><h4 className="font-serif text-lg font-medium text-foreground">Segments</h4></div><button type="button" className="inline-flex h-8 items-center gap-1.5 rounded-[4px] border border-border px-3 text-xs font-bold text-foreground transition hover:bg-muted" onClick={() => addSegment(ruleIndex)} data-testid={`button-add-segment-${ruleIndex}`}><Plus className="h-3.5 w-3.5" /> Add segment</button></div>
          {rule.segments.length === 0 && <div className="rounded-lg border border-dashed border-border/50 bg-background/30 px-4 py-8 text-center text-[13px] font-bold text-muted-foreground">No segments defined.</div>}
          <div className="space-y-4">{rule.segments.map((segment: Segment, segmentIndex: number) => <SegmentEditor key={`segment-${ruleIndex}-${segmentIndex}`} segment={segment} delimiter={rule.delimiter} ruleIndex={ruleIndex} segmentIndex={segmentIndex} onChange={(updates) => updateSegment(ruleIndex, segmentIndex, updates)} onRemove={() => removeSegment(ruleIndex, segmentIndex)} />)}</div>
        </div>
      </section>)}</div>
      <div className="mt-8 rounded-xl border border-border/30 bg-card p-5 text-[13px] font-bold leading-relaxed text-muted-foreground shadow-sm"><div className="flex items-center gap-2 text-foreground mb-1"><ShieldCheck className="h-4 w-4" /> Governance constraint</div><p>Keys should remain stable once a Rule Set is in use.</p></div>
    </div>
  </form>;
}

export function Author() {
  const { ruleSets, createRuleSet, updateRuleSet, deleteRuleSet } = useRuleSets();
  const { ruleSetId, setRuleSetId } = useUi();

  if (!ruleSetId) {
    return <Overview ruleSets={ruleSets} onCreate={() => setRuleSetId('new')} />;
  }

  return (
    <RuleSetEditor 
      key={ruleSetId}
      existingId={ruleSetId} 
      ruleSets={ruleSets} 
      createRuleSet={createRuleSet} 
      updateRuleSet={updateRuleSet} 
      deleteRuleSet={deleteRuleSet} 
      onClose={() => setRuleSetId(null)}
    />
  );
}