import { AlertCircle, CornerDownRight, Plus, Trash2 } from 'lucide-react';
import { dependentsOf, platformName, PLATFORMS, resolveRule, type Definition, type Rule, type RuleSet as EngineRuleSet, type RuleSetIssues } from '@taxo/shared';
import { Link, useLocation } from 'wouter';
import { segmentMeta } from '@/lib/segment-meta';
import { Breadcrumbs } from '../Breadcrumbs';
import { SegmentChipRow } from '../SegmentChipRow';
import { buttonDanger, buttonQuiet, inputClass } from '../styles';
import { emptyRule } from './draft';

type RuleSetPageProps = {
  name: string;
  rules: Rule[];
  base: string; // this Rule Set's URL
  isNew: boolean;
  readOnly: boolean;
  draftRuleSet: EngineRuleSet;
  issues: RuleSetIssues;
  definitions: Definition[];
  onName: (name: string) => void;
  onRules: (rules: Rule[]) => void;
  onDelete: () => void;
};

type Group = { platform: string; label: string; count: number; roots: Rule[]; children: Map<string, Rule[]> };

// Rules grouped by platform (the product's order, then any unknown ones, then
// no platform), each group a forest of parent and child Rules. A child shares
// its parent's platform (D47); one that does not, or whose parent is missing
// or part of a cycle, is shown as a root so it is never lost.
function groupRules(rules: Rule[]): Group[] {
  const keys = [...new Set(rules.map((rule) => rule.tags?.platform ?? ''))];
  const order = (key: string) => (key === '' ? PLATFORMS.length + 1 : PLATFORMS.findIndex((platform) => platform.id === key) === -1 ? PLATFORMS.length : PLATFORMS.findIndex((platform) => platform.id === key));
  keys.sort((a, b) => order(a) - order(b));
  return keys.map((platform) => {
    const members = rules.filter((rule) => (rule.tags?.platform ?? '') === platform);
    const ids = new Set(members.map((rule) => rule.id));
    const children = new Map<string, Rule[]>();
    for (const rule of members) {
      if (rule.parent && ids.has(rule.parent.ruleId)) children.set(rule.parent.ruleId, [...(children.get(rule.parent.ruleId) ?? []), rule]);
    }
    const roots = members.filter((rule) => !rule.parent || !ids.has(rule.parent.ruleId));
    // Anything not reachable from a root sits on a parent cycle: show it as a root.
    const reached = new Set<string>();
    const walk = (rule: Rule) => {
      if (reached.has(rule.id)) return;
      reached.add(rule.id);
      (children.get(rule.id) ?? []).forEach(walk);
    };
    roots.forEach(walk);
    for (const rule of members) {
      if (!reached.has(rule.id)) {
        roots.push(rule);
        walk(rule);
      }
    }
    return { platform, label: platform ? platformName(platform) : 'No platform', count: members.length, roots, children };
  });
}

