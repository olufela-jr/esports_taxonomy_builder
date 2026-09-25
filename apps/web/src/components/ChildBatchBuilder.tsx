import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Download, Play, X } from 'lucide-react';
import { ancestorsOf, buildTrackingUrl, checkParents, countUnderParents, enumerateUnderParents, UTM_PARAMS, type BatchChoices, type ParentLine, type Rule, type Segment } from '@taxo/shared';
import type { RuleSet } from '@/data/store';
import { BATCH_ROW_CAP } from './BatchBuilder';
import { buttonPrimary, buttonQuiet, inputClass } from './styles';

// D34: a child Rule batch built across one or more parent names at once
// (docs/features/d34-child-batch.md, sections 5 to 7). The child's own
// choices are set once and applied under every parent; each parent can be
// narrowed to drop values that do not belong under it.

const PREVIEW_ROWS = 500;

type ChildBatchBuilderProps = {
  rule: Rule;        // as stored, for its id, parent link and mapping
  active: Rule;      // resolved
  parentRule: Rule;  // resolved parent
  ruleSet: RuleSet;
  baseUrl: string;
  carried: ParentLine[]; // from "Build children under these names" on a parent batch
};

type PreviewRow = { parentName: string; selections: Record<string, string>; name: string; url: string };

function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

// The ancestor Rules whose built names the child's mapping reads beyond the
// parent itself, nearest first: one paste column and one CSV column each.
function neededAncestors(rule: Rule, ruleSet: RuleSet): Rule[] {
  const named = new Set<string>();
  if (rule.utm) {
    for (const param of UTM_PARAMS) {
      const source = rule.utm[param];
      if (source && source.kind === 'ruleName' && source.ruleId !== rule.id && source.ruleId !== rule.parent?.ruleId) named.add(source.ruleId);
    }
  }
  return ancestorsOf(rule, ruleSet).filter((ancestor) => named.has(ancestor.id));
}

// One parent per line; a tab or comma separates the name from ancestor names,
// in the order of the batch CSV's columns. A header line and any further
// columns are ignored, so a batch CSV pastes back as it is.
function parseLines(text: string, ancestors: Rule[]): ParentLine[] {
  const lines: ParentLine[] = [];
  for (const raw of text.split('\n')) {
    const cells = raw.split(raw.includes('\t') ? '\t' : ',').map((cell) => cell.trim());
    const name = cells[0];
    if (!name || name === 'parent_name' || name === 'name') continue;
    const line: ParentLine = { name };
    if (ancestors.length > 0) {
      line.ancestors = {};
      ancestors.forEach((ancestor, index) => { if (cells[index + 1]) line.ancestors![ancestor.id] = cells[index + 1]; });
    }
    lines.push(line);
  }
  return lines;
}

function linesToText(lines: ParentLine[], ancestors: Rule[]): string {
  return lines.map((line) => [line.name, ...ancestors.map((ancestor) => line.ancestors?.[ancestor.id] ?? '')].join('\t').replace(/\t+$/, '')).join('\n');
}

