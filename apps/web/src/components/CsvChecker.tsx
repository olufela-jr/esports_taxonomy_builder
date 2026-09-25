import { useState, useEffect } from 'react';
import Papa from 'papaparse';
import { resolveRule, rollup, validate, UNTAGGED, type Counts, type Definition, type Rollup, type Rule, type RuleScan, type ValidateResult, type Violation } from '@taxo/shared';
import { ClipboardCheck, Database, Download, FileSpreadsheet, Filter, Upload, CheckCircle2, XCircle, AlertCircle, AlertTriangle } from 'lucide-react';
import type { Scanner, ScanOutcome } from '@/data/scan';
import type { RuleSet } from '@/data/store';
import type { CheckMode } from '@/data/ui-state';
import { PageHeading } from './PageHeading';
import { buttonPrimary, buttonQuiet, inputClass } from './styles';

type SingleCheckResult = { row: number; name: string; valid: boolean; violations: Violation[] };

type RuleEval = {
  ruleKey: string;
  ruleName: string;
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
    return {
      ruleId: rule.id,
      ruleKey: rule.key,
      ruleName: rule.name,
      ...(rule.tags ? { tags: rule.tags } : {}),
      scanned: evals.length,
      valid: evals.filter((item) => item.valid).length,
    };
  });
}

// A demo name for a Rule: one valid, one with a bad first value, one missing
// its last required segment. Keeps the sample CSV meaningful for any Rule Set.
function sampleName(rule: Rule, variant: 'valid' | 'badValue' | 'short'): string {
  const required = rule.segments.filter((segment) => segment.required);
  const tokens = required.map((segment, index) => {
    const spoil = variant === 'badValue' && index === 0;
    if (segment.kind === 'enum') return spoil ? 'xx' : (segment.allowedValues[0]?.code ?? 'value');
    return spoil ? 'bad value' : 'sample';
  });
  if (variant === 'short') tokens.pop();
  return tokens.join(rule.delimiter);
}

function sampleCsv(ruleSet: RuleSet): string {
  const columns = Array.from(new Set(ruleSet.rules.map((rule) => rule.source.nameColumn).filter(Boolean)));
  if (columns.length === 0) return 'name\n';
  const variants = ['valid', 'badValue', 'short'] as const;
  const rows = variants.map((variant) => columns.map((column) => {
    const rule = ruleSet.rules.find((item) => item.source.nameColumn === column);
    return rule ? sampleName(rule, variant) : '';
  }));
  return [columns.join(','), ...rows.map((row) => row.join(','))].join('\n');
}

