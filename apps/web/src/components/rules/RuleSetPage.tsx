import { useState } from 'react';
import { AlertCircle, Plus, Search, Trash2 } from 'lucide-react';
import { dependentsOf, platformName, resolveRule, type Definition, type Rule, type RuleSet as EngineRuleSet, type RuleSetIssues } from '@taxo/shared';
import { Link, useLocation } from 'wouter';
import { Breadcrumbs } from '../Breadcrumbs';
import { buttonDanger, buttonQuiet, inputClass, tableBody, tableCard, tableClass, tableHead, tableHeadCell, tableRow, tableWrap } from '../styles';
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

const cell = 'px-5 py-3 align-top';

// The Rule Set page: its name, and its Rules as a plain table to find one in.
// Clicking a Rule opens it on its own page.
export function RuleSetPage({ name, rules, base, isNew, readOnly, draftRuleSet, issues, definitions, onName, onRules, onDelete }: RuleSetPageProps) {
  const [, setLocation] = useLocation();
  const [query, setQuery] = useState('');
  const addRule = () => {
    const rule = emptyRule(rules.length);
    onRules([...rules, rule]);
    setLocation(`${base}/${rule.id}`);
  };
  const removeRule = (rule: Rule) => {
    if (window.confirm(`Remove the Rule "${rule.name}"?`)) onRules(rules.filter((item) => item.id !== rule.id));
  };

  const needle = query.trim().toLowerCase();
  const platformOf = (rule: Rule) => (rule.tags?.platform ? platformName(rule.tags.platform) : '');
  const shown = needle === '' ? rules : rules.filter((rule) => [rule.name, rule.key, platformOf(rule), rule.tags?.entityType ?? ''].some((text) => text.toLowerCase().includes(needle)));

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

      <div className="relative mb-4 max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} className={`${inputClass} pl-9`} placeholder="Find a Rule" aria-label="Find a Rule" data-testid="input-find-rule" />
      </div>

      <div className={tableCard}>
        <div className={tableWrap}>
          <table className={tableClass} data-testid="table-rules">
            <thead className={tableHead}>
              <tr>
                <th className={tableHeadCell}>Rule</th>
                <th className={tableHeadCell}>Platform</th>
                <th className={tableHeadCell}>Entity type</th>
                <th className={tableHeadCell}>Parent</th>
                <th className={tableHeadCell}>Segments</th>
                <th className={tableHeadCell}>Problems</th>
                {!readOnly && <th className={tableHeadCell}><span className="sr-only">Remove</span></th>}
              </tr>
            </thead>
            <tbody className={tableBody}>
              {rules.length === 0 && <tr><td colSpan={7} className="px-5 py-10 text-center text-sm text-muted-foreground">No Rules yet. {readOnly ? '' : 'Add the first one.'}</td></tr>}
              {rules.length > 0 && shown.length === 0 && <tr><td colSpan={7} className="px-5 py-10 text-center text-sm text-muted-foreground" data-testid="text-no-rule-match">No Rules match.</td></tr>}
              {shown.map((rule) => {
                const index = rules.indexOf(rule);
                const href = `${base}/${rule.id}`;
                const resolution = resolveRule(rule, draftRuleSet, definitions);
                const segmentCount = resolution.errors.length === 0 ? resolution.rule.segments.length : rule.segments.length;
                const parent = rule.parent ? rules.find((item) => item.id === rule.parent!.ruleId) : undefined;
                const dependents = dependentsOf(draftRuleSet, rule.id);
                const problems = issues.rules[rule.id] ?? [];
                return (
                  <tr key={rule.id} className={`${tableRow} cursor-pointer`} onClick={() => setLocation(href)} data-testid={`row-rule-${rule.id}`}>
                    <td className={cell}>
                      <Link href={href} className="text-[13px] font-bold text-foreground hover:text-primary" onClick={(event) => event.stopPropagation()} data-testid={`link-rule-row-${index}`}>{rule.name || 'Untitled Rule'}</Link>
                      <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">{rule.key}</div>
                    </td>
                    <td className={cell} data-testid={`cell-rule-platform-${rule.id}`}>{platformOf(rule) || <span className="text-muted-foreground">None</span>}</td>
                    <td className={cell}>{rule.tags?.entityType || <span className="text-muted-foreground">-</span>}</td>
                    <td className={cell} data-testid={`cell-rule-parent-${rule.id}`}>{parent ? parent.name || 'Untitled Rule' : <span className="text-muted-foreground">-</span>}</td>
                    <td className={cell}>{segmentCount}</td>
                    <td className={cell}>{problems.length > 0 ? <span className="inline-flex items-center gap-1 rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-[10px] font-bold text-destructive" data-testid={`badge-rule-issues-${index}`}><AlertCircle className="h-3 w-3" /> {problems.length}</span> : <span className="text-muted-foreground">-</span>}</td>
                    {!readOnly && <td className={`${cell} text-right`} onClick={(event) => event.stopPropagation()}><button type="button" className="rounded-md p-1.5 text-muted-foreground transition hover:bg-destructive/15 hover:text-destructive disabled:opacity-30" onClick={() => removeRule(rule)} disabled={dependents.length > 0} title={dependents.length > 0 ? `Parent of ${dependents.map((item) => item.ruleName).join(', ')}` : 'Remove Rule'} aria-label="Remove rule" data-testid={`button-remove-rule-${index}`}><Trash2 className="h-4 w-4" /></button></td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
