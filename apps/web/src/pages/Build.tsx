import { useState, useEffect } from 'react';
import { useUi } from '@/context/UiContext';
import { useRuleSets, type Segment, type Rule } from '@/hooks/use-rulesets';
import { compose } from '@taxo/shared';
import { AlertCircle, Check, Copy, Database, Filter, Zap } from 'lucide-react';

const inputClass = 'h-9 w-full rounded-[4px] border-0 bg-[#EAE8E3] px-3 text-[13px] font-semibold text-gray-900 shadow-inner outline-none transition-all placeholder:text-gray-500 focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50 hover:bg-[#F2F0EB]';
const buttonPrimary = 'inline-flex h-9 items-center justify-center gap-2 rounded-[4px] bg-primary px-4 text-[13px] font-bold text-primary-foreground transition-all hover:brightness-110 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50';

function PageHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description?: string }) {
  return (
    <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <div className="mb-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-primary">{eyebrow}</div>
        <h1 className="font-serif text-3xl font-medium tracking-tight text-foreground sm:text-4xl">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>}
      </div>
    </div>
  );
}

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

export function Build() {
  const { ruleSetId, ruleId } = useUi();
  const { ruleSets } = useRuleSets();

  const ruleSet = ruleSets.find(rs => rs.id === ruleSetId);
  const rule = ruleSet?.rules.find((r: Rule) => r.id === ruleId);

  const [values, setValues] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);

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

  const segments = rule.segments ?? [];
  const result = compose(rule, values);
  const valid = result.errors.length === 0 && Boolean(segments.length);
  const displayOutput = result.name || 'Fill segments to generate a name';
  const missing = segments.filter((segment) => segment.required && !values[segment.key]?.trim());
  const copyName = async () => { if (!valid) return; await navigator.clipboard?.writeText(result.name); setCopied(true); window.setTimeout(() => setCopied(false), 1800); };

  return (
    <div>
      <PageHeading eyebrow="Workspace" title="Compose a name" description="Fill the required segments to generate a compliant name." />
      <div className="grid gap-6 xl:grid-cols-[1.2fr_.8fr]">
        <section className="rounded-xl bg-card p-6 shadow-sm border border-border/30">
          <div className="mb-8 flex items-start justify-between gap-4">
            <div className="flex flex-col">
              <div className="font-serif text-2xl font-medium text-foreground">Naming parameters</div>
              <p className="text-[13px] font-bold text-muted-foreground mt-1">Values for {rule.name}.</p>
            </div>
            <div className="flex h-5 w-5 items-center justify-center rounded-full border border-muted-foreground/30 text-muted-foreground"><Zap className="h-3 w-3" /></div>
          </div>

          <div className="space-y-5">
            {segments.map((segment: Segment) => (
              <div key={segment.id}>
                <div className="mb-2.5 flex items-center justify-between">
                  <label htmlFor={`build-${segment.key}`} className="text-[13px] font-bold text-foreground">
                    {segment.label}:<span className="ml-2 font-mono text-[10px] font-normal text-muted-foreground">{segment.key}</span>
                  </label>
                  {segment.required ? <span className="inline-flex items-center gap-1.5 rounded-full border border-destructive/50 bg-destructive/10 px-2 py-0.5"><span className="h-2 w-2 rounded-full bg-destructive" /><span className="text-[10px] font-bold text-foreground">Required</span></span> : <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/30 px-2 py-0.5"><span className="h-2 w-2 rounded-full bg-muted-foreground" /><span className="text-[10px] font-bold text-foreground">Optional</span></span>}
                </div>
                {segment.kind === 'enum' ? (
                  <select
                    id={`build-${segment.key}`}
                    className={inputClass}
                    value={values[segment.key] ?? ''}
                    onChange={(event) => setValues((current) => ({ ...current, [segment.key]: event.target.value }))}
                    data-testid={`select-build-${segment.key}`}
                  >
                    <option value="">Select {segment.label.toLowerCase()}</option>
                    {segment.allowedValues.map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                ) : (
                  <input
                    id={`build-${segment.key}`}
                    className={inputClass}
                    maxLength={segment.maxLength}
                    value={values[segment.key] ?? ''}
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
              <div className="font-serif text-2xl font-medium text-foreground">Output</div>
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
            </div>
          </div>
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
    </div>
  );
}
