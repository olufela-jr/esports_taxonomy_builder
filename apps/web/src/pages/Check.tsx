import { useState, useEffect } from 'react';
import Papa from 'papaparse';
import { useUi, type CheckMode } from '@/context/UiContext';
import { useRuleSets, type Rule, type RuleSet } from '@/hooks/use-rulesets';
import { rollup, validate, UNTAGGED, type Counts, type Rollup, type RuleScan, type Violation } from '@taxo/shared';
import { ClipboardCheck, Download, FileSpreadsheet, Filter, Upload, CheckCircle2, XCircle, AlertCircle, AlertTriangle } from 'lucide-react';

const inputClass = 'h-9 w-full rounded-[4px] border-0 bg-[#EAE8E3] px-3 text-[13px] font-semibold text-gray-900 shadow-inner outline-none transition-all placeholder:text-gray-500 focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50 hover:bg-[#F2F0EB]';
const buttonPrimary = 'inline-flex h-9 items-center justify-center gap-2 rounded-[4px] bg-primary px-4 text-[13px] font-bold text-primary-foreground transition-all hover:brightness-110 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50';
const buttonQuiet = 'inline-flex h-9 items-center justify-center gap-2 rounded-[4px] border border-border bg-card px-3.5 text-[13px] font-bold text-foreground transition-all hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50';

function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <div className="mb-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-primary">{eyebrow}</div>
        <h1 className="font-serif text-3xl font-medium tracking-tight text-foreground sm:text-4xl">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}

type SingleCheckResult = { row: number; name: string; valid: boolean; violations: Violation[] };

type RuleEval = {
  ruleKey: string;
  ruleLabel: string;
  columnName: string;
  columnMissing: boolean;
  name: string;
  valid: boolean;
  violations: Violation[];
};

// One CSV row evaluated against every Rule in the set (the strict, per-row view).
type AllRulesCheckResult = {
  row: number;
  valid: boolean;
  ruleEvals: RuleEval[];
};

function parseCsv(text: string) {
  return Papa.parse<string[]>(text.trim(), { skipEmptyLines: true }).data;
}

// Rounding happens here, in the UI. The engine only returns raw counts.
function percent(counts: Counts): number {
  return counts.scanned > 0 ? Math.round((counts.valid / counts.scanned) * 100) : 0;
}

// Turn the per-row evaluations into one scan per Rule so the engine's rollup
// can pool them. A Rule whose column is missing from the CSV scanned nothing.
function scansFromResults(ruleSet: RuleSet, results: AllRulesCheckResult[]): RuleScan[] {
  return ruleSet.rules.map((rule) => {
    const evals: RuleEval[] = [];
    for (const row of results) {
      const found = row.ruleEvals.find((item) => item.ruleKey === rule.key);
      if (found && !found.columnMissing) evals.push(found);
    }
    const hasTags = Boolean(rule.platform || rule.entityType);
    return {
      ruleKey: rule.key,
      ruleName: rule.label,
      ...(hasTags ? { tags: { platform: rule.platform, entityType: rule.entityType } } : {}),
      scanned: evals.length,
      valid: evals.filter((item) => item.valid).length,
    };
  });
}