function expectedColumns(ruleSet: RuleSet): string[] {
  return Array.from(new Set(ruleSet.rules.map((rule) => rule.source.nameColumn).filter(Boolean)));
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

// Feature 3a: validate a CSV client-side against the Rule selected in the shell,
// or every Rule in the Rule Set.
export function CsvChecker({ ruleSet, rule, definitions, scanner, checkMode, onCheckModeChange }: { ruleSet: RuleSet | undefined; rule: Rule | undefined; definitions: Definition[]; scanner: Scanner | null; checkMode: CheckMode; onCheckModeChange: (mode: CheckMode) => void }) {
  // Names are checked against resolved Rules (parents inherited, shared
  // definitions filled in, D46). A Rule that cannot be resolved fails every
  // name with the resolution errors as the reason, never a silent mismatch.
  const resolvedRuleSet = ruleSet ? { ...ruleSet, rules: ruleSet.rules.map((item) => resolveRule(item, ruleSet, definitions).rule) } : undefined;
  const checkName = (target: Rule, name: string): ValidateResult => {
    if (!ruleSet) return validate(target, name);
    const resolution = resolveRule(target, ruleSet, definitions);
    if (resolution.errors.length > 0) {
      return { valid: false, violations: resolution.errors.map((reason) => ({ segmentKey: '__rule__', token: name, reason })) };
    }
    return validate(resolution.rule, name);
  };
  const ruleSetId = ruleSet?.id;
  const ruleId = rule?.id;
  const isAllRules = checkMode === 'all';

  // The sample CSV and name column follow the selection until the user edits them.
  const [csv, setCsv] = useState(() => (resolvedRuleSet ? sampleCsv(resolvedRuleSet) : ''));
  const [csvTouched, setCsvTouched] = useState(false);
  const [nameColumn, setNameColumn] = useState(() => rule?.source.nameColumn || 'name');
  const [columnTouched, setColumnTouched] = useState(false);
  const [singleResults, setSingleResults] = useState<SingleCheckResult[] | null>(null);
  const [allRulesResults, setAllRulesResults] = useState<AllRulesCheckResult[] | null>(null);
  const [dragging, setDragging] = useState(false);
  // Stage 2: the live scan reads each Rule's BigQuery source through the
  // Function; counts are exact over the full scan, the list is capped.
  const [source, setSource] = useState<'csv' | 'live'>('csv');
  const [scanning, setScanning] = useState(false);
  const [liveSingle, setLiveSingle] = useState<ScanOutcome | null>(null);
  const [liveAll, setLiveAll] = useState<Array<{ rule: Rule; outcome: ScanOutcome | null; error: string }> | null>(null);
  const [liveError, setLiveError] = useState('');

  const resetResults = () => {
    setSingleResults(null);
    setAllRulesResults(null);
    setLiveSingle(null);
    setLiveAll(null);
    setLiveError('');
  };

  const runLiveScan = async () => {
    if (!scanner || !ruleSet || scanning) return;
    setScanning(true);
    resetResults();
    try {
      if (isAllRules) {
        const outcomes: Array<{ rule: Rule; outcome: ScanOutcome | null; error: string }> = [];
        for (const item of ruleSet.rules) {
          try {
            outcomes.push({ rule: item, outcome: await scanner.scanRule(ruleSet.id, item.id), error: '' });
          } catch (cause) {
            outcomes.push({ rule: item, outcome: null, error: cause instanceof Error ? cause.message : 'The scan failed.' });
          }
        }
        setLiveAll(outcomes);
      } else if (rule) {
        setLiveSingle(await scanner.scanRule(ruleSet.id, rule.id));
      }
    } catch (cause) {
      setLiveError(cause instanceof Error ? cause.message : 'The scan failed.');
    } finally {
      setScanning(false);
    }
  };

  useEffect(() => {
    resetResults();
  }, [ruleSetId, ruleId, checkMode]);

  useEffect(() => {
    if (!csvTouched) setCsv(resolvedRuleSet ? sampleCsv(resolvedRuleSet) : '');
  }, [ruleSetId, ruleSet, csvTouched]);

  useEffect(() => {
    if (!columnTouched) setNameColumn(rule?.source.nameColumn || 'name');
  }, [ruleId, rule, columnTouched]);

  const editCsv = (value: string) => {
    setCsv(value);
    setCsvTouched(true);
    resetResults();
  };

  const changeMode = (mode: CheckMode) => {
    onCheckModeChange(mode);
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
            validation = checkName(r, name);
          }

          return {
            ruleKey: r.key,
            ruleName: r.name,
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
        const validation = checkName(rule, name);
        return { row: index + 2, name, valid: validation.valid, violations: validation.violations };
      });
      setSingleResults(results);
      setAllRulesResults(null);
    }
  };

  const loadFile = (file?: File) => { if (!file) return; const reader = new FileReader(); reader.onload = () => { editCsv(String(reader.result ?? '')); }; reader.readAsText(file); };

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
              <div className="font-display text-2xl font-medium text-foreground">Validation source</div>
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
              <ModeButton active={source === 'csv'} onClick={() => { setSource('csv'); resetResults(); }} testId="button-source-csv">CSV upload</ModeButton>
              <button type="button" className={`flex items-center justify-center gap-2 rounded-[4px] py-1.5 transition-all ${source === 'live' ? 'bg-card text-foreground shadow-sm ring-1 ring-border/20' : scanner ? 'text-muted-foreground hover:text-foreground' : 'cursor-not-allowed text-muted-foreground/50'}`} disabled={!scanner} title={scanner ? undefined : 'Live scan needs the shared workspace.'} onClick={() => { setSource('live'); resetResults(); }} data-testid="button-source-live-scan">
                Live scan {!scanner && <span className="rounded bg-black/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider dark:bg-white/10">Shared workspace</span>}
              </button>
            </div>
          </div>

          <div className="mt-6">
            {!isAllRules && (
              <label className="block text-[13px] font-bold text-foreground">Name column:<input className={`${inputClass} mt-2 font-mono text-sm`} value={nameColumn} onChange={(event) => { setNameColumn(event.target.value); setColumnTouched(true); resetResults(); }} data-testid="input-check-column" /></label>
            )}
            {isAllRules && (
              <div className="rounded-lg border border-primary/30 bg-primary/10 p-4 text-xs text-primary shadow-sm">
                <div className="font-semibold flex items-center gap-2"><AlertCircle className="h-4 w-4" /> All Rules</div>
                <div className="mt-1.5 leading-relaxed opacity-90">Every Rule in {ruleSet.name} runs over its own mapped source column. Counts are pooled across Rules.</div>
                <div className="mt-2 font-mono text-[11px] opacity-90" data-testid="text-expected-columns">Expected columns: {expectedColumns(ruleSet).join(', ') || 'none mapped'}</div>
              </div>
            )}
          </div>

          {source === 'live' && (
            <div className="mt-6 rounded-xl border border-border/50 bg-muted/20 p-5" data-testid="section-live-scan">
              <div className="text-[13px] font-bold text-foreground">Live scan</div>
              <p className="mt-1 text-[12px] font-semibold text-muted-foreground">{isAllRules ? `Every Rule in ${ruleSet.name} reads its own source table.` : `Reads every distinct ${rule?.source.nameColumn ?? 'name'} in ${rule?.source.dataset ?? ''}.${rule?.source.table ?? ''}${rule?.source.filter ? `, where ${rule.source.filter.column} is ${rule.source.filter.in.join(' or ')}` : ''}.`} Counts are exact over the whole table; the list shows the first 5,000.</p>
              <button type="button" className={`${buttonPrimary} mt-4 w-full`} onClick={() => void runLiveScan()} disabled={scanning || !ruleSet || (!isAllRules && !rule)} data-testid="button-run-live-scan"><Database className="h-4 w-4" /> {scanning ? 'Scanning' : 'Scan BigQuery'}</button>
              {liveError && <p className="mt-3 text-[12px] font-semibold text-destructive" data-testid="text-live-error">{liveError}</p>}
            </div>
          )}
          <div hidden={source === 'live'} className={`mt-6 rounded-xl border-2 border-dashed p-6 transition-all duration-300 ${dragging ? 'border-primary bg-primary/5' : 'border-border bg-background hover:border-border/80 hover:bg-muted/30'}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); loadFile(event.dataTransfer.files[0]); }}>
            <label className="flex cursor-pointer flex-col items-center justify-center py-4 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground transition-all group-hover:bg-primary/10 group-hover:text-primary"><Upload className="h-5 w-5" /></div>
              <span className="mt-4 text-sm font-semibold text-foreground">Drop a CSV here or browse</span>
              <span className="mt-1.5 text-xs text-muted-foreground">UTF-8 · comma separated</span>
              <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(event) => loadFile(event.target.files?.[0])} data-testid="input-upload-csv" />
            </label>
          </div>

          <div className="relative mt-6" hidden={source === 'live'}>
            <div className="absolute right-3 top-3 font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground bg-background px-1">paste</div>
            <textarea className="min-h-[160px] w-full resize-y rounded-xl border border-border bg-background p-4 font-mono text-[13px] leading-relaxed text-foreground outline-none transition-all placeholder:text-muted-foreground/50 focus:border-primary focus:ring-1 focus:ring-primary/50 hover:border-border/80" value={csv} onChange={(event) => editCsv(event.target.value)} aria-label="CSV data" data-testid="textarea-csv-input" />
          </div>

          <button type="button" className={`${buttonPrimary} mt-5 w-full`} onClick={runCheck} disabled={!csv.trim()} hidden={source === 'live'} data-testid="button-run-check"><ClipboardCheck className="h-4 w-4" /> Validate names</button>
        </section>

        <section className="min-w-0">
          {liveSingle ? (
            <LiveSingleResults outcome={liveSingle} />
          ) : liveAll ? (
            <LiveAllRulesResults outcomes={liveAll} />
          ) : (singleResults || allRulesResults) ? (
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

// A live scan of one Rule: the exact counts in a banner, then the same list
// the CSV check shows, from the capped annotated results.
function LiveSingleResults({ outcome }: { outcome: ScanOutcome }) {
  const results: SingleCheckResult[] = outcome.results.map((item, index) => ({ row: index + 1, name: item.name, valid: item.valid, violations: item.violations }));
  return (
    <div>
      <div className="mb-4 rounded-xl border border-primary/30 bg-primary/10 p-4 text-xs text-primary" data-testid="text-live-summary">
        <span className="font-semibold">{outcome.valid.toLocaleString()} of {outcome.scanned.toLocaleString()} distinct names valid</span> ({outcome.scanned > 0 ? Math.round((outcome.valid / outcome.scanned) * 100) : 0}%), exact over the whole table.{outcome.truncated ? ` The list below shows the first ${outcome.results.length.toLocaleString()}.` : ''}
      </div>
      {outcome.scanned === 0 ? <p className="text-sm font-semibold text-muted-foreground" data-testid="text-live-empty">The source table has no names.</p> : <SingleResultsPanel results={results} validCount={results.filter((item) => item.valid).length} />}
    </div>
  );
}

// Every Rule's scan pooled through the engine's rollup, the same figure the
// CSV check reports under "All Rules"; a Rule whose scan failed shows why.
function LiveAllRulesResults({ outcomes }: { outcomes: Array<{ rule: Rule; outcome: ScanOutcome | null; error: string }> }) {
  const scans: RuleScan[] = outcomes.filter((item) => item.outcome).map((item) => ({ ruleId: item.rule.id, ruleKey: item.rule.key, ruleName: item.rule.name, ...(item.rule.tags ? { tags: item.rule.tags } : {}), scanned: item.outcome!.scanned, valid: item.outcome!.valid }));
  const summary: Rollup = rollup(scans);
  return (
    <div className="rounded-xl bg-card p-6 shadow-sm border border-border/30" data-testid="panel-live-all">
      <div className="flex items-start justify-between gap-4"><div><div className="font-display text-2xl font-medium text-foreground">All Rules, live</div><p className="mt-1.5 text-[13px] font-bold text-muted-foreground"><span className="text-foreground">{summary.total.valid.toLocaleString()}</span> of {summary.total.scanned.toLocaleString()} distinct names valid, pooled across {scans.length} Rule{scans.length === 1 ? '' : 's'}</p></div><StatusPill invalidCount={summary.total.invalid} /></div>
      <ul className="mt-5 divide-y divide-border/40">{outcomes.map((item) => <li key={item.rule.id} className="flex items-center justify-between gap-3 py-2.5 text-[13px]" data-testid={`row-live-rule-${item.rule.id}`}><span className="font-semibold text-foreground">{item.rule.name}<span className="ml-2 font-mono text-[10px] text-muted-foreground">{item.rule.source.dataset}.{item.rule.source.table}</span></span>{item.outcome ? <span className="font-mono text-[12px] text-muted-foreground">{item.outcome.valid.toLocaleString()} / {item.outcome.scanned.toLocaleString()} valid</span> : <span className="text-[12px] font-semibold text-destructive">{item.error}</span>}</li>)}</ul>
      <div className="mt-6 grid gap-4 sm:grid-cols-2"><TagBreakdown title="By platform" groups={summary.byPlatform} testId="breakdown-live-platform" /><TagBreakdown title="By entity type" groups={summary.byEntityType} testId="breakdown-live-entity" /></div>
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
        <div className="rounded-xl bg-card p-6 shadow-sm border border-border/30"><div className="font-display text-xl font-medium text-foreground">Checked</div><div className="mt-4 font-display text-[32px] font-medium text-foreground" data-testid="text-results-checked">{results.length}</div></div>
        <div className="rounded-xl bg-card p-6 shadow-sm border border-border/30"><div className="font-display text-xl font-medium text-foreground">Compliant</div><div className="mt-4 font-display text-[32px] font-medium text-foreground" data-testid="text-results-valid">{validCount}</div></div>
        <div className="rounded-xl bg-card p-6 shadow-sm border border-destructive/30"><div className="font-display text-xl font-medium text-destructive">Invalid</div><div className="mt-4 font-display text-[32px] font-medium text-destructive" data-testid="text-results-invalid">{invalidCount}</div></div>
      </div>
      <div className="overflow-hidden rounded-xl bg-card shadow-sm border border-border/30">
        <div className="flex items-center justify-between border-b border-border/50 px-6 py-5">
          <div><h2 className="font-display text-xl font-medium text-foreground">Validation results</h2></div>
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

function CountCard({ label, caption, counts, missingColumn, testId }: { label: string; caption?: string; counts: Counts; missingColumn?: string; testId?: string }) {
  return (
    <div className={`rounded-xl border p-4 shadow-sm ${missingColumn ? 'border-destructive/30 bg-destructive/5' : 'border-border/30 bg-muted/20'}`} data-testid={testId}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-display text-lg font-medium text-foreground">{label}</div>
          {caption && <div className="mt-1 text-[11px] font-bold text-muted-foreground">{caption}</div>}
        </div>
        {missingColumn ? (
          <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-destructive/10 border border-destructive/30 px-2 py-0.5 text-[10px] font-bold text-destructive">
            <AlertTriangle className="h-3 w-3" /> Missing column
          </span>
        ) : (
          <span className="shrink-0 font-display text-[28px] font-medium text-foreground">{percent(counts)}%</span>
        )}
      </div>
      {missingColumn
        ? <div className="mt-2 text-[11px] font-bold text-destructive">The CSV has no <span className="font-mono">{missingColumn}</span> column, so nothing was scanned for this Rule.</div>
        : <div className="mt-2 text-[11px] font-bold text-muted-foreground">{counts.valid} of {counts.scanned} valid</div>}
    </div>
  );
}

function TagBreakdown({ title, groups, testId }: { title: string; groups: Record<string, Counts>; testId: string }) {
  const entries = Object.entries(groups);
  // Only worth showing once at least one Rule carries this tag.
  if (!entries.some(([name]) => name !== UNTAGGED)) return null;
  return (
    <div className="mt-6" data-testid={testId}>
      <h4 className="mb-3 font-display text-lg font-medium text-foreground">{title}</h4>
      <div className="grid gap-3 sm:grid-cols-2">
        {entries.map(([name, counts]) => <CountCard key={name} label={name} counts={counts} />)}
      </div>
    </div>
  );
}

function AllRulesResultsPanel({ results, strictValidCount, ruleSet }: { results: AllRulesCheckResult[]; strictValidCount: number; ruleSet: RuleSet }) {
  const summary: Rollup = rollup(scansFromResults(ruleSet, results));
  const strictCounts: Counts = { scanned: results.length, valid: strictValidCount, invalid: results.length - strictValidCount };
  const missingColumnByRule = new Map(ruleSet.rules.map((rule) => [
    rule.key,
    results.some((row) => row.ruleEvals.some((item) => item.ruleKey === rule.key && item.columnMissing)) ? (rule.source.nameColumn || '(no column mapped)') : undefined,
  ]));

  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-card p-6 shadow-sm border border-border/30">
        <h3 className="mb-2 font-display text-2xl font-medium text-foreground">Rule Set compliance</h3>
        <div className="flex items-center gap-6 mt-4">
          <div className="font-display text-[40px] font-medium tracking-tight text-primary" data-testid="text-pooled-percent">{percent(summary.total)}%</div>
          <div className="text-[13px] font-bold text-muted-foreground">
            <span className="text-foreground">{summary.total.valid}</span> of {summary.total.scanned} names valid, pooled across {ruleSet.rules.length} Rule{ruleSet.rules.length === 1 ? '' : 's'}.
            <div className="mt-1 font-medium">Each Rule checks its own column; totals are summed across Rules.</div>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-border/50">
          <h4 className="mb-4 font-display text-xl font-medium text-foreground">Per Rule</h4>
          <div className="grid gap-4 sm:grid-cols-2">
            {summary.perRule.map((item) => (
              <CountCard
                key={item.ruleKey}
                label={item.ruleName}
                caption={`col: ${ruleSet.rules.find((rule) => rule.key === item.ruleKey)?.source.nameColumn ?? ''}`}
                counts={item}
                missingColumn={missingColumnByRule.get(item.ruleKey)}
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
            <h2 className="font-display text-xl font-medium text-foreground">Strict view: rows passing every Rule</h2>
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
                                <span className="font-semibold text-foreground">{f.ruleName}:</span>{' '}
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
