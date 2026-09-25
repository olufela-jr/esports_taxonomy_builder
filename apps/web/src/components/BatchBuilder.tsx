import { useEffect, useState } from 'react';
import { AlertCircle, Download, Play } from 'lucide-react';
import { buildTrackingUrl, checkBatchChoices, countCombinations, enumerate, type BatchChoices, type Rule, type Segment } from '@taxo/shared';
import type { RuleSet } from '@/data/store';
import { buttonPrimary, buttonQuiet, inputClass } from './styles';

// Phase 3: every combination of the chosen values for a Rule as a CSV (v2
// D32, D33). Each enum control becomes a multi-select, each freeform control
// takes one value per line, each optional segment offers include, omit or
// both. The engine streams rows; the page keeps a preview and a Blob.

// The cap protects browser memory; the engine itself streams (D32).
export const BATCH_ROW_CAP = 50_000;
const PREVIEW_ROWS = 500;

type OptionalMode = 'include' | 'omit' | 'both';

type BatchBuilderProps = {
  rule: Rule;       // as stored, for its id and mapping
  active: Rule;     // resolved
  ruleSet: RuleSet;
  inheritedValues: Record<string, string>; // from the parent step; single-item lists, locked
  parentName: string;
  baseUrl: string;
};

function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export function BatchBuilder({ rule, active, ruleSet, inheritedValues, parentName, baseUrl }: BatchBuilderProps) {
  const [picked, setPicked] = useState<Record<string, string[]>>({});
  const [lines, setLines] = useState<Record<string, string>>({});
  const [optional, setOptional] = useState<Record<string, OptionalMode>>({});
  const [preview, setPreview] = useState<Array<{ selections: Record<string, string>; name: string; url: string }>>([]);
  const [generated, setGenerated] = useState<number | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  // A new Rule starts a new batch; a stale object URL is released.
  useEffect(() => {
    setPicked({}); setLines({}); setOptional({}); setPreview([]); setGenerated(null);
    setDownloadUrl((current) => { if (current) URL.revokeObjectURL(current); return null; });
  }, [rule.id]);

  const inherited = new Set(Object.keys(inheritedValues));
  const segments = active.segments;

  const choices: BatchChoices = {};
  for (const segment of segments) {
    if (inherited.has(segment.key)) {
      choices[segment.key] = [inheritedValues[segment.key]];
      continue;
    }
    const mode = optional[segment.key] ?? 'include';
    const values = segment.kind === 'enum'
      ? picked[segment.key] ?? []
      : [...new Set((lines[segment.key] ?? '').split('\n').map((line) => line.trim()).filter(Boolean))];
    if (segment.required) {
      choices[segment.key] = values;
    } else if (mode === 'omit') {
      choices[segment.key] = [''];
    } else {
      choices[segment.key] = mode === 'both' ? [...values, ''] : values;
    }
  }

  const errors = checkBatchChoices(active, choices);
  const count = errors.length === 0 ? countCombinations(active, choices) : 0;
  const overCap = count > BATCH_ROW_CAP;
  const canGenerate = errors.length === 0 && count > 0 && !overCap;
  const mapping = active.utm;

  const togglePick = (key: string, code: string) => setPicked((current) => {
    const list = current[key] ?? [];
    return { ...current, [key]: list.includes(code) ? list.filter((item) => item !== code) : [...list, code] };
  });
  const selectAll = (segment: Segment) => {
    if (segment.kind !== 'enum') return;
    const all = segment.allowedValues.map((entry) => entry.code);
    setPicked((current) => ({ ...current, [segment.key]: (current[segment.key] ?? []).length === all.length ? [] : all }));
  };

  const generate = () => {
    if (!canGenerate) return;
    const header = [...segments.map((segment) => segment.key), 'name', ...(mapping ? ['tracking_url'] : [])];
    const chunks: string[] = [`${header.join(',')}\n`];
    const rows: typeof preview = [];
    let total = 0;
    // One row at a time from the engine into the CSV text; only the preview stays in state.
    for (const row of enumerate(active, choices)) {
      let url = '';
      if (mapping) {
        const names: Record<string, string> = { [rule.id]: row.name };
        if (rule.parent && parentName) names[rule.parent.ruleId] = parentName;
        url = buildTrackingUrl(active, ruleSet, { names, selections: row.selections, baseUrl }).url ?? '';
      }
      const cells = [...segments.map((segment) => row.selections[segment.key] ?? ''), row.name, ...(mapping ? [url] : [])];
      chunks.push(`${cells.map(csvCell).join(',')}\n`);
      if (rows.length < PREVIEW_ROWS) rows.push({ selections: row.selections, name: row.name, url });
      total += 1;
    }
    const blob = new Blob(chunks, { type: 'text/csv;charset=utf-8' });
    setDownloadUrl((current) => { if (current) URL.revokeObjectURL(current); return URL.createObjectURL(blob); });
    setPreview(rows);
    setGenerated(total);
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[1.2fr_.8fr]" data-testid="section-batch">
      <section className="rounded-xl bg-card p-6 shadow-sm border border-border/30">
        <div className="mb-6"><div className="font-display text-2xl font-medium text-foreground">Batch values</div><p className="mt-1 text-[13px] font-bold text-muted-foreground">Every combination of what you tick becomes a name. Codes go into the names; labels are for you.</p></div>
        <div className="space-y-6">
          {segments.map((segment) => (
            <div key={segment.id} data-testid={`batch-segment-${segment.key}`}>
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="text-[13px] font-bold text-foreground">{segment.label}<span className="ml-2 font-mono text-[10px] font-normal text-muted-foreground">{segment.key}</span></span>
                <div className="flex items-center gap-2">
                  {!segment.required && !inherited.has(segment.key) && <select className={`${inputClass} h-8 w-auto`} value={optional[segment.key] ?? 'include'} onChange={(event) => setOptional((current) => ({ ...current, [segment.key]: event.target.value as OptionalMode }))} aria-label={`${segment.label}: include, omit or both`} data-testid={`select-batch-optional-${segment.key}`}><option value="include">Include</option><option value="omit">Omit</option><option value="both">Both</option></select>}
                  {segment.kind === 'enum' && !inherited.has(segment.key) && (optional[segment.key] ?? 'include') !== 'omit' && <button type="button" className="text-[12px] font-bold text-primary underline-offset-2 hover:underline" onClick={() => selectAll(segment)} data-testid={`button-batch-select-all-${segment.key}`}>{(picked[segment.key] ?? []).length === segment.allowedValues.length ? 'Clear' : 'Select all'}</button>}
                </div>
              </div>
              {inherited.has(segment.key) ? (
                <div className="rounded-[4px] bg-muted/40 px-3 py-2 font-mono text-[13px] text-foreground" data-testid={`text-batch-inherited-${segment.key}`}>{inheritedValues[segment.key]} <span className="ml-2 font-sans text-[11px] font-bold text-muted-foreground">from the parent name</span></div>
              ) : (optional[segment.key] ?? 'include') === 'omit' ? (
                <p className="text-[12px] font-bold text-muted-foreground">Left out of every name.</p>
              ) : segment.kind === 'enum' ? (
                <div className="flex flex-wrap gap-x-4 gap-y-2">{segment.allowedValues.map((entry) => <label key={entry.code} className="inline-flex items-center gap-2 text-[13px] font-semibold text-foreground"><input type="checkbox" checked={(picked[segment.key] ?? []).includes(entry.code)} onChange={() => togglePick(segment.key, entry.code)} className="h-4 w-4 rounded-sm border-gray-300 text-primary focus:ring-primary" data-testid={`checkbox-batch-${segment.key}-${entry.code}`} /> {entry.label === entry.code ? entry.label : `${entry.label} (${entry.code})`}</label>)}</div>
              ) : (
                <textarea className={`${inputClass} h-24 py-2 font-mono`} value={lines[segment.key] ?? ''} onChange={(event) => setLines((current) => ({ ...current, [segment.key]: event.target.value }))} placeholder={'One value per line'} data-testid={`textarea-batch-${segment.key}`} />
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="self-start xl:sticky xl:top-[92px]">
        <div className="rounded-xl bg-card p-6 shadow-sm border border-border/30">
          <div className="font-display text-2xl font-medium text-foreground">Batch</div>
          <div className="my-6 font-display text-4xl tracking-tight text-foreground" data-testid="text-batch-count">{count.toLocaleString()}<span className="ml-2 text-base text-muted-foreground">{count === 1 ? 'name' : 'names'}</span></div>
          {overCap && <p className="mb-4 text-[12px] font-bold text-destructive" data-testid="text-batch-over-cap">Above the {BATCH_ROW_CAP.toLocaleString()} row limit. Narrow the choices.</p>}
          {errors.length > 0 && count === 0 && <ul className="mb-4 list-disc pl-5 text-[12px] font-semibold text-muted-foreground" data-testid="list-batch-errors">{errors.map((message) => <li key={message}>{message}</li>)}</ul>}
          <button type="button" className={`${buttonPrimary} w-full`} disabled={!canGenerate} onClick={generate} data-testid="button-batch-generate"><Play className="h-4 w-4" /> Generate</button>
          {generated !== null && downloadUrl && (
            <a className={`${buttonQuiet} mt-3 w-full`} href={downloadUrl} download={`${active.key || 'batch'}-${generated}-names.csv`} data-testid="link-batch-download"><Download className="h-4 w-4" /> Download CSV ({generated.toLocaleString()} rows)</a>
          )}
          {mapping && !baseUrl && <p className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground"><AlertCircle className="h-3.5 w-3.5" /> No base URL, so the tracking_url column will be empty.</p>}
        </div>
        {preview.length > 0 && (
          <div className="mt-4 overflow-x-auto rounded-xl bg-card p-4 shadow-sm border border-border/30">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Preview{generated !== null && generated > preview.length ? `, first ${preview.length} of ${generated.toLocaleString()}` : ''}</div>
            <table className="w-full text-left font-mono text-[12px]" data-testid="table-batch-preview"><thead><tr className="text-[10px] uppercase tracking-wider text-muted-foreground">{segments.map((segment) => <th key={segment.id} className="pb-1 pr-3">{segment.key}</th>)}<th className="pb-1 pr-3">name</th>{mapping && <th className="pb-1">tracking_url</th>}</tr></thead>
              <tbody>{preview.map((row, index) => <tr key={index} className="border-t border-border/40" data-testid={`row-batch-${index}`}>{segments.map((segment) => <td key={segment.id} className="py-1 pr-3">{row.selections[segment.key] ?? ''}</td>)}<td className="py-1 pr-3 text-primary">{row.name}</td>{mapping && <td className="max-w-[240px] truncate py-1 text-muted-foreground">{row.url}</td>}</tr>)}</tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