export function ChildBatchBuilder({ rule, active, parentRule, ruleSet, baseUrl, carried }: ChildBatchBuilderProps) {
  const ancestors = neededAncestors(rule, ruleSet);
  const [text, setText] = useState(() => linesToText(carried, ancestors));
  const [picked, setPicked] = useState<Record<string, string[]>>({});
  const [lines, setLines] = useState<Record<string, string>>({});
  const [optional, setOptional] = useState<Record<string, 'include' | 'omit' | 'both'>>({});
  const [narrow, setNarrow] = useState<Record<string, BatchChoices>>({});
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [generated, setGenerated] = useState<number | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  useEffect(() => {
    setText(linesToText(carried, ancestors)); setPicked({}); setLines({}); setOptional({}); setNarrow({}); setOpen({}); setPreview([]); setGenerated(null);
    setDownloadUrl((current) => { if (current) URL.revokeObjectURL(current); return null; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rule.id, carried]);

  const parents = parseLines(text, ancestors);
  const checked = checkParents(parentRule, parents);
  const missingAncestor = (line: ParentLine) => ancestors.filter((ancestor) => !line.ancestors?.[ancestor.id]);
  const failing = checked.filter((entry) => !entry.result.valid || missingAncestor(parents.find((line) => line.name === entry.name) ?? { name: entry.name }).length > 0);
  const valid = checked.filter((entry) => !failing.includes(entry));
  const removeLine = (name: string) => setText(linesToText(parents.filter((line) => line.name !== name), ancestors));

  // Inherited segments: the child's segments the parent name supplies; their
  // value differs per parent, so the shared controls skip them.
  const inheritedKeys = new Set(parentRule.segments.map((segment) => segment.key).filter((key) => active.segments.some((segment) => segment.key === key)));
  const own = active.segments.filter((segment) => !inheritedKeys.has(segment.key));

  const choices: BatchChoices = {};
  for (const segment of own) {
    const mode = optional[segment.key] ?? 'include';
    const values = segment.kind === 'enum' ? picked[segment.key] ?? [] : [...new Set((lines[segment.key] ?? '').split('\n').map((line) => line.trim()).filter(Boolean))];
    if (segment.required) choices[segment.key] = values;
    else if (mode === 'omit') choices[segment.key] = [''];
    else choices[segment.key] = mode === 'both' ? [...values, ''] : values;
  }
  // Narrowing can only remove: keep each parent's subset inside the shared choices.
  const effectiveNarrow: Record<string, BatchChoices> = {};
  for (const [name, subsets] of Object.entries(narrow)) {
    effectiveNarrow[name] = {};
    for (const [key, subset] of Object.entries(subsets)) effectiveNarrow[name][key] = subset.filter((value) => (choices[key] ?? []).includes(value));
  }
  const input = { parents: valid.map((entry) => parents.find((line) => line.name === entry.name) ?? { name: entry.name }), choices, narrow: effectiveNarrow };

  let counts: { perParent: Record<string, number>; total: number } | null = null;
  let countError = '';
  if (failing.length === 0 && valid.length > 0) {
    try {
      counts = countUnderParents(active, parentRule, input);
    } catch (cause) {
      countError = cause instanceof Error ? cause.message : String(cause);
    }
  }
  const total = counts?.total ?? 0;
  const overCap = total > BATCH_ROW_CAP;
  const canGenerate = counts !== null && total > 0 && !overCap;
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
  const toggleNarrow = (name: string, key: string, value: string) => setNarrow((current) => {
    const subset = current[name]?.[key] ?? choices[key] ?? [];
    const next = subset.includes(value) ? subset.filter((item) => item !== value) : [...subset, value];
    return { ...current, [name]: { ...current[name], [key]: next } };
  });

  const generate = () => {
    if (!canGenerate) return;
    const header = ['parent_name', ...ancestors.map((ancestor) => ancestor.key), ...active.segments.map((segment) => segment.key), 'name', ...(mapping ? ['tracking_url'] : [])];
    const chunks: string[] = [`${header.join(',')}\n`];
    const rows: PreviewRow[] = [];
    let count = 0;
    for (const row of enumerateUnderParents(active, parentRule, input)) {
      const line = input.parents.find((item) => item.name === row.parentName);
      let url = '';
      if (mapping) {
        const names: Record<string, string> = { [rule.id]: row.name, [parentRule.id]: row.parentName, ...(line?.ancestors ?? {}) };
        url = buildTrackingUrl(active, ruleSet, { names, selections: row.selections, baseUrl }).url ?? '';
      }
      const cells = [row.parentName, ...ancestors.map((ancestor) => line?.ancestors?.[ancestor.id] ?? ''), ...active.segments.map((segment) => row.selections[segment.key] ?? ''), row.name, ...(mapping ? [url] : [])];
      chunks.push(`${cells.map(csvCell).join(',')}\n`);
      if (rows.length < PREVIEW_ROWS) rows.push({ parentName: row.parentName, selections: row.selections, name: row.name, url });
      count += 1;
    }
    const blob = new Blob(chunks, { type: 'text/csv;charset=utf-8' });
    setDownloadUrl((current) => { if (current) URL.revokeObjectURL(current); return URL.createObjectURL(blob); });
    setPreview(rows);
    setGenerated(count);
  };

  const grouped = preview.reduce<Array<{ parentName: string; rows: PreviewRow[] }>>((groups, row) => {
    const last = groups[groups.length - 1];
    if (last && last.parentName === row.parentName) last.rows.push(row); else groups.push({ parentName: row.parentName, rows: [row] });
    return groups;
  }, []);

  return (
    <div className="grid gap-6 xl:grid-cols-[1.2fr_.8fr]" data-testid="section-child-batch">
      <section className="flex flex-col gap-6">
        <div className="rounded-xl bg-card p-6 shadow-sm border border-border/30">
          <div className="font-display text-2xl font-medium text-foreground">Parents</div>
          <p className="mt-1 text-[13px] font-bold text-muted-foreground">One {parentRule.name.toLowerCase()} name per line{ancestors.length > 0 ? `, then ${ancestors.map((ancestor) => ancestor.name.toLowerCase()).join(', ')} separated by a tab` : ''}. Paste them, or carry them across from a {parentRule.name.toLowerCase()} batch.</p>
          <textarea className={`${inputClass} mt-3 h-28 py-2 font-mono`} value={text} onChange={(event) => setText(event.target.value)} placeholder={`perf_uk\nbrand_us`} data-testid="textarea-parent-lines" />
          {failing.length > 0 && (
            <ul className="mt-3 flex flex-col gap-2" data-testid="list-parent-failures">
              {failing.map((entry) => {
                const line = parents.find((item) => item.name === entry.name);
                const missing = line ? missingAncestor(line) : [];
                return <li key={entry.name} className="flex items-start justify-between gap-3 rounded-[4px] border border-destructive/30 bg-destructive/10 px-3 py-2 text-[12px]" data-testid={`row-parent-failure-${entry.name}`}><div><span className="font-mono font-bold text-foreground">{entry.name}</span><ul className="mt-1 list-disc pl-4 font-semibold text-destructive">{entry.result.violations.map((violation) => <li key={`${violation.segmentKey}-${violation.reason}`}>{violation.segmentKey === '__name__' ? violation.reason : `${violation.segmentKey}: ${violation.reason}`}</li>)}{missing.map((ancestor) => <li key={ancestor.id}>Missing the {ancestor.name.toLowerCase()} name column.</li>)}</ul></div><button type="button" className="rounded-md p-1 text-muted-foreground hover:text-destructive" onClick={() => removeLine(entry.name)} aria-label={`Remove ${entry.name}`} data-testid={`button-remove-parent-${entry.name}`}><X className="h-4 w-4" /></button></li>;
              })}
            </ul>
          )}
        </div>

        {parents.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-card/50 px-6 py-10 text-center text-sm font-semibold text-muted-foreground" data-testid="text-child-batch-empty">Paste {parentRule.name.toLowerCase()} names above, or carry them across from a {parentRule.name.toLowerCase()} batch, to start.</p>
        ) : (
          <div className="rounded-xl bg-card p-6 shadow-sm border border-border/30">
            <div className="font-display text-2xl font-medium text-foreground">{rule.name} values</div>
            <p className="mt-1 text-[13px] font-bold text-muted-foreground">Shared by every parent. Inherited segments take their value from each parent name.</p>
            <div className="mt-5 space-y-6">
              {active.segments.filter((segment) => inheritedKeys.has(segment.key)).map((segment) => <div key={segment.id} className="rounded-[4px] bg-muted/40 px-3 py-2 text-[13px]" data-testid={`text-child-batch-inherited-${segment.key}`}><span className="font-bold text-foreground">{segment.label}</span> <span className="ml-2 text-[11px] font-bold text-muted-foreground">from each {parentRule.name.toLowerCase()} name</span></div>)}
              {own.map((segment) => (
                <div key={segment.id} data-testid={`batch-segment-${segment.key}`}>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <span className="text-[13px] font-bold text-foreground">{segment.label}<span className="ml-2 font-mono text-[10px] font-normal text-muted-foreground">{segment.key}</span></span>
                    <div className="flex items-center gap-2">
                      {!segment.required && <select className={`${inputClass} h-8 w-auto`} value={optional[segment.key] ?? 'include'} onChange={(event) => setOptional((current) => ({ ...current, [segment.key]: event.target.value as 'include' | 'omit' | 'both' }))} aria-label={`${segment.label}: include, omit or both`} data-testid={`select-batch-optional-${segment.key}`}><option value="include">Include</option><option value="omit">Omit</option><option value="both">Both</option></select>}
                      {segment.kind === 'enum' && (optional[segment.key] ?? 'include') !== 'omit' && <button type="button" className="text-[12px] font-bold text-primary underline-offset-2 hover:underline" onClick={() => selectAll(segment)} data-testid={`button-batch-select-all-${segment.key}`}>{(picked[segment.key] ?? []).length === segment.allowedValues.length ? 'Clear' : 'Select all'}</button>}
                    </div>
                  </div>
                  {(optional[segment.key] ?? 'include') === 'omit' ? <p className="text-[12px] font-bold text-muted-foreground">Left out of every name.</p> : segment.kind === 'enum' ? (
                    <div className="flex flex-wrap gap-x-4 gap-y-2">{segment.allowedValues.map((entry) => <label key={entry.code} className="inline-flex items-center gap-2 text-[13px] font-semibold text-foreground"><input type="checkbox" checked={(picked[segment.key] ?? []).includes(entry.code)} onChange={() => togglePick(segment.key, entry.code)} className="h-4 w-4 rounded-sm border-gray-300 text-primary focus:ring-primary" data-testid={`checkbox-batch-${segment.key}-${entry.code}`} /> {entry.label === entry.code ? entry.label : `${entry.label} (${entry.code})`}</label>)}</div>
                  ) : (
                    <textarea className={`${inputClass} h-24 py-2 font-mono`} value={lines[segment.key] ?? ''} onChange={(event) => setLines((current) => ({ ...current, [segment.key]: event.target.value }))} placeholder="One value per line" data-testid={`textarea-batch-${segment.key}`} />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {valid.length > 0 && (
          <div className="rounded-xl bg-card p-6 shadow-sm border border-border/30">
            <div className="font-display text-2xl font-medium text-foreground">Per parent</div>
            <p className="mt-1 text-[13px] font-bold text-muted-foreground">Expand a parent to untick values that do not belong under it. Narrowing only removes.</p>
            <ul className="mt-4 divide-y divide-border/40">
              {valid.map((entry) => {
                const name = entry.name;
                const isOpen = open[name] ?? false;
                const count = counts?.perParent[name];
                return (
                  <li key={name} className="py-3" data-testid={`row-parent-${name}`}>
                    <div className="flex items-center justify-between gap-3">
                      <button type="button" className="inline-flex items-center gap-2 font-mono text-[13px] font-bold text-foreground" onClick={() => setOpen((current) => ({ ...current, [name]: !isOpen }))} aria-expanded={isOpen} data-testid={`button-narrow-${name}`}>{isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}{name}</button>
                      <span className={`text-[12px] font-bold ${count === 0 ? 'text-destructive' : 'text-muted-foreground'}`} data-testid={`text-parent-count-${name}`}>{count === undefined ? '' : `${count.toLocaleString()} ${count === 1 ? 'row' : 'rows'}`}{count === 0 ? ', narrowed to nothing' : ''}</span>
                    </div>
                    {isOpen && (
                      <div className="mt-3 flex flex-col gap-3 pl-6">
                        {own.filter((segment) => (choices[segment.key] ?? []).some((value) => value !== '')).map((segment) => (
                          <div key={segment.id}><div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{segment.label}</div><div className="flex flex-wrap gap-x-4 gap-y-1">{(choices[segment.key] ?? []).filter((value) => value !== '').map((value) => <label key={value} className="inline-flex items-center gap-2 font-mono text-[12px] text-foreground"><input type="checkbox" checked={(effectiveNarrow[name]?.[segment.key] ?? choices[segment.key] ?? []).includes(value)} onChange={() => toggleNarrow(name, segment.key, value)} className="h-3.5 w-3.5 rounded-sm border-gray-300 text-primary focus:ring-primary" data-testid={`checkbox-narrow-${name}-${segment.key}-${value}`} /> {value}</label>)}</div></div>
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>

      <section className="self-start xl:sticky xl:top-[92px]">
        <div className="rounded-xl bg-card p-6 shadow-sm border border-border/30">
          <div className="font-display text-2xl font-medium text-foreground">Batch across {valid.length} {valid.length === 1 ? 'parent' : 'parents'}</div>
          <div className="my-6 font-display text-4xl tracking-tight text-foreground" data-testid="text-child-batch-total">{total.toLocaleString()}<span className="ml-2 text-base text-muted-foreground">{total === 1 ? 'name' : 'names'}</span></div>
          {failing.length > 0 && <p className="mb-4 text-[12px] font-bold text-destructive" data-testid="text-child-batch-blocked">Fix or remove the failing parent {failing.length === 1 ? 'line' : 'lines'} first.</p>}
          {overCap && <p className="mb-4 text-[12px] font-bold text-destructive" data-testid="text-child-batch-over-cap">Above the {BATCH_ROW_CAP.toLocaleString()} row limit. Narrow the choices.</p>}
          {countError && <p className="mb-4 text-[12px] font-semibold text-muted-foreground" data-testid="text-child-batch-error">{countError}</p>}
          <button type="button" className={`${buttonPrimary} w-full`} disabled={!canGenerate} onClick={generate} data-testid="button-child-batch-generate"><Play className="h-4 w-4" /> Generate</button>
          {generated !== null && downloadUrl && <a className={`${buttonQuiet} mt-3 w-full`} href={downloadUrl} download={`${active.key || 'batch'}-${generated}-names.csv`} data-testid="link-child-batch-download"><Download className="h-4 w-4" /> Download CSV ({generated.toLocaleString()} rows)</a>}
        </div>
        {grouped.length > 0 && (
          <div className="mt-4 overflow-x-auto rounded-xl bg-card p-4 shadow-sm border border-border/30" data-testid="table-child-batch-preview">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Preview{generated !== null && generated > preview.length ? `, first ${preview.length} of ${generated.toLocaleString()}` : ''}</div>
            {grouped.map((group) => (
              <div key={group.parentName} className="mb-3" data-testid={`preview-group-${group.parentName}`}>
                <div className="mb-1 font-mono text-[12px] font-bold text-foreground">{group.parentName}</div>
                <table className="w-full text-left font-mono text-[12px]"><tbody>{group.rows.map((row, index) => <tr key={index} className="border-t border-border/40"><td className="py-1 pr-3 text-primary">{row.name}</td>{mapping && <td className="max-w-[240px] truncate py-1 text-muted-foreground">{row.url}</td>}</tr>)}</tbody></table>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
