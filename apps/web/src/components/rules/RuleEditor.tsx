import { useEffect, useRef, useState } from 'react';
import { Plus, Shuffle, Trash2 } from 'lucide-react';
import { dependentsOf, resolveRule, type Definition, type Rule, type RuleSet as EngineRuleSet } from '@taxo/shared';
import { useLocation } from 'wouter';
import { segmentMeta } from '@/lib/segment-meta';
import { Breadcrumbs, type Crumb } from '../Breadcrumbs';
import { SegmentChipRow } from '../SegmentChipRow';
import { buttonQuiet, cardClass } from '../styles';
import { addSegment, moveSegmentTo, removeSegment, updateRule, updateSegment, updateTags } from './draft';
import { ParentPicker, RuleBasics, SourcePanel, UtmPanel } from './RuleFields';
import { SegmentCard } from './SegmentCard';

// Where the sticky chip header starts: below the app header (68px) and the
// save bar (61px).
const BELOW_SAVE_BAR = 129;
// How long a removed chip takes to leave before it is gone from the draft.
const LEAVE_MS = 150;

type RuleEditorProps = {
  rule: Rule;
  ruleIndex: number;
  ruleSetName: string;
  base: string; // the Rule Set's URL
  segmentId: string | null; // the segment to select on arrival, from the URL
  rules: Rule[];
  draftRuleSet: EngineRuleSet;
  issues: string[];
  definitions: Definition[];
  readOnly: boolean;
  onRules: (rules: Rule[]) => void;
};

