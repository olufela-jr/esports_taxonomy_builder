import { useState } from 'react';
import { Shuffle, Trash2 } from 'lucide-react';
import { dependentsOf, resolveRule, type Definition, type Rule, type RuleSet as EngineRuleSet } from '@taxo/shared';
import { useLocation } from 'wouter';
import { segmentMeta } from '@/lib/segment-meta';
import { Breadcrumbs, type Crumb } from '../Breadcrumbs';
import { SegmentChipRow } from '../SegmentChipRow';
import { cardClass } from '../styles';
import { addSegment, moveSegmentTo, removeSegment, updateRule, updateSegment, updateTags } from './draft';
import { ParentPicker, RuleBasics, SourcePanel, UtmPanel } from './RuleFields';
import { SegmentDrawer } from './SegmentDrawer';

// Where the sticky chip header and the drawer start: below the app header
// (68px) and the save bar (61px).
const BELOW_SAVE_BAR = 129;
// How long a removed chip takes to leave before it is gone from the draft.
const LEAVE_MS = 150;

type RuleEditorProps = {
  rule: Rule;
  ruleIndex: number;
  ruleSetName: string;
  base: string; // the Rule Set's URL
  segmentId: string | null; // the segment open in the drawer
  rules: Rule[];
  draftRuleSet: EngineRuleSet;
  issues: string[];
  definitions: Definition[];
  readOnly: boolean;
  onRules: (rules: Rule[]) => void;
};