// The Rule Set page: its name, and every Rule in it as a tree, so how the
// Rules relate is visible at a glance. Clicking a Rule opens its editor.
export function RuleSetPage({ name, rules, base, isNew, readOnly, draftRuleSet, issues, definitions, onName, onRules, onDelete }: RuleSetPageProps) {
  const [, setLocation] = useLocation();
  const groups = groupRules(rules);
  const addRule = () => {
    const rule = emptyRule(rules.length);
    onRules([...rules, rule]);
    setLocation(`${base}/${rule.id}`);
  };
  const removeRule = (rule: Rule) => {
    if (window.confirm(`Remove the Rule "${rule.name}"?`)) onRules(rules.filter((item) => item.id !== rule.id));
  };

  const renderNode = (rule: Rule, group: Group, depth: number, seen: Set<string>) => {
    if (seen.has(rule.id)) return null;
    seen.add(rule.id);
    const index = rules.indexOf(rule);
    const resolution = resolveRule(rule, draftRuleSet, definitions);
    const shown = resolution.errors.length === 0 ? resolution.rule : rule;
    const dependents = dependentsOf(draftRuleSet, rule.id);
    const problems = issues.rules[rule.id] ?? [];
    const kids = group.children.get(rule.id) ?? [];
    return (
      <li key={rule.id}>
        <div className="flex items-start gap-3" data-testid={`card-rule-node-${rule.id}`}>
          {depth > 0 && <CornerDownRight className="mt-5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
          <div className="flex min-w-0 flex-1 items-start gap-3 rounded-xl border border-border/30 bg-card p-4 shadow-sm transition hover:border-primary/50">
            <Link href={`${base}/${rule.id}`} className="min-w-0 flex-1" data-testid={`link-rule-node-${index}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-display text-lg font-medium text-foreground">{rule.name || 'Untitled Rule'}</span>
                <span className="font-mono text-[10px] text-muted-foreground">{rule.key}</span>
                {rule.tags?.entityType && <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-bold text-muted-foreground">{rule.tags.entityType}</span>}
                {problems.length > 0 && <span className="inline-flex items-center gap-1 rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-[10px] font-bold text-destructive" data-testid={`badge-rule-issues-${index}`}><AlertCircle className="h-3 w-3" /> {problems.length} problem{problems.length === 1 ? '' : 's'}</span>}
              </div>
              <div className="mt-3"><SegmentChipRow rule={shown} meta={segmentMeta(rule, draftRuleSet)} mode="labels" compact testId={`chips-node-${index}`} /></div>
            </Link>
            {!readOnly && <button type="button" className="rounded-md p-2 text-muted-foreground transition hover:bg-destructive/15 hover:text-destructive disabled:opacity-30" onClick={() => removeRule(rule)} disabled={dependents.length > 0} title={dependents.length > 0 ? `Parent of ${dependents.map((item) => item.ruleName).join(', ')}` : 'Remove Rule'} aria-label="Remove rule" data-testid={`button-remove-rule-${index}`}><Trash2 className="h-4 w-4" /></button>}
          </div>
        </div>
        {kids.length > 0 && <ul className="ml-5 mt-3 space-y-3 border-l border-border/60 pl-4">{kids.map((kid) => renderNode(kid, group, depth + 1, seen))}</ul>}
      </li>
    );
  };

  return (
    <div className="mx-auto max-w-5xl">
      <Breadcrumbs items={[{ label: 'Rule Sets', href: '/rules' }, { label: name || 'Untitled Rule Set' }]} />
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <label className="block flex-1 text-[13px] font-bold text-foreground">Rule Set name:<input value={name} onChange={(event) => onName(event.target.value)} className={`${inputClass} mt-2 h-11 font-display text-lg`} placeholder="e.g. Regional paid media" data-testid="input-ruleset-name" /></label>
        {!readOnly && <div className="flex items-center gap-2">
          <button type="button" className={buttonQuiet} onClick={addRule} data-testid="button-add-rule"><Plus className="h-4 w-4" /> Add Rule</button>
          {!isNew && <button type="button" className={buttonDanger} onClick={onDelete} data-testid="button-delete-ruleset"><Trash2 className="h-4 w-4" /> Delete</button>}
        </div>}
      </div>

      {issues.ruleSet.length > 0 && <ul className="mb-6 list-disc rounded-[4px] border border-destructive/30 bg-destructive/10 py-3 pl-9 pr-4 text-xs font-semibold text-destructive" data-testid="list-ruleset-issues">{issues.ruleSet.map((message) => <li key={message}>{message}</li>)}</ul>}
      {Object.keys(issues.rules).length > 0 && (
        <div className="mb-6 rounded-[4px] border border-destructive/30 bg-destructive/10 px-4 py-3 text-xs font-semibold text-destructive">
          {rules.filter((rule) => issues.rules[rule.id]).map((rule) => <div key={rule.id} className="mb-2 last:mb-0"><Link href={`${base}/${rule.id}`} className="font-bold underline">{rule.name || 'Untitled Rule'}</Link><ul className="mt-1 list-disc pl-5" data-testid={`list-rule-issues-${rules.indexOf(rule)}`}>{issues.rules[rule.id].map((message) => <li key={message}>{message}</li>)}</ul></div>)}
        </div>
      )}

      {rules.length === 0 && <div className="rounded-xl border border-dashed border-border bg-card/50 px-6 py-12 text-center text-sm text-muted-foreground">No Rules yet. {readOnly ? '' : 'Add the first one.'}</div>}
      <div className="space-y-8" data-testid="list-rule-groups">
        {groups.map((group) => {
          const seen = new Set<string>();
          return (
            <section key={group.platform || 'none'} data-testid={`group-platform-${group.platform || 'none'}`}>
              <h2 className="mb-3 flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{group.label}<span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-foreground">{group.count}</span></h2>
              <ul className="space-y-3">{group.roots.map((rule) => renderNode(rule, group, 0, seen))}</ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
