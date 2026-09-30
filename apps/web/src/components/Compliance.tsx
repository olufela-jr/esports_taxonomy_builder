import { useState, useEffect } from 'react';
import { complianceBoard, complianceOfRule, resolveRule, validateInRuleSet, type ComplianceBoard as Board, type Definition, type NameAnnotation, type Rule, type RuleCompliance, type ViolationCode } from '@taxo/shared';
import { useLocation } from 'wouter';
import { BarChart3, CheckCircle2, Database, Download, Upload, XCircle } from 'lucide-react';
import { scanRuleSet, type Scanner } from '@/data/scan';
import type { RuleSet } from '@/data/store';
import { downloadCsv, mappedColumns, namesForRule, readCsv, sampleCsv } from '@/lib/csv';
import { PageHeading } from './PageHeading';
import { EmptyState, ModeButton, percent, ResultsTable, StatusPill, TagBreakdown } from './results';
import { buttonPrimary, buttonQuiet, cardClass, tableRow } from './styles';

// One CSV row judged against every Rule at once: the strict secondary view for
// wide CSVs that carry a name per Rule in each row (migration checklist step 1).
type StrictRow = {
  row: number;
  valid: boolean;
  failures: Array<{ ruleId: string; ruleName: string; reason: string; suggestion?: string }>;
};

// Names are judged against resolved Rules (D46); the sample CSV is built from
// them too, so a definition-backed segment offers a real code.
function resolved(ruleSet: RuleSet, definitions: Definition[]): RuleSet {
  return { ...ruleSet, rules: ruleSet.rules.map((rule) => resolveRule(rule, ruleSet, definitions).rule) };
}

// Which breakdown row the drill panel is showing. Every field is optional
// because a row identifies itself by whichever of them it has.
type Drill = {
  label: string;
  matched: number;
  ruleId?: string;
  code?: ViolationCode;
  segmentId?: string;
  value?: string;
};

