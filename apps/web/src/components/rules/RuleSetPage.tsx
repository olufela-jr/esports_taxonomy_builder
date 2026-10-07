import { useState } from 'react';
import { AlertCircle, Download, Plus, Search, Trash2, Upload } from 'lucide-react';
import { dependentsOf, platformName, resolveRule, rulesFromSheets, rulesToSheets, type Definition, type Rule, type RuleSet as EngineRuleSet, type RuleSetIssues } from '@taxo/shared';
import { Link, useLocation } from 'wouter';
import { Breadcrumbs } from '../Breadcrumbs';
import { buttonDanger, buttonQuiet, inputClass, tableBody, tableCard, tableClass, tableHead, tableHeadCell, tableRow, tableWrap } from '../styles';
import { newId } from '@/lib/ids';
import { downloadRulesWorkbook, readRulesWorkbook } from '@/lib/workbook';
import { emptyRule, emptySegment, slugify } from './draft';

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

// The template is an export of one example Rule, so it can never drift from
// the format: an enum segment with a Local list and an optional freeform one.
const TEMPLATE_RULE: Rule = {
  ...emptyRule(0),
  key: 'google_campaign',
  name: 'Google Campaigns',
  tags: { platform: 'google', entityType: 'campaign' },
  delimiter: '_',
  segments: [
    { id: 'region', kind: 'enum', key: 'region', label: 'Region', required: true, allowedValues: [{ label: 'United Kingdom', code: 'UK' }, { label: 'United States', code: 'US' }] },
    { ...emptySegment(1), key: 'theme', label: 'Theme', required: false },
  ],
};

// The Rule Set page: its name, and its Rules as a plain table to find one in.
// Clicking a Rule opens it on its own page.
export function RuleSetPage({ name, rules, base, isNew, readOnly, draftRuleSet, issues, definitions, onName, onRules, onDelete }: RuleSetPageProps) {
  const [, setLocation] = useLocation();
  const [query, setQuery] = useState('');
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [imported, setImported] = useState(0);
  const addRule = () => {
    const rule = emptyRule(rules.length);
    onRules([...rules, rule]);
    setLocation(`${base}/${rule.id}`);
  };
  // Imported Rules join the unsaved draft like any added Rule, so they are
  // checked and saved the usual way; an import with any error adds nothing.
  const importFile = async (file?: File) => {
    if (!file) return;
    const read = await readRulesWorkbook(file);
    const result = 'error' in read ? { rules: [], errors: [read.error] } : rulesFromSheets(read.sheets, rules, definitions, newId, emptyRule(0).source);
    setImportErrors(result.errors);
    setImported(result.rules.length);
    if (result.rules.length > 0) onRules([...rules, ...result.rules]);
  };
  const exportRules = () => void downloadRulesWorkbook(rulesToSheets(rules, definitions), `${slugify(name) || 'rule_set'}_rules.xlsx`);
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
        <div className="flex items-center gap-2">
          {!readOnly && <button type="button" className={buttonQuiet} onClick={addRule} data-testid="button-add-rule"><Plus className="h-4 w-4" /> Add Rule</button>}
          {!readOnly && <label className={`${buttonQuiet} cursor-pointer`}><Upload className="h-4 w-4" /> Import Excel<input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" onChange={(event) => { void importFile(event.target.files?.[0]); event.target.value = ''; }} data-testid="input-import-rules" /></label>}
          <button type="button" className={buttonQuiet} onClick={exportRules} disabled={rules.length === 0} data-testid="button-export-rules"><Download className="h-4 w-4" /> Export Excel</button>
          {!readOnly && !isNew && <button type="button" className={buttonDanger} onClick={onDelete} data-testid="button-delete-ruleset"><Trash2 className="h-4 w-4" /> Delete</button>}
        </div>
      </div>
      {!readOnly && <p className="-mt-5 mb-6 text-xs text-muted-foreground">Import adds new Rules from an Excel workbook with Rules, Segments and Values sheets; set parents and UTMs on each Rule afterwards. <button type="button" className="font-bold text-primary underline" onClick={() => void downloadRulesWorkbook(rulesToSheets([TEMPLATE_RULE], []), 'rules_template.xlsx')} data-testid="button-rules-template">Download a template</button></p>}

      {importErrors.length > 0 && <div className="mb-6 rounded-[4px] border border-destructive/30 bg-destructive/10 px-4 py-3 text-xs font-semibold text-destructive" data-testid="list-import-errors"><p className="mb-1 font-bold">Nothing was imported:</p><ul className="list-disc pl-5">{importErrors.map((message) => <li key={message}>{message}</li>)}</ul></div>}
      {importErrors.length === 0 && imported > 0 && <p className="mb-6 rounded-[4px] border border-border bg-muted px-4 py-3 text-xs font-semibold text-foreground" data-testid="text-import-done">Added {imported === 1 ? '1 Rule. Review it' : `${imported} Rules. Review them`} below, then save the Rule Set.</p>}

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
