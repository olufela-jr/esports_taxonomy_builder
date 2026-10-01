import { Plus, Trash2 } from 'lucide-react';
import { dependentsOf, type Definition, type Rule, type RuleSet as EngineRuleSet, type Segment } from '@taxo/shared';
import { useLocation } from 'wouter';
import { Breadcrumbs } from '../Breadcrumbs';
import { cardClass } from '../styles';
import { addSegment, moveSegmentTo, removeSegment, updateRule, updateSegment, updateTags } from './draft';
import { InheritedSegments, ParentPicker, RuleBasics, SegmentEditor, SourcePanel, UtmPanel } from './RuleFields';

type RuleEditorProps = {
  rule: Rule;
  ruleIndex: number;
  ruleSetName: string;
  base: string; // the Rule Set's URL
  rules: Rule[];
  draftRuleSet: EngineRuleSet;
  issues: string[];
  definitions: Definition[];
  onRules: (rules: Rule[]) => void;
};

// One Rule of the Rule Set being managed. Edits go into the Rule Set's draft;
// the save bar above saves the whole Rule Set.
export function RuleEditor({ rule, ruleIndex, ruleSetName, base, rules, draftRuleSet, issues, definitions, onRules }: RuleEditorProps) {
  const [, setLocation] = useLocation();
  const dependents = dependentsOf(draftRuleSet, rule.id);
  const change = (updates: Partial<Rule>) => onRules(updateRule(rules, rule.id, updates));

  const removeRule = () => {
    if (!window.confirm(`Remove the Rule "${rule.name}"?`)) return;
    onRules(rules.filter((item) => item.id !== rule.id));
    setLocation(base);
  };

  return (
    <div className="mx-auto max-w-4xl">
      <Breadcrumbs items={[{ label: 'Rule Sets', href: '/rules' }, { label: ruleSetName || 'Untitled Rule Set', href: base }, { label: rule.name || 'Untitled Rule' }]} />
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-medium tracking-tight text-foreground">{rule.name || 'Untitled Rule'}</h1>
          {dependents.length > 0 && <p className="mt-2 text-[12px] font-bold text-muted-foreground" data-testid={`text-rule-dependents-${ruleIndex}`}>Parent of {dependents.map((dependent) => dependent.ruleName).join(', ')}: it cannot be removed while they inherit from it.</p>}
        </div>
        <button type="button" className="rounded-md p-2 text-muted-foreground transition hover:bg-destructive/15 hover:text-destructive disabled:opacity-30" onClick={removeRule} disabled={dependents.length > 0} title={dependents.length > 0 ? 'Other Rules inherit from this one.' : 'Remove Rule'} aria-label="Remove rule" data-testid={`button-remove-rule-${ruleIndex}`}><Trash2 className="h-4 w-4" /></button>
      </div>

      {issues.length > 0 && <ul className="mb-6 list-disc rounded-[4px] border border-destructive/30 bg-destructive/10 py-3 pl-9 pr-4 text-xs font-semibold text-destructive" data-testid={`list-rule-issues-${ruleIndex}`}>{issues.map((message) => <li key={message}>{message}</li>)}</ul>}

      <div className="space-y-6" data-testid={`card-rule-${ruleIndex}`}>
        <section className={cardClass}>
          <RuleBasics rule={rule} ruleIndex={ruleIndex} onChange={change} onTags={(patch) => onRules(updateTags(rules, rule.id, patch))} />
          <ParentPicker rule={rule} ruleIndex={ruleIndex} rules={rules} draftRuleSet={draftRuleSet} definitions={definitions} onChange={change} />
        </section>

        <section className={cardClass}>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-lg font-medium text-foreground">Segments</h2>
            <button type="button" className="inline-flex h-8 items-center gap-1.5 rounded-[4px] border border-border px-3 text-xs font-bold text-foreground transition hover:bg-muted" onClick={() => onRules(addSegment(rules, rule.id).rules)} data-testid={`button-add-segment-${ruleIndex}`}><Plus className="h-3.5 w-3.5" /> Add segment</button>
          </div>
          {rule.segments.length === 0 && <div className="rounded-lg border border-dashed border-border/50 bg-background/30 px-4 py-8 text-center text-[13px] font-bold text-muted-foreground">No segments defined.</div>}
          <InheritedSegments rule={rule} ruleIndex={ruleIndex} draftRuleSet={draftRuleSet} definitions={definitions} />
          <div className="space-y-4">{rule.segments.map((segment: Segment, segmentIndex: number) => <SegmentEditor key={segment.id} segment={segment} ruleIndex={ruleIndex} segmentIndex={segmentIndex} segmentCount={rule.segments.length} definitions={definitions} platform={rule.tags?.platform} inheritedBy={dependentsOf(draftRuleSet, rule.id, segment.id).map((dependent) => dependent.ruleName)} onChange={(updates) => onRules(updateSegment(rules, rule.id, segment.id, updates))} onMove={(direction) => onRules(moveSegmentTo(rules, rule.id, segment.id, segmentIndex + direction))} onRemove={() => onRules(removeSegment(rules, rule.id, segment.id))} />)}</div>
        </section>

        <UtmPanel rule={rule} ruleIndex={ruleIndex} draftRuleSet={draftRuleSet} definitions={definitions} onChange={(utm) => change({ utm })} />
        <SourcePanel rule={rule} ruleIndex={ruleIndex} onChange={change} />
      </div>
    </div>
  );
}