function ModeButton({ active, onClick, testId, children }: { active: boolean; onClick: () => void; testId: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-[4px] py-1.5 transition-all ${active ? 'bg-card text-foreground shadow-sm ring-1 ring-border/20' : 'text-muted-foreground hover:text-foreground'}`}
      data-testid={testId}
    >
      {children}
    </button>
  );
}

export function Check() {
  const { ruleSetId, ruleId, checkMode, setCheckMode } = useUi();
  const { ruleSets } = useRuleSets();

  const ruleSet = ruleSets.find(rs => rs.id === ruleSetId);
  const isAllRules = checkMode === 'all';
  const rule = ruleSet?.rules.find((r: Rule) => r.key === ruleId);

  const [csv, setCsv] = useState('name\nna-paid_social-spring_launch-q2\nemea-email-summer-q2\nlatam-partner-hello-q3');
  const [nameColumn, setNameColumn] = useState('name');
  const [singleResults, setSingleResults] = useState<SingleCheckResult[] | null>(null);
  const [allRulesResults, setAllRulesResults] = useState<AllRulesCheckResult[] | null>(null);
  const [dragging, setDragging] = useState(false);

  const resetResults = () => {
    setSingleResults(null);
    setAllRulesResults(null);
  };

  useEffect(() => {
    resetResults();
  }, [ruleSetId, ruleId, checkMode]);

  const changeMode = (mode: CheckMode) => {
    setCheckMode(mode);
    resetResults();
  };

  const runCheck = () => {
    if (!ruleSet) return;
    const rows = parseCsv(csv);
    if (rows.length < 2) return;
    const headers = rows[0].map((header) => header.toLowerCase());

    if (isAllRules) {
      const results = rows.slice(1).filter(row => row.some(Boolean)).map((row, index) => {
        const ruleEvals: RuleEval[] = ruleSet.rules.map(r => {
          const colName = r.source.nameColumn.toLowerCase();
          const colIdx = headers.indexOf(colName);
          const colMissing = colIdx === -1;
          const name = colMissing ? '' : (row[colIdx] ?? '');

          let validation = { valid: false, violations: [{ segmentKey: 'N/A', token: '', reason: `Missing mapped column: ${r.source.nameColumn}` }] };
          if (!colMissing) {
            validation = validate(r, name);
          }

          return {
            ruleKey: r.key,
            ruleLabel: r.label,
            columnName: r.source.nameColumn,
            columnMissing: colMissing,
            name,
            valid: validation.valid,
            violations: validation.violations
          };
        });

        const rowValid = ruleEvals.every(re => re.valid);
        return { row: index + 2, valid: rowValid, ruleEvals };
      });
      setAllRulesResults(results);
      setSingleResults(null);
    } else {
      if (!rule) return;
      const colName = nameColumn.toLowerCase();
      const columnIndex = headers.indexOf(colName);

      if (columnIndex === -1) {
        setSingleResults([{
          row: 0,
          name: '',
          valid: false,
          violations: [{ segmentKey: 'N/A', token: '', reason: `Missing mapped column: ${nameColumn}` }]
        }]);
        setAllRulesResults(null);
        return;
      }

      const results = rows.slice(1).filter((row) => row.some(Boolean)).map((row, index) => {
        const name = row[columnIndex] ?? '';
        const validation = validate(rule, name);
        return { row: index + 2, name, valid: validation.valid, violations: validation.violations };
      });
      setSingleResults(results);
      setAllRulesResults(null);
    }
  };

  const loadFile = (file?: File) => { if (!file) return; const reader = new FileReader(); reader.onload = () => { setCsv(String(reader.result ?? '')); resetResults(); }; reader.readAsText(file); };

  const exportSingleResults = () => {
    if (!singleResults) return;
    const rows = [['row', 'name', 'status', 'violations', 'suggestions'], ...singleResults.map((item) => [String(item.row), item.name, item.valid ? 'valid' : 'invalid', item.violations.map((violation) => `${violation.segmentKey}: ${violation.reason}`).join(' | '), item.violations.map((violation) => violation.suggestion ?? '').join(' | ')]),];
    downloadCsv(rows, 'ruleset-single-check-results.csv');
  };

  const exportAllResults = () => {
    if (!allRulesResults || !ruleSet) return;
    const summary = rollup(scansFromResults(ruleSet, allRulesResults));
    const countRow = (scope: string, name: string, counts: Counts) => [scope, name, String(counts.scanned), String(counts.valid), String(counts.invalid), String(percent(counts))];
    const summaryRows = [
      ['scope', 'name', 'scanned', 'valid', 'invalid', 'percent_valid'],
      countRow('rule_set', ruleSet.name, summary.total),
      ...summary.perRule.map((item) => countRow('rule', item.ruleName, item)),
      ...Object.entries(summary.byPlatform).map(([name, counts]) => countRow('platform', name, counts)),
      ...Object.entries(summary.byEntityType).map(([name, counts]) => countRow('entity_type', name, counts)),
      [],
    ];
    const headerRow = ['row', 'strict_status', ...ruleSet.rules.flatMap(r => [`${r.key}_name`, `${r.key}_status`, `${r.key}_violations`])];
    const rows = [...summaryRows, headerRow, ...allRulesResults.map(item => [
      String(item.row),
      item.valid ? 'valid' : 'invalid',
      ...item.ruleEvals.flatMap(re => [
        re.name,
        re.valid ? 'valid' : (re.columnMissing ? 'missing_column' : 'invalid'),
        re.violations.map(v => `${v.segmentKey}: ${v.reason}`).join(' | ')
      ])
    ])];
    downloadCsv(rows, 'ruleset-all-rules-results.csv');
  };

  const downloadCsv = (rows: string[][], filename: string) => {
    const blob = new Blob([rows.map((row) => row.map((value) => `"${value.replaceAll('"', '""')}"`).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url);
  };

  if (!ruleSet || (!isAllRules && !rule)) {
    return (
      <div>
        <PageHeading eyebrow="Workspace" title="Validate a CSV export" description="Upload a CSV export to check names against rules." />
        <div className="flex min-h-[430px] flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/50 px-8 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded bg-muted text-muted-foreground">
            <Filter className="h-6 w-6" />
          </div>
          <h2 className="mt-5 text-sm font-semibold text-foreground">No Rule selected</h2>
          <p className="mt-1.5 max-w-xs text-xs leading-relaxed text-muted-foreground">
            Select a Rule Set and a Rule from the sidebar to validate data.
          </p>
        </div>
      </div>
    );
  }

  const validCount = singleResults ? singleResults.filter(r => r.valid).length : (allRulesResults ? allRulesResults.filter(r => r.valid).length : 0);
  return (
    <div>
      <PageHeading
        eyebrow="Workspace"
        title="Validate a CSV export"
        description="Upload a CSV export to check names against rules."
        action={(singleResults || allRulesResults) && (
          <button type="button" className={buttonQuiet} onClick={isAllRules ? exportAllResults : exportSingleResults} data-testid="button-export-results">
            <Download className="h-4 w-4" /> Export results
          </button>
        )}
      />
      <div className="grid gap-6 xl:grid-cols-[.85fr_1.15fr]">
        <section className="rounded-xl bg-card p-6 shadow-sm border border-border/30">
          <div className="flex items-start justify-between">
            <div className="flex flex-col">
              <div className="font-serif text-2xl font-medium text-foreground">Validation source</div>
            </div>
            <div className="flex h-5 w-5 items-center justify-center rounded-full border border-muted-foreground/30 text-muted-foreground"><FileSpreadsheet className="h-3 w-3" /></div>
          </div>

          <div className="mt-6">
            <div className="mb-2 text-[11px] font-bold text-muted-foreground">Scope</div>
            <div className="grid grid-cols-2 rounded-md bg-muted/50 p-1 text-[13px] font-bold border border-border/30" role="group" aria-label="Check scope">
              <ModeButton active={!isAllRules} onClick={() => changeMode('single')} testId="button-mode-single">Single Rule</ModeButton>
              <ModeButton active={isAllRules} onClick={() => changeMode('all')} testId="button-mode-all">All Rules</ModeButton>
            </div>
          </div>

          <div className="mt-5">
            <div className="mb-2 text-[11px] font-bold text-muted-foreground">Source</div>
            <div className="grid grid-cols-2 rounded-md bg-muted/50 p-1 text-[13px] font-bold border border-border/30">
              <button type="button" className="rounded-[4px] bg-card py-1.5 text-foreground shadow-sm ring-1 ring-border/20 transition-all" data-testid="button-source-csv">CSV upload</button>
              <button type="button" className="flex cursor-not-allowed items-center justify-center gap-2 rounded-[4px] py-1.5 text-muted-foreground/50 transition-all hover:text-muted-foreground/70" disabled data-testid="button-source-live-scan">
                Live scan <span className="rounded bg-black/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider dark:bg-white/10">Stage 2</span>
              </button>
            </div>
          </div>

          <div className="mt-6">
            {!isAllRules && (
              <label className="block text-[13px] font-bold text-foreground">Name column:<input className={`${inputClass} mt-2 font-mono text-sm`} value={nameColumn} onChange={(event) => { setNameColumn(event.target.value); resetResults(); }} data-testid="input-check-column" /></label>
            )}
            {isAllRules && (
              <div className="rounded-lg border border-primary/30 bg-primary/10 p-4 text-xs text-primary shadow-sm">
                <div className="font-semibold flex items-center gap-2"><AlertCircle className="h-4 w-4" /> All Rules</div>
                <div className="mt-1.5 leading-relaxed opacity-90">Every Rule in {ruleSet.name} runs over its own mapped source column. Counts are pooled across Rules.</div>
              </div>
            )}
          </div>

          <div className={`mt-6 rounded-xl border-2 border-dashed p-6 transition-all duration-300 ${dragging ? 'border-primary bg-primary/5' : 'border-border bg-background hover:border-border/80 hover:bg-muted/30'}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); loadFile(event.dataTransfer.files[0]); }}>
            <label className="flex cursor-pointer flex-col items-center justify-center py-4 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground transition-all group-hover:bg-primary/10 group-hover:text-primary"><Upload className="h-5 w-5" /></div>
              <span className="mt-4 text-sm font-semibold text-foreground">Drop a CSV here or browse</span>
              <span className="mt-1.5 text-xs text-muted-foreground">UTF-8 · comma separated</span>
              <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(event) => loadFile(event.target.files?.[0])} data-testid="input-upload-csv" />
            </label>
          </div>

          <div className="relative mt-6">
            <div className="absolute right-3 top-3 font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground bg-background px-1">paste</div>
            <textarea className="min-h-[160px] w-full resize-y rounded-xl border border-border bg-background p-4 font-mono text-[13px] leading-relaxed text-foreground outline-none transition-all placeholder:text-muted-foreground/50 focus:border-primary focus:ring-1 focus:ring-primary/50 hover:border-border/80" value={csv} onChange={(event) => { setCsv(event.target.value); resetResults(); }} aria-label="CSV data" data-testid="textarea-csv-input" />
          </div>

          <button type="button" className={`${buttonPrimary} mt-5 w-full`} onClick={runCheck} disabled={!csv.trim()} data-testid="button-run-check"><ClipboardCheck className="h-4 w-4" /> Validate names</button>
        </section>

        <section className="min-w-0">
          {(singleResults || allRulesResults) ? (
            isAllRules && allRulesResults ? (
              <AllRulesResultsPanel results={allRulesResults} strictValidCount={validCount} ruleSet={ruleSet} />
            ) : singleResults ? (
              <SingleResultsPanel results={singleResults} validCount={validCount} />
            ) : null
          ) : (
            <div className="flex min-h-[430px] flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/50 px-8 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded bg-muted text-muted-foreground"><Filter className="h-6 w-6" /></div>
              <h2 className="mt-5 text-sm font-semibold text-foreground">Ready for validation</h2>
              <p className="mt-1.5 max-w-xs text-xs leading-relaxed text-muted-foreground">Results will display compliance status and suggested fixes.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function StatusPill({ invalidCount }: { invalidCount: number }) {
  return invalidCount
    ? <div className="inline-flex items-center gap-1.5 rounded-full border border-destructive/50 bg-destructive/10 px-2 py-0.5"><span className="h-2 w-2 rounded-full bg-destructive" /><span className="text-[10px] font-bold text-foreground">Action needed</span></div>
    : <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5"><span className="h-2 w-2 rounded-full bg-primary" /><span className="text-[10px] font-bold text-foreground">All clear</span></div>;
}

function SingleResultsPanel({ results, validCount }: { results: SingleCheckResult[]; validCount: number }) {
  const invalidCount = results.length - validCount;
  return (
    <div>
      <div className="mb-6 grid grid-cols-3 gap-4">
        <div className="rounded-xl bg-card p-6 shadow-sm border border-border/30"><div className="font-serif text-xl font-medium text-foreground">Checked</div><div className="mt-4 font-serif text-[32px] font-medium text-foreground" data-testid="text-results-checked">{results.length}</div></div>
        <div className="rounded-xl bg-card p-6 shadow-sm border border-border/30"><div className="font-serif text-xl font-medium text-foreground">Compliant</div><div className="mt-4 font-serif text-[32px] font-medium text-foreground" data-testid="text-results-valid">{validCount}</div></div>
        <div className="rounded-xl bg-card p-6 shadow-sm border border-destructive/30"><div className="font-serif text-xl font-medium text-destructive">Invalid</div><div className="mt-4 font-serif text-[32px] font-medium text-destructive" data-testid="text-results-invalid">{invalidCount}</div></div>
      </div>
      <div className="overflow-hidden rounded-xl bg-card shadow-sm border border-border/30">
        <div className="flex items-center justify-between border-b border-border/50 px-6 py-5">
          <div><h2 className="font-serif text-xl font-medium text-foreground">Validation results</h2></div>
          <StatusPill invalidCount={invalidCount} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-left text-xs">
            <thead className="bg-muted/30 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="px-5 py-3.5 font-semibold">Row</th>
                <th className="px-5 py-3.5 font-semibold">Campaign name</th>
                <th className="px-5 py-3.5 font-semibold">Status</th>
                <th className="px-5 py-3.5 font-semibold">Finding</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {results.map((result) => (
                <tr key={result.row} className="transition hover:bg-muted/40" data-testid={`row-result-${result.row}`}>
                  <td className="px-5 py-4 font-mono text-muted-foreground">{result.row}</td>
                  <td className="max-w-[220px] truncate px-5 py-4 font-mono text-[11px] text-foreground">{result.name || <span className="text-muted-foreground">Blank</span>}</td>
                  <td className="px-5 py-4">{result.valid ? <span className="inline-flex items-center gap-1.5 font-semibold text-foreground"><CheckCircle2 className="h-4 w-4" /> Valid</span> : <span className="inline-flex items-center gap-1.5 font-semibold text-destructive"><XCircle className="h-4 w-4" /> Invalid</span>}</td>
                  <td className="max-w-[280px] px-5 py-4 text-muted-foreground">{result.valid ? <span className="text-muted-foreground">Matches rules</span> : <div><div>{result.violations.map((item) => item.reason).join(' ')}</div>{result.violations[0]?.suggestion && <div className="mt-1.5 font-semibold text-foreground">Try: <span className="font-mono text-[11px]">{result.violations[0].suggestion}</span></div>}</div>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function CountCard({ label, caption, counts, missing, testId }: { label: string; caption?: string; counts: Counts; missing?: boolean; testId?: string }) {
  return (
    <div className={`rounded-xl border p-4 shadow-sm ${missing ? 'border-destructive/30 bg-destructive/5' : 'border-border/30 bg-muted/20'}`} data-testid={testId}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-serif text-lg font-medium text-foreground">{label}</div>
          {caption && <div className="mt-1 text-[11px] font-bold text-muted-foreground">{caption}</div>}
        </div>
        {missing ? (
          <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-destructive/10 border border-destructive/30 px-2 py-0.5 text-[10px] font-bold text-destructive">
            <AlertTriangle className="h-3 w-3" /> Missing
          </span>
        ) : (
          <span className="shrink-0 font-serif text-[28px] font-medium text-foreground">{percent(counts)}%</span>
        )}
      </div>
      {!missing && <div className="mt-2 text-[11px] font-bold text-muted-foreground">{counts.valid} of {counts.scanned} valid</div>}
    </div>
  );
}

function TagBreakdown({ title, groups, testId }: { title: string; groups: Record<string, Counts>; testId: string }) {
  const entries = Object.entries(groups);
  // Only worth showing once at least one Rule carries this tag.
  if (!entries.some(([name]) => name !== UNTAGGED)) return null;
  return (
    <div className="mt-6" data-testid={testId}>
      <h4 className="mb-3 font-serif text-lg font-medium text-foreground">{title}</h4>
      <div className="grid gap-3 sm:grid-cols-2">
        {entries.map(([name, counts]) => <CountCard key={name} label={name} counts={counts} />)}
      </div>
    </div>
  );
}

function AllRulesResultsPanel({ results, strictValidCount, ruleSet }: { results: AllRulesCheckResult[]; strictValidCount: number; ruleSet: RuleSet }) {
  const summary: Rollup = rollup(scansFromResults(ruleSet, results));
  const strictCounts: Counts = { scanned: results.length, valid: strictValidCount, invalid: results.length - strictValidCount };
  const missingByRule = new Map(ruleSet.rules.map((rule) => [rule.key, results.some((row) => row.ruleEvals.some((item) => item.ruleKey === rule.key && item.columnMissing))]));

  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-card p-6 shadow-sm border border-border/30">
        <h3 className="mb-2 font-serif text-2xl font-medium text-foreground">Rule Set compliance</h3>
        <div className="flex items-center gap-6 mt-4">
          <div className="font-serif text-[40px] font-medium tracking-tight text-primary" data-testid="text-pooled-percent">{percent(summary.total)}%</div>
          <div className="text-[13px] font-bold text-muted-foreground">
            <span className="text-foreground">{summary.total.valid}</span> of {summary.total.scanned} names valid, pooled across {ruleSet.rules.length} Rule{ruleSet.rules.length === 1 ? '' : 's'}.
            <div className="mt-1 font-medium">Each Rule checks its own column; totals are summed across Rules.</div>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-border/50">
          <h4 className="mb-4 font-serif text-xl font-medium text-foreground">Per Rule</h4>
          <div className="grid gap-4 sm:grid-cols-2">
            {summary.perRule.map((item) => (
              <CountCard
                key={item.ruleKey}
                label={item.ruleName}
                caption={`col: ${ruleSet.rules.find((rule) => rule.key === item.ruleKey)?.source.nameColumn ?? ''}`}
                counts={item}
                missing={missingByRule.get(item.ruleKey)}
                testId={`card-rule-${item.ruleKey}`}
              />
            ))}
          </div>
          <TagBreakdown title="By platform" groups={summary.byPlatform} testId="breakdown-platform" />
          <TagBreakdown title="By entity type" groups={summary.byEntityType} testId="breakdown-entity-type" />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl bg-card shadow-sm border border-border/30">
        <div className="flex items-center justify-between gap-4 border-b border-border/50 px-6 py-5">
          <div>
            <h2 className="font-serif text-xl font-medium text-foreground">Strict view: rows passing every Rule</h2>
            <p className="mt-1 text-[11px] font-bold text-muted-foreground" data-testid="text-strict-summary">{strictCounts.valid} of {strictCounts.scanned} rows ({percent(strictCounts)}%) pass all {ruleSet.rules.length} Rules at once. Secondary figure for wide CSVs where one row carries a name per Rule.</p>
          </div>
          <StatusPill invalidCount={strictCounts.invalid} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-left text-xs">
            <thead className="bg-muted/30 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="px-5 py-3.5 font-semibold">Row</th>
                <th className="px-5 py-3.5 font-semibold">Overall</th>
                <th className="px-5 py-3.5 font-semibold">Rule Failures</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {results.map((result) => {
                const failures = result.ruleEvals.filter(re => !re.valid);
                return (
                  <tr key={result.row} className="transition hover:bg-muted/40" data-testid={`row-result-all-${result.row}`}>
                    <td className="px-5 py-4 font-mono text-muted-foreground">{result.row}</td>
                    <td className="px-5 py-4">
                      {result.valid ?
                        <span className="inline-flex items-center gap-1.5 font-semibold text-foreground"><CheckCircle2 className="h-4 w-4" /> Valid</span> :
                        <span className="inline-flex items-center gap-1.5 font-semibold text-destructive"><XCircle className="h-4 w-4" /> Invalid</span>
                      }
                    </td>
                    <td className="px-5 py-4 text-muted-foreground max-w-[300px]">
                      {result.valid ? <span className="text-muted-foreground">Passes all</span> : (
                        <div className="space-y-1.5">
                          {failures.map((f) => {
                            const suggestion = f.violations.find((v) => v.suggestion)?.suggestion;
                            return (
                              <div key={f.ruleKey} className="text-[11px] leading-relaxed">
                                <span className="font-semibold text-foreground">{f.ruleLabel}:</span>{' '}
                                {f.columnMissing ? `Column "${f.columnName}" missing in CSV` : f.violations.map(v => v.reason).join(', ')}
                                {suggestion && <div className="mt-0.5 font-semibold text-foreground">Try: <span className="font-mono">{suggestion}</span></div>}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </td>
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
