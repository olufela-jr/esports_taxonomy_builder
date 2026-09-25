import { useState, useEffect } from 'react';
import { buildTrackingUrl, compose, parse, resolveRule, type Definition, type ParentLine, type Rule, type Segment } from '@taxo/shared';
import { AlertCircle, ArrowRight, Check, Copy, Database, Filter, Link2, Lock, Zap } from 'lucide-react';
import type { RuleSet } from '@/data/store';
import { BatchBuilder } from './BatchBuilder';
import { ChildBatchBuilder } from './ChildBatchBuilder';
import { PageHeading } from './PageHeading';
import { buttonPrimary, buttonQuiet, inputClass } from './styles';

function EmptyState() {
  return (
    <div className="flex min-h-[430px] flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/50 px-8 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded bg-muted text-muted-foreground">
        <Filter className="h-6 w-6" />
      </div>
      <h2 className="mt-5 text-sm font-semibold text-foreground">No Rule selected</h2>
      <p className="mt-1.5 max-w-xs text-xs leading-relaxed text-muted-foreground">
        Select a Rule Set and a Rule from the sidebar to start building a name.
      </p>
    </div>
  );
}

// Feature 2: compose a compliant name from the Rule selected in the shell.
// onSelectRule: chaining ("Build <child> under this") is the one place the app
// changes the persistent Rule selection for the user, by an explicit action.
export function Builder({ ruleSet, rule, definitions, onSelectRule }: { ruleSet: RuleSet | undefined; rule: Rule | undefined; definitions: Definition[]; onSelectRule: (id: string) => void }) {
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

  useEffect(() => {
    setValues({});
    setCopied(false);
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
  const children = ruleSet.rules.filter((candidate) => candidate.parent?.ruleId === rule.id);

  const selections = { ...values, ...inheritedValues };
  const result = compose(active, selections);
  const valid = parentReady && result.errors.length === 0 && Boolean(segments.length);
  const displayOutput = result.name || 'Fill segments to generate a name';
  const missing = segments.filter((segment) => segment.required && !selections[segment.key]?.trim());
  const copyName = async () => { if (!valid) return; await navigator.clipboard?.writeText(result.name); setCopied(true); window.setTimeout(() => setCopied(false), 1800); };
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
              <input id="build-parent" className={`${inputClass} mt-2 font-mono`} value={parentName} onChange={(event) => setParentNames((current) => ({ ...current, [rule.id]: event.target.value }))} placeholder={`e.g. ${resolvedParent?.segments.map((segment) => segment.kind === 'enum' ? segment.allowedValues[0]?.code ?? 'value' : segment.label.toLowerCase()).join(parentRule.delimiter) ?? ''}`} data-testid="input-build-parent" />
              {parentName && parentParse && !parentParse.valid && (
                <ul className="mt-3 list-disc pl-5 text-xs font-semibold text-destructive" data-testid="status-build-parent-violations">{parentParse.violations.map((violation) => <li key={`${violation.segmentKey}-${violation.reason}`}>{violation.segmentKey === '__name__' ? violation.reason : `${violation.segmentKey}: ${violation.reason}`}</li>)}</ul>
              )}
              {!parentName && <p className="mt-2 text-[11px] font-bold text-muted-foreground">The inherited segments fill in from the {parentRule.name.toLowerCase()} name.</p>}
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
                    disabled={inheritedKeys.has(segment.key)}
                    title={inheritedKeys.has(segment.key) ? `From the ${parentRule?.name ?? 'parent'} name` : undefined}
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
              </div>
            ))}
          </div>
        </section>
        <section className="self-start xl:sticky xl:top-[92px]">
          <div className="overflow-hidden rounded-xl bg-card p-6 shadow-sm border border-border/30">
            <div className="flex items-center justify-between">
              <div className="font-display text-2xl font-medium text-foreground">Output</div>
              {valid ? <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5"><span className="h-2 w-2 rounded-full bg-primary" /><span className="text-[10px] font-bold text-foreground">Compliant</span></div> : <div className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/30 px-2 py-0.5"><span className="h-2 w-2 rounded-full bg-muted-foreground" /><span className="text-[10px] font-bold text-foreground">Incomplete</span></div>}
            </div>
            <div className="my-8 break-all font-mono text-xl leading-relaxed text-primary sm:text-2xl" data-testid="text-build-preview">{displayOutput}</div>
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
