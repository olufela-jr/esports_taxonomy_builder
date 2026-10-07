import { useState, useEffect } from 'react';
import { resolveRule, validate, validateInRuleSet, type Definition, type Rule, type Violation } from '@taxo/shared';
import { Link } from 'wouter';
import { ClipboardCheck, Database, Download, FileSpreadsheet, Filter, Upload, CheckCircle2, XCircle } from 'lucide-react';
import type { Scanner, ScanOutcome } from '@/data/scan';
import type { RuleSet } from '@/data/store';
import { downloadCsv, readCsv, sampleCsv } from '@/lib/csv';
import { PageHeading } from './PageHeading';
import { EmptyState, ModeButton, ResultsTable, StatusPill } from './results';
import { buttonPrimary, buttonQuiet, cardClass, inputClass, tableRow } from './styles';

type SingleCheckResult = { row: number; name: string; valid: boolean; violations: Violation[] };

// Feature 3a: validate a CSV export, or the live source, against the one Rule
// selected in the shell. Every Rule at once is the Compliance board's job.
export function CsvChecker({ ruleSet, rule, definitions, scanner }: { ruleSet: RuleSet | undefined; rule: Rule | undefined; definitions: Definition[]; scanner: Scanner | null }) {
  // Names are checked against resolved Rules (parents inherited, shared
  // definitions filled in, D46). A Rule that cannot be resolved fails every
  // name with the resolution errors as the reason, never a silent mismatch.
  const resolvedRuleSet = ruleSet ? { ...ruleSet, rules: ruleSet.rules.map((item) => resolveRule(item, ruleSet, definitions).rule) } : undefined;
  const checkName = (target: Rule, name: string) =>
    ruleSet ? validateInRuleSet(target, ruleSet, definitions, name) : validate(target, name);
  const ruleSetId = ruleSet?.id;
  const ruleId = rule?.id;

  // The sample CSV and name column follow the selection until the user edits them.
  const [csv, setCsv] = useState(() => (resolvedRuleSet ? sampleCsv(resolvedRuleSet) : ''));
  const [csvTouched, setCsvTouched] = useState(false);
  const [nameColumn, setNameColumn] = useState(() => rule?.source.nameColumn || 'name');
  const [columnTouched, setColumnTouched] = useState(false);
  const [singleResults, setSingleResults] = useState<SingleCheckResult[] | null>(null);
  const [dragging, setDragging] = useState(false);
  // Stage 2: the live scan reads the Rule's BigQuery source through the
  // Function; counts are exact over the full scan, the list is capped.
  const [source, setSource] = useState<'csv' | 'live'>('csv');
  const [scanning, setScanning] = useState(false);
  const [liveSingle, setLiveSingle] = useState<ScanOutcome | null>(null);
  const [liveError, setLiveError] = useState('');

  const resetResults = () => {
    setSingleResults(null);
    setLiveSingle(null);
    setLiveError('');
  };

  const runLiveScan = async () => {
    if (!scanner || !ruleSet || !rule || scanning) return;
    setScanning(true);
    resetResults();
    try {
      setLiveSingle(await scanner.scanRule(ruleSet.id, rule.id));
    } catch (cause) {
      setLiveError(cause instanceof Error ? cause.message : 'The scan failed.');
    } finally {
      setScanning(false);
    }
  };

  useEffect(() => {
    resetResults();
  }, [ruleSetId, ruleId]);

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

  const runCheck = () => {
    if (!ruleSet || !rule) return;
    const table = readCsv(csv);
    if (!table) return;

    const columnIndex = table.headers.indexOf(nameColumn.toLowerCase());
    if (columnIndex === -1) {
      setSingleResults([{
        row: 0,
        name: '',
        valid: false,
        // Not an engine cause: the CSV never offered a name to judge.
        violations: [{ code: 'unclassified', segmentKey: 'N/A', token: '', reason: `Missing mapped column: ${nameColumn}` }],
      }]);
      return;
    }

    setSingleResults(table.rows.map((row, index) => {
      const name = row[columnIndex] ?? '';
      const validation = checkName(rule, name);
      return { row: index + 2, name, valid: validation.valid, violations: validation.violations };
    }));
  };

  const loadFile = (file?: File) => { if (!file) return; const reader = new FileReader(); reader.onload = () => { editCsv(String(reader.result ?? '')); }; reader.readAsText(file); };

  const exportSingleResults = () => {
    if (!singleResults) return;
    const rows = [['row', 'name', 'status', 'violations', 'suggestions'], ...singleResults.map((item) => [String(item.row), item.name, item.valid ? 'valid' : 'invalid', item.violations.map((violation) => `${violation.segmentKey}: ${violation.reason}`).join(' | '), item.violations.map((violation) => violation.suggestion ?? '').join(' | ')]),];
    downloadCsv(rows, 'ruleset-single-check-results.csv');
  };

  if (!ruleSet || !rule) {
    return (
      <div>
        <PageHeading eyebrow="Workspace" title="Validate a CSV export" description="Upload a CSV export to check names against rules." />
        <EmptyState icon={<Filter className="h-6 w-6" />} title="No Rule selected" body="Select a Rule Set and a Rule from the sidebar to validate data." />
      </div>
    );
  }

  const validCount = singleResults ? singleResults.filter(r => r.valid).length : 0;
  return (
    <div>
      <PageHeading
        eyebrow="Workspace"
        title="Validate a CSV export"
        description="Upload a CSV export to check names against rules."
        action={singleResults && (
          <button type="button" className={buttonQuiet} onClick={exportSingleResults} data-testid="button-export-results">
            <Download className="h-4 w-4" /> Export results
          </button>
        )}
      />
      <div className="grid gap-6 xl:grid-cols-[.85fr_1.15fr]">
        <section className={cardClass}>
          <div className="flex items-start justify-between">
            <div className="flex flex-col">
              <div className="font-display text-2xl font-medium text-foreground">Validation source</div>
            </div>
            <div className="flex h-5 w-5 items-center justify-center rounded-full border border-muted-foreground/30 text-muted-foreground"><FileSpreadsheet className="h-3 w-3" /></div>
          </div>

          <div className="mt-6">
            <div className="mb-2 text-[11px] font-bold text-muted-foreground">Source</div>
            <div className="grid grid-cols-2 rounded-md bg-muted/50 p-1 text-[13px] font-bold border border-border/30">
              <ModeButton active={source === 'csv'} onClick={() => { setSource('csv'); resetResults(); }} testId="button-source-csv">CSV upload</ModeButton>
              <button type="button" className={`flex items-center justify-center gap-2 rounded-[4px] py-1.5 transition-all ${source === 'live' ? 'bg-card text-foreground shadow-sm ring-1 ring-border/20' : scanner ? 'text-muted-foreground hover:text-foreground' : 'cursor-not-allowed text-muted-foreground/50'}`} disabled={!scanner} title={scanner ? undefined : 'Live scan needs the shared workspace.'} onClick={() => { setSource('live'); resetResults(); }} data-testid="button-source-live-scan">
                Live scan {!scanner && <span className="rounded bg-black/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider">Shared workspace</span>}
              </button>
            </div>
          </div>

          <div className="mt-6">
            <label className="block text-[13px] font-bold text-foreground">Name column:<input className={`${inputClass} mt-2 font-mono text-sm`} value={nameColumn} onChange={(event) => { setNameColumn(event.target.value); setColumnTouched(true); resetResults(); }} data-testid="input-check-column" /></label>
          </div>

          <p className="mt-5 text-[12px] font-semibold text-muted-foreground" data-testid="text-check-all-rules-link">
            Checking every Rule at once? See the <Link href="/compliance" className="font-bold text-primary underline underline-offset-2" data-testid="link-compliance-board">Compliance board</Link>.
          </p>

          {source === 'live' && (
            <div className="mt-6 rounded-xl border border-border/50 bg-muted/20 p-5" data-testid="section-live-scan">
              <div className="text-[13px] font-bold text-foreground">Live scan</div>
              <p className="mt-1 text-[12px] font-semibold text-muted-foreground">Reads every distinct {rule.source.nameColumn || 'name'} in {rule.source.dataset}.{rule.source.table}{rule.source.filter ? `, where ${rule.source.filter.column} is ${rule.source.filter.in.join(' or ')}` : ''}. Counts are exact over the whole table; the list shows the first 5,000.</p>
              <button type="button" className={`${buttonPrimary} mt-4 w-full`} onClick={() => void runLiveScan()} disabled={scanning} data-testid="button-run-live-scan"><Database className="h-4 w-4" /> {scanning ? 'Scanning' : 'Scan BigQuery'}</button>
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
          ) : singleResults ? (
            <SingleResultsPanel results={singleResults} validCount={validCount} />
          ) : (
            <EmptyState icon={<Filter className="h-6 w-6" />} title="Ready for validation" body="Results will display compliance status and suggested fixes." />
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

function SingleResultsPanel({ results, validCount }: { results: SingleCheckResult[]; validCount: number }) {
  const invalidCount = results.length - validCount;
  return (
    <div>
      <div className="mb-6 grid grid-cols-3 gap-4">
        <div className={cardClass}><div className="font-display text-xl font-medium text-foreground">Checked</div><div className="mt-4 font-display text-[32px] font-medium text-foreground" data-testid="text-results-checked">{results.length}</div></div>
        <div className={cardClass}><div className="font-display text-xl font-medium text-foreground">Compliant</div><div className="mt-4 font-display text-[32px] font-medium text-foreground" data-testid="text-results-valid">{validCount}</div></div>
        <div className="rounded-xl bg-card p-6 shadow-sm border border-destructive/30"><div className="font-display text-xl font-medium text-destructive">Invalid</div><div className="mt-4 font-display text-[32px] font-medium text-destructive" data-testid="text-results-invalid">{invalidCount}</div></div>
      </div>
      <ResultsTable title="Validation results" action={<StatusPill invalidCount={invalidCount} />} columns={['Row', 'Campaign name', 'Status', 'Finding']}>
        {results.map((result) => (
          <tr key={result.row} className={tableRow} data-testid={`row-result-${result.row}`}>
            <td className="px-5 py-4 font-mono text-muted-foreground">{result.row}</td>
            <td className="max-w-[220px] truncate px-5 py-4 font-mono text-[11px] text-foreground">{result.name || <span className="text-muted-foreground">Blank</span>}</td>
            <td className="px-5 py-4">{result.valid ? <span className="inline-flex items-center gap-1.5 font-semibold text-foreground"><CheckCircle2 className="h-4 w-4" /> Valid</span> : <span className="inline-flex items-center gap-1.5 font-semibold text-destructive"><XCircle className="h-4 w-4" /> Invalid</span>}</td>
            <td className="max-w-[280px] px-5 py-4 text-muted-foreground">{result.valid ? <span className="text-muted-foreground">Matches rules</span> : <div><div>{result.violations.map((item) => item.reason).join(' ')}</div>{result.violations[0]?.suggestion && <div className="mt-1.5 font-semibold text-foreground">Try: <span className="font-mono text-[11px]">{result.violations[0].suggestion}</span></div>}</div>}</td>
          </tr>
        ))}
      </ResultsTable>
    </div>
  );
}