// One Rule of the Rule Set being managed. The name's segments sit in a sticky
// row of numbered chips, and every segment is listed below to edit in place.
// Clicking a chip scrolls to its segment; working in a segment lights its
// chip. Edits go into the Rule Set's draft, and the save bar above saves the
// whole set.
export function RuleEditor({ rule, ruleIndex, ruleSetName, base, segmentId, rules, draftRuleSet, issues, definitions, readOnly, onRules }: RuleEditorProps) {
  const [, setLocation] = useLocation();
  const [example, setExample] = useState(false);
  const [seed, setSeed] = useState(0);
  const [leaving, setLeaving] = useState<string | null>(null);
  // The selected segment is page state, not URL state, so clicking around does
  // not pile up history; a /segments/:id URL (from Definitions) seeds it.
  const [selected, setSelected] = useState<string | null>(segmentId);
  const header = useRef<HTMLElement>(null);
  const focusLabel = useRef<string | null>(null);
  const href = `${base}/${rule.id}`;
  const dependents = dependentsOf(draftRuleSet, rule.id);
  const change = (updates: Partial<Rule>) => onRules(updateRule(rules, rule.id, updates));

  // The chips show the whole name: inherited segments first. A Rule that
  // cannot be resolved yet shows its own segments, with its problems listed.
  const resolution = resolveRule(rule, draftRuleSet, definitions);
  const shown = resolution.errors.length === 0 ? resolution.rule : rule;
  const meta = segmentMeta(rule, draftRuleSet);

  // Scroll a segment's card to just below the sticky chips.
  const scrollTo = (id: string, behavior: ScrollBehavior) => {
    const card = document.getElementById(`segment-${id}`);
    if (!card) return;
    const offset = BELOW_SAVE_BAR + (header.current?.offsetHeight ?? 0) + 16;
    window.scrollTo({ top: card.getBoundingClientRect().top + window.scrollY - offset, behavior });
  };

  useEffect(() => {
    setSelected(segmentId);
    if (segmentId) requestAnimationFrame(() => scrollTo(segmentId, 'auto'));
    // Only when the URL names a segment; scrollTo reads the live page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segmentId, rule.id]);

  // A segment just added: once its card exists, scroll to it and focus its label.
  useEffect(() => {
    const id = focusLabel.current;
    if (!id) return;
    focusLabel.current = null;
    scrollTo(id, 'smooth');
    document.getElementById(`segment-${id}`)?.querySelector<HTMLElement>('input')?.focus({ preventScroll: true });
  });

  const openSegment = (id: string) => {
    setSelected(id);
    scrollTo(id, 'smooth');
  };
  const add = () => {
    const next = addSegment(rules, rule.id);
    onRules(next.rules);
    setSelected(next.segmentId);
    focusLabel.current = next.segmentId;
  };
  const remove = (id: string) => {
    setLeaving(id);
    window.setTimeout(() => {
      setLeaving(null);
      onRules(removeSegment(rules, rule.id, id));
      setSelected(null);
    }, LEAVE_MS);
  };
  const removeRule = () => {
    if (!window.confirm(`Remove the Rule "${rule.name}"?`)) return;
    onRules(rules.filter((item) => item.id !== rule.id));
    setLocation(base);
  };

  const crumbs: Crumb[] = [{ label: 'Rule Sets', href: '/rules' }, { label: ruleSetName || 'Untitled Rule Set', href: base }, { label: rule.name || 'Untitled Rule' }];

  return (
    <div className="mx-auto max-w-4xl">
        <Breadcrumbs items={crumbs} />
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-medium tracking-tight text-foreground">{rule.name || 'Untitled Rule'}</h1>
            {dependents.length > 0 && <p className="mt-2 text-[12px] font-bold text-muted-foreground" data-testid={`text-rule-dependents-${ruleIndex}`}>Parent of {dependents.map((dependent) => dependent.ruleName).join(', ')}: it cannot be removed while they inherit from it.</p>}
          </div>
          {!readOnly && <button type="button" className="rounded-md p-2 text-muted-foreground transition hover:bg-destructive/15 hover:text-destructive disabled:opacity-30" onClick={removeRule} disabled={dependents.length > 0} title={dependents.length > 0 ? 'Other Rules inherit from this one.' : 'Remove Rule'} aria-label="Remove rule" data-testid={`button-remove-rule-${ruleIndex}`}><Trash2 className="h-4 w-4" /></button>}
        </div>

        <section ref={header} style={{ top: BELOW_SAVE_BAR }} className="sticky z-[9] mb-6 rounded-xl border border-border/30 bg-card px-6 py-5 shadow-sm" data-testid="section-rule-chips">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="text-[11px] font-bold text-muted-foreground">{example ? `An example ${rule.name} name, built from sample values.` : `The segments of a ${rule.name} name, in order. Click one to go to it below.`}</div>
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
            selectedSegmentId={selected}
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

          <section data-testid="list-segments">
            <h2 className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Segments</h2>
            {shown.segments.length === 0 && <div className="mb-3 rounded-xl border border-dashed border-border bg-card/50 px-6 py-8 text-center text-sm text-muted-foreground">No segments yet.</div>}
            <div className="space-y-4">
              {shown.segments.map((segment, position) => {
                const ownIndex = rule.segments.findIndex((item) => item.id === segment.id);
                // A card edits the stored segment, which still names its definition.
                const stored = ownIndex >= 0 ? rule.segments[ownIndex] : segment;
                return (
                  <SegmentCard
                    key={segment.id}
                    segment={stored}
                    meta={meta[segment.id]}
                    position={position + 1}
                    total={shown.segments.length}
                    rule={rule}
                    ruleIndex={ruleIndex}
                    ownIndex={ownIndex}
                    owner={rules.find((item) => item.id === meta[segment.id]?.ownerRuleId)}
                    base={base}
                    definitions={definitions}
                    inheritedBy={dependentsOf(draftRuleSet, rule.id, segment.id).map((dependent) => dependent.ruleName)}
                    selected={selected === segment.id}
                    leaving={leaving === segment.id}
                    onSelect={() => setSelected(segment.id)}
                    onChange={(updates) => onRules(updateSegment(rules, rule.id, segment.id, updates))}
                    onMove={(toIndex) => onRules(moveSegmentTo(rules, rule.id, segment.id, toIndex))}
                    onRemove={() => remove(segment.id)}
                  />
                );
              })}
            </div>
            {!readOnly && <button type="button" className={`${buttonQuiet} mt-4`} onClick={add} data-testid="button-add-segment"><Plus className="h-4 w-4" /> Add segment</button>}
          </section>

          <UtmPanel rule={rule} ruleIndex={ruleIndex} draftRuleSet={draftRuleSet} definitions={definitions} onChange={(utm) => change({ utm })} />
          <SourcePanel rule={rule} ruleIndex={ruleIndex} onChange={change} />
        </div>
    </div>
  );
}