// Feature 3b: what fails and why, across every Rule in a Rule Set. All the
// counting is the engine's; this screen only formats it and filters its own
// annotated rows for the drill.
export function Compliance({ ruleSet, definitions, scanner, onSelectRule }: {
  ruleSet: RuleSet | undefined;
  definitions: Definition[];
  scanner: Scanner | null;
  onSelectRule: (id: string) => void;
}) {
  const [, setLocation] = useLocation();
  const [source, setSource] = useState<'csv' | 'live'>('csv');
  // The sample CSV follows the Rule Set until the user edits it, as Check does.
  const [csv, setCsv] = useState(() => (ruleSet ? sampleCsv(resolved(ruleSet, definitions)) : ''));
  const [csvTouched, setCsvTouched] = useState(false);
  const [board, setBoard] = useState<Board | null>(null);
  // Keyed by ruleId: what the drill panel filters. Only ever the rows this
  // browser was given, which is why the drill says how many it can show.
  const [annotated, setAnnotated] = useState<Map<string, NameAnnotation[]>>(new Map());
  const [strict, setStrict] = useState<StrictRow[] | null>(null);
  const [drill, setDrill] = useState<Drill | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);

  const ruleSetId = ruleSet?.id;

  const reset = () => {
    setBoard(null);
    setAnnotated(new Map());
    setStrict(null);
    setDrill(null);
    setError('');
  };

  useEffect(() => {
    reset();
  }, [ruleSetId, source]);

  useEffect(() => {
    if (!csvTouched) setCsv(ruleSet ? sampleCsv(resolved(ruleSet, definitions)) : '');
  }, [ruleSetId, ruleSet, csvTouched]);

  const editCsv = (value: string) => {
    setCsv(value);
    setCsvTouched(true);
    reset();
  };

  const loadFile = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => editCsv(String(reader.result ?? ''));
    reader.readAsText(file);
  };

  const runCsv = () => {
    if (!ruleSet) return;
    const table = readCsv(csv);
    if (!table) {
      setError('That CSV has no rows to check.');
      return;
    }
    const rows = new Map<string, NameAnnotation[]>();
    const perRule = ruleSet.rules.map((rule) => {
      const { column, names } = namesForRule(table, rule);
      if (!names) {
        return complianceOfRule({ rule, scanned: 0, valid: 0, analysed: [], skipped: `The CSV has no ${column || '(unmapped)'} column.` });
      }
      const analysed: NameAnnotation[] = names.map((name) => ({ name, ...validateInRuleSet(rule, ruleSet, definitions, name) }));
      rows.set(rule.id, analysed);
      return complianceOfRule({
        rule: resolveRule(rule, ruleSet, definitions).rule,
        scanned: analysed.length,
        valid: analysed.filter((entry) => entry.valid).length,
        analysed,
      });
    });
    setAnnotated(rows);
    setBoard(complianceBoard(perRule));
    setStrict(strictRows(ruleSet, rows, table.rows.length));
    setDrill(null);
    setError('');
  };

  const runLive = async () => {
    if (!scanner || !ruleSet || scanning) return;
    setScanning(true);
    reset();
    try {
      const outcomes = await scanRuleSet(scanner, ruleSet);
      const rows = new Map<string, NameAnnotation[]>();
      const perRule = outcomes.map(({ rule, outcome, error: failure }): RuleCompliance => {
        if (!outcome) {
          return complianceOfRule({ rule, scanned: 0, valid: 0, analysed: [], skipped: failure });
        }
        rows.set(rule.id, outcome.results);
        // The Function aggregates over the whole scan. Without that field the
        // scan service predates it, so fall back to the capped list, which
        // complianceOfRule then marks partial against the exact counts.
        return outcome.breakdown ?? complianceOfRule({
          rule: resolveRule(rule, ruleSet, definitions).rule,
          scanned: outcome.scanned,
          valid: outcome.valid,
          analysed: outcome.results,
        });
      });
      setAnnotated(rows);
      setBoard(complianceBoard(perRule));
      // A live scan reads each Rule's own table, so there is no shared row to
      // judge against every Rule at once.
      setStrict(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The scan failed.');
    } finally {
      setScanning(false);
    }
  };

  const openDrill = (next: Drill) => setDrill(next);

  const exportBoard = () => {
    if (!board || !ruleSet) return;
    const rows: string[][] = [
      ['scope', 'name', 'scanned', 'valid', 'invalid', 'percent_valid'],
      ['rule_set', ruleSet.name, String(board.rollup.total.scanned), String(board.rollup.total.valid), String(board.rollup.total.invalid), String(percent(board.rollup.total))],
      ...board.rollup.perRule.map((item) => ['rule', item.ruleName, String(item.scanned), String(item.valid), String(item.invalid), String(percent(item))]),
      [],
      ['cause', 'failing_names', 'violations'],
      ...board.byCause.map((cause) => [cause.label, String(cause.names), String(cause.violations)]),
      [],
      ['segment', 'failing_names', 'top_cause'],
      ...board.bySegment.map((segment) => [segment.segmentLabel, String(segment.names), segment.topCode]),
      [],
      ['value', 'segment', 'failing_names', 'suggestion'],
      ...board.byValue.map((value) => [value.value, value.segmentKey, String(value.names), value.suggestion ?? '']),
    ];
    downloadCsv(rows, 'ruleset-compliance.csv');
  };

  if (!ruleSet) {
    return (
      <div>
        <PageHeading eyebrow="Workspace" title="Compliance" description="What fails, and why, across every Rule in a Rule Set." />
        <EmptyState icon={<BarChart3 className="h-6 w-6" />} title="No Rule Set selected" body="Select a Rule Set from the sidebar to see how its names are doing." />
      </div>
    );
  }

  return (
    <div>
      <PageHeading
        eyebrow="Workspace"
        title="Compliance"
        description={`Every Rule in ${ruleSet.name}. The Rule selected in the sidebar does not narrow this board.`}
        action={board && (
          <button type="button" className={buttonQuiet} onClick={exportBoard} data-testid="button-export-compliance">
            <Download className="h-4 w-4" /> Export board
          </button>
        )}
      />
      <div className="grid gap-6 xl:grid-cols-[.85fr_1.15fr]">
        <section className={cardClass}>
          <div className="font-display text-2xl font-medium text-foreground">Names to check</div>

          <div className="mt-6">
            <div className="mb-2 text-[11px] font-bold text-muted-foreground">Source</div>
            <div className="grid grid-cols-2 rounded-md bg-muted/50 p-1 text-[13px] font-bold border border-border/30">
              <ModeButton active={source === 'csv'} onClick={() => setSource('csv')} testId="button-compliance-csv">CSV upload</ModeButton>
              <button type="button" className={`flex items-center justify-center gap-2 rounded-[4px] py-1.5 transition-all ${source === 'live' ? 'bg-card text-foreground shadow-sm ring-1 ring-border/20' : scanner ? 'text-muted-foreground hover:text-foreground' : 'cursor-not-allowed text-muted-foreground/50'}`} disabled={!scanner} title={scanner ? undefined : 'Live scan needs the shared workspace.'} onClick={() => setSource('live')} data-testid="button-compliance-live">
                Live scan {!scanner && <span className="rounded bg-black/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider dark:bg-white/10">Shared workspace</span>}
              </button>
            </div>
          </div>

          <div className="mt-5 rounded-lg border border-primary/30 bg-primary/10 p-4 text-xs text-primary shadow-sm">
            <div className="leading-relaxed opacity-90">Every Rule reads its own mapped column. Counts are pooled across Rules, the same way Check pools them.</div>
            <div className="mt-2 font-mono text-[11px] opacity-90" data-testid="text-compliance-columns">Expected columns: {mappedColumns(ruleSet).join(', ') || 'none mapped'}</div>
          </div>

          {source === 'live' ? (
            <div className="mt-6 rounded-xl border border-border/50 bg-muted/20 p-5" data-testid="section-compliance-scan">
              <div className="text-[13px] font-bold text-foreground">Live scan</div>
              <p className="mt-1 text-[12px] font-semibold text-muted-foreground">Every Rule in {ruleSet.name} reads its own source table. Counts and reasons are exact over the whole table; the names you can open below are the first 5,000 per Rule.</p>
              <button type="button" className={`${buttonPrimary} mt-4 w-full`} onClick={() => void runLive()} disabled={scanning} data-testid="button-run-compliance-scan"><Database className="h-4 w-4" /> {scanning ? 'Scanning' : 'Scan BigQuery'}</button>
            </div>
          ) : (
            <>
              <div className={`mt-6 rounded-xl border-2 border-dashed p-6 transition-all duration-300 ${dragging ? 'border-primary bg-primary/5' : 'border-border bg-background hover:border-border/80 hover:bg-muted/30'}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); loadFile(event.dataTransfer.files[0]); }}>
                <label className="flex cursor-pointer flex-col items-center justify-center py-4 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground"><Upload className="h-5 w-5" /></div>
                  <span className="mt-4 text-sm font-semibold text-foreground">Drop a CSV here or browse</span>
                  <span className="mt-1.5 text-xs text-muted-foreground">UTF-8 · comma separated</span>
                  <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(event) => loadFile(event.target.files?.[0])} data-testid="input-compliance-csv" />
                </label>
              </div>
              <div className="relative mt-6">
                <div className="absolute right-3 top-3 font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground bg-background px-1">paste</div>
                <textarea className="min-h-[160px] w-full resize-y rounded-xl border border-border bg-background p-4 font-mono text-[13px] leading-relaxed text-foreground outline-none transition-all placeholder:text-muted-foreground/50 focus:border-primary focus:ring-1 focus:ring-primary/50 hover:border-border/80" value={csv} onChange={(event) => editCsv(event.target.value)} aria-label="CSV data" data-testid="textarea-compliance-csv" />
              </div>
              <button type="button" className={`${buttonPrimary} mt-5 w-full`} onClick={runCsv} disabled={!csv.trim()} data-testid="button-run-compliance"><BarChart3 className="h-4 w-4" /> Build the board</button>
            </>
          )}
          {error && <p className="mt-3 text-[12px] font-semibold text-destructive" data-testid="text-compliance-error">{error}</p>}
        </section>

        <section className="min-w-0">
          {board ? (
            <BoardPanels
              board={board}
              ruleSet={ruleSet}
              strict={strict}
              drill={drill}
              annotated={annotated}
              onDrill={openDrill}
              onCloseDrill={() => setDrill(null)}
              onOpenRule={(ruleId) => { onSelectRule(ruleId); setLocation('/check'); }}
            />
          ) : (
            <EmptyState icon={<BarChart3 className="h-6 w-6" />} title="Nothing checked yet" body="Upload a CSV or run a live scan to see what is failing and why." />
          )}
        </section>
      </div>
    </div>
  );
}

function Bar({ share }: { share: number }) {
  return (
    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div className="h-full rounded-full bg-destructive" style={{ width: `${Math.max(2, Math.round(share * 100))}%` }} />
    </div>
  );
}

function BoardPanels({ board, ruleSet, strict, drill, annotated, onDrill, onCloseDrill, onOpenRule }: {
  board: Board;
  ruleSet: RuleSet;
  strict: StrictRow[] | null;
  drill: Drill | null;
  annotated: Map<string, NameAnnotation[]>;
  onDrill: (drill: Drill) => void;
  onCloseDrill: () => void;
  onOpenRule: (ruleId: string) => void;
}) {
  const worst = board.byCause[0]?.names ?? 1;
  const worstSegment = board.bySegment[0]?.names ?? 1;

  return (
    <div className="space-y-6">
      <div className={cardClass}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-display text-2xl font-medium text-foreground">Rule Set compliance</h3>
            <div className="mt-4 flex items-center gap-6">
              <div className="font-display text-[40px] font-medium tracking-tight text-primary" data-testid="text-compliance-percent">{percent(board.rollup.total)}%</div>
              <div className="text-[13px] font-bold text-muted-foreground">
                <span className="text-foreground">{board.rollup.total.valid.toLocaleString()}</span> of {board.rollup.total.scanned.toLocaleString()} names valid, pooled across {board.perRule.length} Rule{board.perRule.length === 1 ? '' : 's'}.
              </div>
            </div>
          </div>
          <StatusPill invalidCount={board.rollup.total.invalid} />
        </div>
        {board.coverage.partial && (
          // The counts above are exact; the rankings below are not. Say so
          // rather than letting a sample read as the whole picture.
          <p className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-[11px] font-bold text-destructive" data-testid="text-compliance-coverage">
            Counts are exact over {board.coverage.scanned.toLocaleString()} names. The reasons below come from the {board.coverage.analysed.toLocaleString()} analysed for {board.coverage.partialRules.join(', ')}, in query order, so the rankings are a sample.
          </p>
        )}
      </div>

      <ResultsTable title="Failing segments" subtitle="Which part of the name goes wrong most, pooled across Rules that share a segment." columns={['Segment', 'Failing names', 'Most common cause']} testId="panel-by-segment">
        {board.bySegment.length === 0 ? (
          <tr><td className="px-5 py-6 text-muted-foreground" colSpan={3}>Nothing failed.</td></tr>
        ) : board.bySegment.map((segment) => (
          <tr key={segment.segmentId || segment.segmentKey} className={`${tableRow} cursor-pointer`} onClick={() => onDrill({ label: segment.segmentLabel, matched: segment.names, segmentId: segment.segmentId || undefined, code: segment.segmentId ? undefined : segment.topCode })} data-testid={`row-segment-${segment.segmentId || segment.segmentKey}`}>
            <td className="px-5 py-4"><span className="font-semibold text-foreground">{segment.segmentLabel}</span><span className="ml-2 font-mono text-[10px] text-muted-foreground">{segment.segmentKey}</span></td>
            <td className="w-[180px] px-5 py-4 text-muted-foreground"><span className="font-mono text-foreground">{segment.names.toLocaleString()}</span><Bar share={segment.names / worstSegment} /></td>
            <td className="px-5 py-4 text-muted-foreground">{causeText(segment.topCode, board)}</td>
          </tr>
        ))}
      </ResultsTable>

      <ResultsTable title="Why names fail" subtitle="Grouped by cause, not by wording, so one cause is one row." columns={['Cause', 'Failing names', 'Violations']} testId="panel-by-cause">
        {board.byCause.length === 0 ? (
          <tr><td className="px-5 py-6 text-muted-foreground" colSpan={3}>Nothing failed.</td></tr>
        ) : board.byCause.map((cause) => (
          <tr key={cause.code} className={`${tableRow} cursor-pointer`} onClick={() => onDrill({ label: cause.label, matched: cause.names, code: cause.code })} data-testid={`row-cause-${cause.code}`}>
            <td className="px-5 py-4 font-semibold text-foreground">{cause.label}</td>
            <td className="w-[180px] px-5 py-4 text-muted-foreground"><span className="font-mono text-foreground">{cause.names.toLocaleString()}</span><Bar share={cause.names / worst} /></td>
            <td className="px-5 py-4 font-mono text-muted-foreground">{cause.violations.toLocaleString()}</td>
          </tr>
        ))}
      </ResultsTable>

      <ResultsTable
        title="Top offending values"
        subtitle={board.valuesCapped ? 'The values rejected most often. Showing the top rows only.' : 'The values rejected most often.'}
        columns={['Value', 'Segment', 'Failing names', 'Suggestion']}
        testId="panel-by-value"
      >
        {board.byValue.length === 0 ? (
          <tr><td className="px-5 py-6 text-muted-foreground" colSpan={4}>No rejected values.</td></tr>
        ) : board.byValue.map((value) => (
          <tr key={`${value.segmentId}-${value.value}`} className={`${tableRow} cursor-pointer`} onClick={() => onDrill({ label: `${value.segmentKey} = ${value.value}`, matched: value.names, segmentId: value.segmentId, value: value.value })} data-testid={`row-value-${value.segmentId}-${value.value}`}>
            <td className="px-5 py-4 font-mono text-[11px] text-foreground">{value.value || <span className="text-muted-foreground">Blank</span>}</td>
            <td className="px-5 py-4 font-mono text-[11px] text-muted-foreground">{value.segmentKey}</td>
            <td className="px-5 py-4 font-mono text-muted-foreground">{value.names.toLocaleString()}</td>
            <td className="px-5 py-4 text-muted-foreground">{value.suggestion ? <span className="font-semibold text-foreground">Try: <span className="font-mono text-[11px]">{value.suggestion}</span></span> : '—'}</td>
          </tr>
        ))}
      </ResultsTable>

      <ResultsTable title="Per Rule" subtitle="Open a Rule to check it on its own." columns={['Rule', 'Valid', 'Worst cause', '']} testId="panel-per-rule">
        {board.perRule.map((rule) => (
          <tr key={rule.ruleId} className={`${tableRow} cursor-pointer`} onClick={() => onOpenRule(rule.ruleId)} data-testid={`row-health-${rule.ruleId}`}>
            <td className="px-5 py-4">
              <span className="font-semibold text-foreground">{rule.ruleName}</span>
              <span className="ml-2 font-mono text-[10px] text-muted-foreground">{ruleSet.rules.find((item) => item.id === rule.ruleId)?.source.nameColumn}</span>
              {rule.partial && <span className="ml-2 rounded bg-destructive/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-destructive">Sampled</span>}
            </td>
            <td className="px-5 py-4 font-mono text-muted-foreground">{rule.skipped ? '—' : `${rule.valid.toLocaleString()} / ${rule.scanned.toLocaleString()}`}</td>
            <td className="px-5 py-4 text-muted-foreground">{rule.skipped ? <span className="font-semibold text-destructive">{rule.skipped}</span> : rule.topCause ? causeText(rule.topCause, board) : 'All clear'}</td>
            <td className="px-5 py-4 text-right font-mono text-[11px] text-muted-foreground">{rule.skipped ? '' : `${percent(rule)}%`}</td>
          </tr>
        ))}
      </ResultsTable>

      <div>
        <TagBreakdown title="By platform" groups={board.rollup.byPlatform} testId="breakdown-compliance-platform" />
        <TagBreakdown title="By entity type" groups={board.rollup.byEntityType} testId="breakdown-compliance-entity" />
      </div>

      {strict && <StrictPanel rows={strict} ruleCount={board.perRule.length} />}

      {drill && <DrillPanel drill={drill} board={board} annotated={annotated} onClose={onCloseDrill} />}
    </div>
  );
}

function causeText(code: ViolationCode, board: Board): string {
  return board.byCause.find((cause) => cause.code === code)?.label ?? code;
}

// Every name behind one breakdown row, filtered out of the rows this browser
// holds. The row's own count is the truth; this list may be shorter.
function DrillPanel({ drill, board, annotated, onClose }: { drill: Drill; board: Board; annotated: Map<string, NameAnnotation[]>; onClose: () => void }) {
  const matches: Array<{ ruleName: string; annotation: NameAnnotation }> = [];
  for (const rule of board.perRule) {
    for (const annotation of annotated.get(rule.ruleId) ?? []) {
      if (annotation.valid) continue;
      if (drill.ruleId && drill.ruleId !== rule.ruleId) continue;
      const hit = annotation.violations.some((violation) =>
        (!drill.code || (violation.code ?? 'unclassified') === drill.code)
        && (!drill.segmentId || violation.segmentId === drill.segmentId)
        && (drill.value === undefined || violation.token === drill.value));
      if (hit) matches.push({ ruleName: rule.ruleName, annotation });
    }
  }

  const download = () => downloadCsv(
    [['rule', 'name', 'reasons'], ...matches.map((match) => [match.ruleName, match.annotation.name, match.annotation.violations.map((violation) => violation.reason).join(' | ')])],
    'compliance-drill.csv',
  );

  return (
    <ResultsTable
      title={`Names failing: ${drill.label}`}
      subtitle={matches.length < drill.matched
        ? `Showing ${matches.length.toLocaleString()} of ${drill.matched.toLocaleString()} matching names: only the names this scan returned can be listed.`
        : `${matches.length.toLocaleString()} name${matches.length === 1 ? '' : 's'}.`}
      action={(
        <div className="flex items-center gap-2">
          <button type="button" className={buttonQuiet} onClick={download} data-testid="button-export-drill"><Download className="h-4 w-4" /> Export</button>
          <button type="button" className={buttonQuiet} onClick={onClose} data-testid="button-close-drill">Close</button>
        </div>
      )}
      columns={['Name', 'Rule', 'Finding']}
      testId="panel-drill"
    >
      {matches.length === 0 ? (
        <tr><td className="px-5 py-6 text-muted-foreground" colSpan={3}>None of the names this scan returned match that row.</td></tr>
      ) : matches.map((match, index) => (
        <tr key={`${match.ruleName}-${match.annotation.name}-${index}`} className={tableRow} data-testid={`row-drill-${match.annotation.name}`}>
          <td className="max-w-[240px] truncate px-5 py-4 font-mono text-[11px] text-foreground">{match.annotation.name || <span className="text-muted-foreground">Blank</span>}</td>
          <td className="px-5 py-4 text-muted-foreground">{match.ruleName}</td>
          <td className="max-w-[280px] px-5 py-4 text-muted-foreground">
            <div>{match.annotation.violations.map((violation) => violation.reason).join(' ')}</div>
            {match.annotation.violations.find((violation) => violation.suggestion) && (
              <div className="mt-1.5 font-semibold text-foreground">Try: <span className="font-mono text-[11px]">{match.annotation.violations.find((violation) => violation.suggestion)?.suggestion}</span></div>
            )}
          </td>
        </tr>
      ))}
    </ResultsTable>
  );
}

// The per-row conjunction: a row passes only if every Rule that had a column
// accepted its name. Kept as a clearly secondary figure beside the pooled one.
function strictRows(ruleSet: RuleSet, annotated: Map<string, NameAnnotation[]>, rowCount: number): StrictRow[] {
  const judged = ruleSet.rules.filter((rule) => annotated.has(rule.id));
  return Array.from({ length: rowCount }, (_, index) => {
    const failures: StrictRow['failures'] = [];
    for (const rule of judged) {
      const annotation = annotated.get(rule.id)?.[index];
      if (!annotation || annotation.valid) continue;
      failures.push({
        ruleId: rule.id,
        ruleName: rule.name,
        reason: annotation.violations.map((violation) => violation.reason).join(', '),
        ...(annotation.violations.find((violation) => violation.suggestion)?.suggestion
          ? { suggestion: annotation.violations.find((violation) => violation.suggestion)!.suggestion }
          : {}),
      });
    }
    return { row: index + 2, valid: failures.length === 0, failures };
  });
}

function StrictPanel({ rows, ruleCount }: { rows: StrictRow[]; ruleCount: number }) {
  const valid = rows.filter((row) => row.valid).length;
  const share = rows.length > 0 ? Math.round((valid / rows.length) * 100) : 0;
  return (
    <ResultsTable
      title="Strict view: rows passing every Rule"
      subtitle={<span data-testid="text-strict-summary">{valid} of {rows.length} rows ({share}%) pass all {ruleCount} Rules at once. Secondary figure for wide CSVs where one row carries a name per Rule.</span>}
      action={<StatusPill invalidCount={rows.length - valid} />}
      columns={['Row', 'Overall', 'Rule failures']}
      testId="panel-strict"
    >
      {rows.map((row) => (
        <tr key={row.row} className={tableRow} data-testid={`row-result-all-${row.row}`}>
          <td className="px-5 py-4 font-mono text-muted-foreground">{row.row}</td>
          <td className="px-5 py-4">{row.valid
            ? <span className="inline-flex items-center gap-1.5 font-semibold text-foreground"><CheckCircle2 className="h-4 w-4" /> Valid</span>
            : <span className="inline-flex items-center gap-1.5 font-semibold text-destructive"><XCircle className="h-4 w-4" /> Invalid</span>}</td>
          <td className="max-w-[300px] px-5 py-4 text-muted-foreground">
            {row.valid ? <span className="text-muted-foreground">Passes all</span> : (
              <div className="space-y-1.5">
                {row.failures.map((failure) => (
                  <div key={failure.ruleId} className="text-[11px] leading-relaxed">
                    <span className="font-semibold text-foreground">{failure.ruleName}:</span> {failure.reason}
                    {failure.suggestion && <div className="mt-0.5 font-semibold text-foreground">Try: <span className="font-mono">{failure.suggestion}</span></div>}
                  </div>
                ))}
              </div>
            )}
          </td>
        </tr>
      ))}
    </ResultsTable>
  );
}
