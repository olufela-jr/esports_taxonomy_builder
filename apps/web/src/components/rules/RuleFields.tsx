import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Database, Trash2 } from 'lucide-react';
import { ancestorsOf, entriesFromCodes, isPlatform, PLATFORMS, resolveRule, UTM_PARAMS, type Definition, type Rule, type Segment, type UtmMapping, type UtmParam, type UtmSource } from '@taxo/shared';
import { Link } from 'wouter';
import { iconButton, inputClass } from '../styles';
import { cleanTags, entriesFromCodeList, parseList, slugify } from './draft';

// The Rule editor's controls, one component per concern. Each works on one
// Rule; ruleIndex is the Rule's place in the Rule Set, kept in test ids.

// A comma-separated list bound to a string[] in state. Keeps its own text while
// the user types so a trailing comma or space survives the next render; only
// resyncs from the list when the list changed by other means (a kind switch).
export function CommaListInput({ value, onChange, className, placeholder, testId }: { value: string[]; onChange: (list: string[]) => void; className: string; placeholder?: string; testId: string }) {
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
export function SegmentEditor({ segment, ruleIndex, segmentIndex, segmentCount, definitions, platform, inheritedBy, onChange, onMove, onRemove }: { segment: Segment; ruleIndex: number; segmentIndex: number; segmentCount: number; definitions: Definition[]; platform: string | undefined; inheritedBy: string[]; onChange: (updates: Partial<Segment>) => void; onMove: (direction: -1 | 1) => void; onRemove: () => void }) {
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
      <button type="button" className="rounded-md p-2 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive disabled:opacity-30" onClick={onRemove} disabled={inheritedBy.length > 0} title={inheritedBy.length > 0 ? `Inherited by ${inheritedBy.join(', ')}` : undefined} aria-label="Remove segment" data-testid={`button-remove-segment-${ruleIndex}-${segmentIndex}`}><Trash2 className="h-4 w-4" /></button>
    </div></div>
     <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end">{segment.kind === 'enum' ? <div className="flex flex-1 flex-col gap-4 sm:flex-row sm:items-end"><label className="text-[13px] font-bold text-foreground sm:w-60">Values from:<select className={`${inputClass} mt-2`} value={definitionId ?? ''} onChange={(event) => onChange(event.target.value ? { definitionId: event.target.value, allowedValues: [] } : { definitionId: undefined, allowedValues: segment.allowedValues.length > 0 ? segment.allowedValues : entriesFromCodes(['value']) })} data-testid={`select-segment-source-${ruleIndex}-${segmentIndex}`}><option value="">This Rule's own list</option>{offered.map((definition) => <option key={definition.id} value={definition.id}>{definition.name}{definition.platforms.length > 0 ? ` (${definition.platforms.join(', ')})` : ''}</option>)}</select></label>{definitionId ? <div className="flex-1 text-[12px] text-muted-foreground" data-testid={`text-segment-definition-${ruleIndex}-${segmentIndex}`}>{chosen ? <>Shared values from <Link href="/definitions" className="font-semibold text-primary underline">Definitions</Link>: {chosen.entries.length === 0 ? 'none yet' : chosen.entries.map((entry) => `${entry.label} (${entry.code})`).join(', ')}</> : <span className="font-semibold text-destructive">This definition no longer exists.</span>}</div> : <label className="flex-1 text-[13px] font-bold text-foreground">Allowed values: <span className="font-normal text-muted-foreground ml-1">(comma separated, matched exactly)</span><CommaListInput className={`${inputClass} mt-2 font-mono`} value={segment.allowedValues.map((entry) => entry.code)} onChange={(codes) => onChange({ allowedValues: entriesFromCodeList(codes, segment.allowedValues) })} placeholder="na, emea, apac" testId={`input-segment-values-${ruleIndex}-${segmentIndex}`} /></label>}</div> : <><label className="flex-1 text-[13px] font-bold text-foreground">Max characters:<input type="number" min="1" max="200" className={`${inputClass} mt-2`} value={segment.maxLength || ''} onChange={(event) => onChange({ maxLength: event.target.value === '' ? 0 : Number(event.target.value) })} data-testid={`input-segment-max-length-${ruleIndex}-${segmentIndex}`} /></label><label className="flex-1 text-[13px] font-bold text-foreground">Illegal characters: <span className="font-normal text-muted-foreground ml-1">(the delimiter is always illegal)</span><input className={`${inputClass} mt-2 font-mono`} value={segment.illegalChars.join('')} onChange={(event) => onChange({ illegalChars: Array.from(new Set([...event.target.value])) })} data-testid={`input-segment-illegal-chars-${ruleIndex}-${segmentIndex}`} /></label></>}<label className="flex items-center gap-2 pb-2 text-[13px] font-bold text-foreground"><input type="checkbox" checked={segment.required} onChange={(event) => onChange({ required: event.target.checked })} className="h-4 w-4 rounded-sm border-gray-300 text-primary focus:ring-primary bg-[#EAE8E3]" data-testid={`checkbox-segment-required-${ruleIndex}-${segmentIndex}`} /> Required</label></div>
  </div>;
}

// The parent's resolved segments a child may inherit: the leading run of
// required segments (D28). An option per position, "up to <label>".
export function inheritableSegments(parent: Rule | undefined, draftRuleSet: { id: string; name: string; rules: Rule[] }, definitions: Definition[]): { segments: Segment[]; error: string } {
  if (!parent) return { segments: [], error: '' };
  const resolution = resolveRule(parent, draftRuleSet, definitions);
  if (resolution.errors.length > 0) return { segments: [], error: `The parent cannot be resolved yet: ${resolution.errors[0]}` };
  const leading: Segment[] = [];
  for (const segment of resolution.rule.segments) {
    if (!segment.required) break;
    leading.push(segment);
  }
  return { segments: leading, error: '' };
}

// Step 5: a Rule may inherit the leading segments of another Rule in the same
// Rule Set (D15, D28). Picking a parent copies its delimiter and platform and
// locks both; the inherited run is chosen by its last segment.
export function ParentPicker({ rule, ruleIndex, rules, draftRuleSet, definitions, onChange }: { rule: Rule; ruleIndex: number; rules: Rule[]; draftRuleSet: { id: string; name: string; rules: Rule[] }; definitions: Definition[]; onChange: (updates: Partial<Rule>) => void }) {
  const candidates = rules.filter((candidate) => candidate.id !== rule.id);
  const parent = rules.find((candidate) => candidate.id === rule.parent?.ruleId);
  const { segments: inheritable, error } = inheritableSegments(parent, draftRuleSet, definitions);
  const inheritedCount = rule.parent?.inheritSegmentIds.length ?? 0;

  const pickParent = (parentId: string) => {
    if (!parentId) {
      onChange({ parent: undefined });
      return;
    }
    const chosen = rules.find((candidate) => candidate.id === parentId);
    if (!chosen) return;
    const tags = cleanTags({ ...rule.tags, platform: chosen.tags?.platform ?? '' });
    onChange({ parent: { ruleId: parentId, inheritSegmentIds: [] }, delimiter: chosen.delimiter, tags });
  };

  const pickCount = (count: number) => {
    if (!rule.parent) return;
    onChange({ parent: { ...rule.parent, inheritSegmentIds: inheritable.slice(0, count).map((segment) => segment.id) } });
  };

  return (
    <div className="mt-4 grid gap-4 sm:grid-cols-2" data-testid={`section-parent-${ruleIndex}`}>
      <label className="text-[13px] font-bold text-foreground">Parent rule: <span className="font-normal text-muted-foreground ml-1">(optional)</span><select className={`${inputClass} mt-2`} value={rule.parent?.ruleId ?? ''} onChange={(event) => pickParent(event.target.value)} data-testid={`select-rule-parent-${ruleIndex}`}><option value="">None</option>{candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</select></label>
      {rule.parent && (
        <label className="text-[13px] font-bold text-foreground">Inherit the parent's segments through:<select className={`${inputClass} mt-2`} value={String(Math.min(inheritedCount, inheritable.length))} disabled={inheritable.length === 0} onChange={(event) => pickCount(Number(event.target.value))} data-testid={`select-rule-inherit-${ruleIndex}`}><option value="0">None</option>{inheritable.map((segment, index) => <option key={segment.id} value={String(index + 1)}>{segment.label}{index + 1 === inheritable.length ? '' : ''}</option>)}</select>{error && <span className="mt-1 block text-[11px] font-semibold text-destructive">{error}</span>}{!error && inheritable.length === 0 && <span className="mt-1 block text-[11px] font-semibold text-muted-foreground">The parent has no required segments to inherit.</span>}</label>
      )}
    </div>
  );
}

// The segments a child reads from its parent, shown above its own so the
// full name order is visible; they are edited on the parent.
export function InheritedSegments({ rule, ruleIndex, draftRuleSet, definitions }: { rule: Rule; ruleIndex: number; draftRuleSet: { id: string; name: string; rules: Rule[] }; definitions: Definition[] }) {
  if (!rule.parent || rule.parent.inheritSegmentIds.length === 0) return null;
  const parent = draftRuleSet.rules.find((candidate) => candidate.id === rule.parent?.ruleId);
  const { segments } = inheritableSegments(parent, draftRuleSet, definitions);
  const inherited = rule.parent.inheritSegmentIds.map((id) => segments.find((segment) => segment.id === id)).filter((segment): segment is Segment => Boolean(segment));
  if (inherited.length === 0) return null;
  return (
    <ol className="mb-4 flex flex-col gap-2" data-testid={`list-inherited-segments-${ruleIndex}`}>
      {inherited.map((segment) => <li key={segment.id} className="flex items-center justify-between rounded-lg border border-dashed border-border/60 bg-muted/20 px-4 py-2.5 text-[13px]"><span className="font-bold text-foreground">{segment.label} <span className="ml-2 font-mono text-[10px] font-normal text-muted-foreground">{segment.key}</span></span><span className="text-[11px] font-bold text-muted-foreground">Inherited from {parent?.name}</span></li>)}
    </ol>
  );
}

// Step 8: the Rule's UTM mapping (v2 D19, D26, D27, D30). One row per
// parameter: a source kind and, by kind, the Rule, segment, tag or text it
// reads. campaign is always a Rule's built name. Errors come from
// checkUtmMapping through the Rule's issue list.
const SOURCE_KINDS: Array<{ kind: UtmSource['kind']; label: string }> = [
  { kind: 'ruleName', label: "A Rule's built name" },
  { kind: 'segment', label: 'One of this Rule\'s segments' },
  { kind: 'tag', label: "A Rule's platform or entity type" },
  { kind: 'literal', label: 'Fixed text' },
];

function defaultMapping(rule: Rule, draftRuleSet: { id: string; name: string; rules: Rule[] }): UtmMapping {
  // P2 defaults: source from the platform tag, medium a fixed value; campaign
  // from the top of the chain, so an ad group's utm_campaign is its campaign.
  const ancestors = ancestorsOf(rule, draftRuleSet);
  const root = ancestors.length > 0 ? ancestors[ancestors.length - 1] : rule;
  return {
    source: { kind: 'tag', ruleId: rule.id, tag: 'platform' },
    medium: { kind: 'literal', value: 'cpc' },
    campaign: { kind: 'ruleName', ruleId: root.id },
    ...(root.id !== rule.id ? { content: { kind: 'ruleName', ruleId: rule.id } as UtmSource } : {}),
    baseUrl: '',
    baseUrlEditable: true,
    casePolicy: 'lower',
  };
}

function sourceOfKind(kind: UtmSource['kind'], rule: Rule, segments: Segment[]): UtmSource {
  if (kind === 'ruleName') return { kind, ruleId: rule.id };
  if (kind === 'segment') return { kind, segmentId: segments[0]?.id ?? '' };
  if (kind === 'tag') return { kind, ruleId: rule.id, tag: 'platform' };
  return { kind, value: '' };
}

export function UtmPanel({ rule, ruleIndex, draftRuleSet, definitions, onChange }: { rule: Rule; ruleIndex: number; draftRuleSet: { id: string; name: string; rules: Rule[] }; definitions: Definition[]; onChange: (utm: UtmMapping | undefined) => void }) {
  const mapping = rule.utm;
  const chain = [rule, ...ancestorsOf(rule, draftRuleSet)];
  const resolution = resolveRule(rule, draftRuleSet, definitions);
  const segments = resolution.errors.length === 0 ? resolution.rule.segments : rule.segments;
  const setParam = (param: UtmParam, source: UtmSource | undefined) => {
    if (!mapping) return;
    const next = { ...mapping, [param]: source } as UtmMapping;
    if (source === undefined) delete next[param as 'content' | 'term'];
    onChange(next);
  };

  return (
    <div className="mt-5 rounded-lg border border-border/50 bg-muted/20 p-4" data-testid={`section-utm-${ruleIndex}`}>
      <label className="flex items-center gap-2 text-[13px] font-bold text-foreground"><input type="checkbox" checked={Boolean(mapping)} onChange={(event) => onChange(event.target.checked ? defaultMapping(rule, draftRuleSet) : undefined)} className="h-4 w-4 rounded-sm border-gray-300 text-primary focus:ring-primary" data-testid={`checkbox-rule-utm-${ruleIndex}`} /> Tracking URL <span className="font-normal text-muted-foreground">(Build outputs a URL with UTM parameters for this Rule)</span></label>
      {mapping && (
        <div className="mt-4 flex flex-col gap-3">
          {UTM_PARAMS.map((param) => {
            const source = mapping[param];
            const required = param === 'source' || param === 'medium' || param === 'campaign';
            return (
              <div key={param} className="grid gap-3 sm:grid-cols-[110px_220px_1fr] sm:items-center" data-testid={`row-utm-${ruleIndex}-${param}`}>
                <span className="font-mono text-[12px] font-bold text-foreground">utm_{param}</span>
                <select className={inputClass} value={source?.kind ?? ''} disabled={param === 'campaign'} onChange={(event) => setParam(param, event.target.value ? sourceOfKind(event.target.value as UtmSource['kind'], rule, segments) : undefined)} data-testid={`select-utm-kind-${ruleIndex}-${param}`}>
                  {!required && <option value="">Not sent</option>}
                  {SOURCE_KINDS.filter((item) => param !== 'campaign' || item.kind === 'ruleName').map((item) => <option key={item.kind} value={item.kind}>{item.label}</option>)}
                </select>
                {source?.kind === 'ruleName' && <select className={inputClass} value={source.ruleId} onChange={(event) => setParam(param, { kind: 'ruleName', ruleId: event.target.value })} data-testid={`select-utm-rule-${ruleIndex}-${param}`}>{chain.map((item) => <option key={item.id} value={item.id}>{item.name}{item.id === rule.id ? ' (this Rule)' : ''}</option>)}</select>}
                {source?.kind === 'segment' && <select className={inputClass} value={source.segmentId} onChange={(event) => setParam(param, { kind: 'segment', segmentId: event.target.value })} data-testid={`select-utm-segment-${ruleIndex}-${param}`}>{segments.map((segment) => <option key={segment.id} value={segment.id}>{segment.label}</option>)}</select>}
                {source?.kind === 'tag' && <div className="grid grid-cols-2 gap-2"><select className={inputClass} value={source.ruleId} onChange={(event) => setParam(param, { ...source, ruleId: event.target.value })} data-testid={`select-utm-tag-rule-${ruleIndex}-${param}`}>{chain.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select className={inputClass} value={source.tag} onChange={(event) => setParam(param, { ...source, tag: event.target.value as 'platform' | 'entityType' })} data-testid={`select-utm-tag-${ruleIndex}-${param}`}><option value="platform">Platform</option><option value="entityType">Entity type</option></select></div>}
                {source?.kind === 'literal' && <input className={`${inputClass} font-mono`} value={source.value} onChange={(event) => setParam(param, { kind: 'literal', value: event.target.value })} placeholder="cpc" data-testid={`input-utm-literal-${ruleIndex}-${param}`} />}
              </div>
            );
          })}
          <div className="mt-2 grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
            <label className="text-[13px] font-bold text-foreground">Base URL:<input className={`${inputClass} mt-2 font-mono`} value={mapping.baseUrl ?? ''} onChange={(event) => onChange({ ...mapping, baseUrl: event.target.value })} placeholder="https://www.example.com/landing" data-testid={`input-utm-base-url-${ruleIndex}`} /></label>
            <label className="flex items-center gap-2 pb-2 text-[13px] font-bold text-foreground"><input type="checkbox" checked={mapping.baseUrlEditable} onChange={(event) => onChange({ ...mapping, baseUrlEditable: event.target.checked })} className="h-4 w-4 rounded-sm border-gray-300 text-primary focus:ring-primary" data-testid={`checkbox-utm-base-editable-${ruleIndex}`} /> Editable in Build</label>
            <label className="text-[13px] font-bold text-foreground">Case:<select className={`${inputClass} mt-2`} value={mapping.casePolicy} onChange={(event) => onChange({ ...mapping, casePolicy: event.target.value as UtmMapping['casePolicy'] })} data-testid={`select-utm-case-${ruleIndex}`}><option value="lower">Lowercase only</option><option value="asIs">As built</option></select></label>
          </div>
        </div>
      )}
    </div>
  );
}


// The Rule's identity: name and key, delimiter, platform and entity type. A
// child takes its delimiter and platform from its parent, so both lock.
export function RuleBasics({ rule, ruleIndex, onChange, onTags }: { rule: Rule; ruleIndex: number; onChange: (updates: Partial<Rule>) => void; onTags: (patch: { platform?: string; entityType?: string }) => void }) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-[1fr_1fr_120px]">
        <label className="text-[13px] font-bold text-foreground">Rule name:<input className={`${inputClass} mt-2`} value={rule.name} onChange={(event) => onChange({ name: event.target.value, key: slugify(event.target.value) || `rule_${ruleIndex + 1}` })} placeholder="e.g. Google Campaigns" data-testid={`input-rule-name-${ruleIndex}`} /></label>
        <label className="text-[13px] font-bold text-foreground">Key: <span className="font-normal text-muted-foreground ml-1">(machine name)</span><input className={`${inputClass} mt-2 font-mono`} value={rule.key} onChange={(event) => onChange({ key: event.target.value.toLowerCase().replaceAll(' ', '_') })} data-testid={`input-rule-key-${ruleIndex}`} /></label>
        <label className="text-[13px] font-bold text-foreground">Join with:<input className={`${inputClass} mt-2 font-mono text-center`} maxLength={1} value={rule.delimiter} disabled={Boolean(rule.parent)} title={rule.parent ? 'Set by the parent Rule' : undefined} onChange={(event) => onChange({ delimiter: event.target.value })} placeholder="-" data-testid={`input-rule-delimiter-${ruleIndex}`} /></label>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="text-[13px] font-bold text-foreground">Platform: <span className="font-normal text-muted-foreground ml-1">(optional)</span><select className={`${inputClass} mt-2`} value={rule.tags?.platform ?? ''} disabled={Boolean(rule.parent)} title={rule.parent ? 'Set by the parent Rule' : undefined} onChange={(event) => onTags({ platform: event.target.value })} data-testid={`input-rule-platform-${ruleIndex}`}><option value="">None</option>{rule.tags?.platform && !isPlatform(rule.tags.platform) ? <option value={rule.tags.platform}>{rule.tags.platform} (not a known platform)</option> : null}{PLATFORMS.map((platform) => <option key={platform.id} value={platform.id}>{platform.name}</option>)}</select></label>
        <label className="text-[13px] font-bold text-foreground">Entity type: <span className="font-normal text-muted-foreground ml-1">(optional)</span><input className={`${inputClass} mt-2`} value={rule.tags?.entityType ?? ''} onChange={(event) => onTags({ entityType: event.target.value })} placeholder="e.g. campaign, ad_set" data-testid={`input-rule-entity-type-${ruleIndex}`} /></label>
      </div>
    </>
  );
}

// Where a live scan reads the Rule's names (Stage 2): dataset, table, column
// and an optional filter.
export function SourcePanel({ rule, ruleIndex, onChange }: { rule: Rule; ruleIndex: number; onChange: (updates: Partial<Rule>) => void }) {
  const toggleFilter = () => {
    if (rule.source.filter) {
      const source = { ...rule.source };
      delete source.filter;
      onChange({ source });
    } else {
      onChange({ source: { ...rule.source, filter: { column: 'status', in: ['active'] } } });
    }
  };
  return (
    <div className="rounded-lg border border-border/50 bg-muted/20 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><Database className="h-4 w-4 text-muted-foreground" /><div><div className="text-[13px] font-bold text-foreground">Source mapping</div><div className="text-[11px] font-bold text-muted-foreground mt-0.5">Where a live scan reads this Rule's names.</div></div></div><button type="button" className="text-[13px] font-bold text-foreground underline-offset-2 hover:underline" onClick={toggleFilter} data-testid={`button-toggle-filter-${ruleIndex}`}>{rule.source.filter ? 'Remove filter' : 'Add filter'}</button></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3"><label className="text-[11px] font-bold text-foreground">Dataset:<input className={`${inputClass} mt-1.5 font-mono text-[12px]`} value={rule.source.dataset} onChange={(event) => onChange({ source: { ...rule.source, dataset: event.target.value } })} data-testid={`input-source-dataset-${ruleIndex}`} /></label><label className="text-[11px] font-bold text-foreground">Table:<input className={`${inputClass} mt-1.5 font-mono text-[12px]`} value={rule.source.table} onChange={(event) => onChange({ source: { ...rule.source, table: event.target.value } })} data-testid={`input-source-table-${ruleIndex}`} /></label><label className="text-[11px] font-bold text-foreground">Name column:<input className={`${inputClass} mt-1.5 font-mono text-[12px]`} value={rule.source.nameColumn} onChange={(event) => onChange({ source: { ...rule.source, nameColumn: event.target.value } })} data-testid={`input-source-name-column-${ruleIndex}`} /></label></div>
      {rule.source.filter && <div className="mt-4 grid gap-3 sm:grid-cols-2 border-t border-border/50 pt-4"><label className="text-[11px] font-bold text-foreground">Filter column:<input className={`${inputClass} mt-1.5 font-mono text-[12px]`} value={rule.source.filter.column} onChange={(event) => onChange({ source: { ...rule.source, filter: { ...rule.source.filter!, column: event.target.value } } })} data-testid={`input-source-filter-col-${ruleIndex}`} /></label><label className="text-[11px] font-bold text-foreground">Filter values: <span className="font-normal text-muted-foreground ml-1">(comma separated)</span><CommaListInput className={`${inputClass} mt-1.5 font-mono text-[12px]`} value={rule.source.filter.in} onChange={(list) => onChange({ source: { ...rule.source, filter: { ...rule.source.filter!, in: list } } })} placeholder="active, published" testId={`input-source-filter-in-${ruleIndex}`} /></label></div>}
    </div>
  );
}
