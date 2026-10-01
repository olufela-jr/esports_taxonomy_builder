import { useState } from 'react';
import { checkBaseUrl, resolveRule, type Definition, type ParentLine, type Rule } from '@taxo/shared';
import { Filter, Link2 } from 'lucide-react';
import type { User } from '@/data/auth';
import type { BuildDraft, BuildDraftDraft, RuleSet, ValueRequest, ValueRequestDraft } from '@/data/store';
import { BatchBuilder } from './BatchBuilder';
import type { Drafting } from './BatchDrafts';
import { ChildBatchBuilder } from './ChildBatchBuilder';
import { PageHeading } from './PageHeading';
import { EmptyState as SharedEmptyState } from './results';
import { SegmentChipRow } from './SegmentChipRow';
import { segmentMeta } from '@/lib/segment-meta';
import { inputClass } from './styles';

function EmptyState() {
  return (
    <SharedEmptyState
      icon={<Filter className="h-6 w-6" />}
      title="No Rule selected"
      body="Select a Rule Set and a Rule from the sidebar to start building names."
    />
  );
}

// A stable empty list, so a child batch is not reset on every render.
const NO_LINES: ParentLine[] = [];

// Feature 2: compose compliant names from the Rule selected in the shell.
// Build is batch only: every combination of the ticked values, one name or
// many; a child Rule is built across pasted or carried parent names (D34).
// onSelectRule: carrying names to a child Rule is the one place the app
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

export function Builder({ ruleSet, rule, definitions, onSelectRule, user, requests, drafts, onCreateRequest, onCreateDraft, onUpdateDraft, onDeleteDraft }: BuilderProps) {
  // A base URL typed at build time, per Rule, when the mapping allows editing.
  const [baseUrls, setBaseUrls] = useState<Record<string, string>>({});
  // Parent names carried from a parent-level batch into a child batch, per child Rule (D34).
  const [carried, setCarried] = useState<Record<string, ParentLine[]>>({});
  // The first value chosen per segment, per Rule, for the example name at the top.
  const [previews, setPreviews] = useState<Record<string, Record<string, string>>>({});

  if (!ruleSet || !rule) {
    return (
      <div>
        <PageHeading eyebrow="Workspace" title="Compose names" description="Select a Rule Set and Rule, then pick the values to combine." />
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
        <PageHeading eyebrow="Workspace" title="Compose names" description={`${rule.name} cannot be built until an admin fixes the problems below in Manage Rules.`} />
        <ul className="list-disc rounded-xl border border-destructive/30 bg-destructive/10 py-4 pl-9 pr-4 text-sm font-semibold text-destructive" data-testid="text-build-resolution-errors">{resolution.errors.map((message) => <li key={message}>{message}</li>)}</ul>
      </div>
    );
  }
  const active = resolution.rule;
  const parentRule = rule.parent ? ruleSet.rules.find((candidate) => candidate.id === rule.parent?.ruleId) : undefined;
  const resolvedParent = parentRule ? resolveRule(parentRule, ruleSet, definitions).rule : undefined;
  const children = ruleSet.rules.filter((candidate) => candidate.parent?.ruleId === rule.id);

  const mapping = active.utm;
  const baseUrl = mapping ? (mapping.baseUrlEditable ? (baseUrls[rule.id] ?? mapping.baseUrl ?? '') : (mapping.baseUrl ?? '')) : '';
  const baseUrlErrors = baseUrl ? checkBaseUrl(baseUrl) : [];

  const carryToChild = (childId: string, lines: ParentLine[]) => {
    setCarried((current) => ({ ...current, [childId]: lines }));
    onSelectRule(childId);
  };
  const preview = previews[rule.id] ?? {};
  const onPreview = (selections: Record<string, string>) => setPreviews((current) => ({ ...current, [rule.id]: selections }));
  const drafting: Drafting = { user, definitions, requests, drafts, onCreateRequest, onCreateDraft, onUpdateDraft, onDeleteDraft };

  return (
    <div>
      <PageHeading eyebrow="Workspace" title="Compose names" description={resolvedParent ? `Paste ${parentRule?.name.toLowerCase()} names, pick the values to combine, and generate every ${rule.name.toLowerCase()} name at once.` : 'Pick the values to combine and generate every name at once. Tick one of each for a single name.'} />
      <section className="mb-6 rounded-xl border border-border/30 bg-card px-6 py-5 shadow-sm" data-testid="section-build-example">
        <div className="mb-3 text-[11px] font-bold text-muted-foreground" data-testid="text-build-example">{Object.keys(preview).length > 0 ? `The first ${rule.name} name your choices make. Greyed values are examples until you choose your own.` : `An example ${rule.name} name. Tick values below to generate your own.`}</div>
        <SegmentChipRow rule={active} meta={segmentMeta(rule, ruleSet)} mode="values" selections={preview} fillExamples badges={false} testId="chips-build" />
      </section>
      {mapping && (
        <div className="mb-6 rounded-xl bg-card p-6 shadow-sm border border-border/30" data-testid="section-build-url">
          <label className="flex items-center gap-2 font-display text-xl font-medium text-foreground" htmlFor="build-base-url"><Link2 className="h-4 w-4 text-muted-foreground" /> Tracking URL base</label>
          <input id="build-base-url" className={`${inputClass} mt-3 font-mono`} value={baseUrl} disabled={!mapping.baseUrlEditable} title={mapping.baseUrlEditable ? undefined : 'Fixed by the Rule'} onChange={(event) => setBaseUrls((current) => ({ ...current, [rule.id]: event.target.value }))} placeholder="https://www.example.com/landing" data-testid="input-build-base-url" />
          {baseUrlErrors.length > 0 && <ul className="mt-3 list-disc pl-5 text-[12px] font-semibold text-destructive" data-testid="status-build-url-errors">{baseUrlErrors.map((message) => <li key={message}>{message}</li>)}</ul>}
        </div>
      )}
      {rule.parent && resolvedParent
        ? <ChildBatchBuilder rule={rule} active={active} parentRule={resolvedParent} ruleSet={ruleSet} baseUrl={baseUrl} carried={carried[rule.id] ?? NO_LINES} children={children} onCarry={carryToChild} drafting={drafting} onPreview={onPreview} />
        : <BatchBuilder rule={rule} active={active} ruleSet={ruleSet} baseUrl={baseUrl} children={children} onCarry={carryToChild} drafting={drafting} onPreview={onPreview} />}
    </div>
  );
}