// One Rule of the Rule Set being managed. The name's segments sit in a sticky
// row of numbered chips; clicking one edits it in a drawer beside them. Edits
// go into the Rule Set's draft, and the save bar above saves the whole set.
export function RuleEditor({ rule, ruleIndex, ruleSetName, base, segmentId, rules, draftRuleSet, issues, definitions, readOnly, onRules }: RuleEditorProps) {
  const [, setLocation] = useLocation();
  const [example, setExample] = useState(false);
  const [seed, setSeed] = useState(0);
  const [leaving, setLeaving] = useState<string | null>(null);
  const href = `${base}/${rule.id}`;
  const dependents = dependentsOf(draftRuleSet, rule.id);
  const change = (updates: Partial<Rule>) => onRules(updateRule(rules, rule.id, updates));

  // The chips show the whole name: inherited segments first. A Rule that
  // cannot be resolved yet shows its own segments, with its problems listed.
  const resolution = resolveRule(rule, draftRuleSet, definitions);
  const shown = resolution.errors.length === 0 ? resolution.rule : rule;
  const meta = segmentMeta(rule, draftRuleSet);
  const position = segmentId ? shown.segments.findIndex((segment) => segment.id === segmentId) : -1;
  const open = position >= 0 ? shown.segments[position] : undefined;
  const ownIndex = open ? rule.segments.findIndex((segment) => segment.id === open.id) : -1;
  // The drawer edits the stored segment, which still names its definition.
  const stored = ownIndex >= 0 ? rule.segments[ownIndex] : open;

  const openSegment = (id: string) => setLocation(`${href}/segments/${id}`);
  const closeDrawer = () => setLocation(href);
  const add = () => {
    const next = addSegment(rules, rule.id);
    onRules(next.rules);
    openSegment(next.segmentId);
  };
  const remove = (id: string) => {
    setLeaving(id);
    window.setTimeout(() => {
      setLeaving(null);
      onRules(removeSegment(rules, rule.id, id));
      closeDrawer();
    }, LEAVE_MS);
  };
  const removeRule = () => {
    if (!window.confirm(`Remove the Rule "${rule.name}"?`)) return;
    onRules(rules.filter((item) => item.id !== rule.id));
    setLocation(base);
  };

  const crumbs: Crumb[] = [{ label: 'Rule Sets', href: '/rules' }, { label: ruleSetName || 'Untitled Rule Set', href: base }, { label: rule.name || 'Untitled Rule', href }];
  if (open) crumbs.push({ label: open.label || 'Untitled segment' });

  return (
    <div className={open ? 'lg:pr-[440px]' : ''}>
      <div className="mx-auto max-w-4xl">
        <Breadcrumbs items={crumbs} />
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-medium tracking-tight text-foreground">{rule.name || 'Untitled Rule'}</h1>
            {dependents.length > 0 && <p className="mt-2 text-[12px] font-bold text-muted-foreground" data-testid={`text-rule-dependents-${ruleIndex}`}>Parent of {dependents.map((dependent) => dependent.ruleName).join(', ')}: it cannot be removed while they inherit from it.</p>}
          </div>
          {!readOnly && <button type="button" className="rounded-md p-2 text-muted-foreground transition hover:bg-destructive/15 hover:text-destructive disabled:opacity-30" onClick={removeRule} disabled={dependents.length > 0} title={dependents.length > 0 ? 'Other Rules inherit from this one.' : 'Remove Rule'} aria-label="Remove rule" data-testid={`button-remove-rule-${ruleIndex}`}><Trash2 className="h-4 w-4" /></button>}
        </div>

        <section style={{ top: BELOW_SAVE_BAR }} className="sticky z-[9] mb-6 rounded-xl border border-border/30 bg-card px-6 py-5 shadow-sm" data-testid="section-rule-chips">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="text-[11px] font-bold text-muted-foreground">{example ? `An example ${rule.name} name, built from sample values.` : `The segments of a ${rule.name} name, in order. Click one to edit it.`}</div>
            <div className="flex items-center gap-2">
              {example && <button type="button" className="inline-flex h-7 items-center gap-1.5 rounded-[4px] border border-border px-2 text-[11px] font-bold text-foreground transition hover:bg-muted" onClick={() => setSeed((current) => current + 1 + Math.floor(Math.random() * 1000))} data-testid="button-shuffle-example"><Shuffle className="h-3.5 w-3.5" /> Shuffle</button>}
              <label className="inline-flex cursor-pointer items-center gap-2 text-[11px] font-bold text-foreground"><input type="checkbox" className="peer sr-only" checked={example} onChange={(event) => { setExample(event.target.checked); setSeed(0); }} data-testid="toggle-show-example" /><span className="relative h-4 w-7 rounded-full bg-muted transition peer-checked:bg-primary after:absolute after:left-0.5 after:top-0.5 after:h-3 after:w-3 after:rounded-full after:bg-foreground after:transition peer-checked:after:translate-x-3" aria-hidden="true" /> Show example</label>
            </div>
          </div>
          <SegmentChipRow
            rule={shown}
            meta={meta}
            mode={example ? 'example' : 'labels'}
            seed={seed}
            numbered
            showName={example}
            selectedSegmentId={open?.id ?? null}
            leavingSegmentId={leaving}
            onSelect={openSegment}
            onAdd={readOnly ? undefined : add}
            onReorder={readOnly ? undefined : (id, toIndex) => onRules(moveSegmentTo(rules, rule.id, id, toIndex))}
            testId="chips-rule"
          />
        </section>

        {issues.length > 0 && <ul className="mb-6 list-disc rounded-[4px] border border-destructive/30 bg-destructive/10 py-3 pl-9 pr-4 text-xs font-semibold text-destructive" data-testid={`list-rule-issues-${ruleIndex}`}>{issues.map((message) => <li key={message}>{message}</li>)}</ul>}

        <div className="space-y-6" data-testid={`card-rule-${ruleIndex}`}>
          <section className={cardClass}>
            <RuleBasics rule={rule} ruleIndex={ruleIndex} onChange={change} onTags={(patch) => onRules(updateTags(rules, rule.id, patch))} />
            <ParentPicker rule={rule} ruleIndex={ruleIndex} rules={rules} draftRuleSet={draftRuleSet} definitions={definitions} onChange={change} />
          </section>
          <UtmPanel rule={rule} ruleIndex={ruleIndex} draftRuleSet={draftRuleSet} definitions={definitions} onChange={(utm) => change({ utm })} />
          <SourcePanel rule={rule} ruleIndex={ruleIndex} onChange={change} />
        </div>
      </div>

      {open && stored && (
        <fieldset disabled={readOnly}>
          <SegmentDrawer
            segment={stored}
            meta={meta[open.id]}
            position={position + 1}
            total={shown.segments.length}
            rule={rule}
            ruleIndex={ruleIndex}
            ownIndex={ownIndex}
            owner={rules.find((item) => item.id === meta[open.id]?.ownerRuleId)}
            base={base}
            definitions={definitions}
            inheritedBy={dependentsOf(draftRuleSet, rule.id, open.id).map((dependent) => dependent.ruleName)}
            top={BELOW_SAVE_BAR}
            onChange={(updates) => onRules(updateSegment(rules, rule.id, open.id, updates))}
            onMove={(toIndex) => onRules(moveSegmentTo(rules, rule.id, open.id, toIndex))}
            onRemove={() => remove(open.id)}
            onClose={closeDrawer}
          />
        </fieldset>
      )}
    </div>
  );
}
