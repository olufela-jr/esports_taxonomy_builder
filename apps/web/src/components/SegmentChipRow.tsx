import { Fragment, useRef, useState, type DragEvent } from 'react';
import { Lock, Plus } from 'lucide-react';
import { compose, type Rule, type Segment } from '@taxo/shared';
import { exampleSelections } from '@/lib/examples';
import type { SegmentMeta } from '@/lib/segment-meta';
import { useFlip } from '@/lib/use-flip';
import { ScopeBadge } from './ScopeBadge';

// labels: segment labels, the shape of the name. example: sample values in
// place of the labels. values: the caller's selections, as Build has them.
export type ChipMode = 'labels' | 'example' | 'values';

type SegmentChipRowProps = {
  rule: Rule; // RESOLVED: inherited segments first, definitions filled in
  meta?: Record<string, SegmentMeta>;
  mode: ChipMode;
  selections?: Record<string, string>; // values mode
  // values mode: segments with no value yet show a sample value, greyed, so
  // the row reads as a whole example name before anything is filled.
  fillExamples?: boolean;
  seed?: number; // example mode: 0 is each enum's first code
  selectedSegmentId?: string | null;
  leavingSegmentId?: string | null; // a segment on its way out, for the exit animation
  onSelect?: (segmentId: string) => void;
  onAdd?: () => void;
  // Drag to reorder the Rule's own segments; toIndex is a position among them.
  onReorder?: (segmentId: string, toIndex: number) => void;
  showName?: boolean; // the composed name and compose's errors under the chips
  badges?: boolean; // the Global/Local badges; off where scope does not matter
  compact?: boolean;
  testId?: string;
};

// The one preview of a name, everywhere a single name is shown. Every value
// on a chip comes out of compose: the chips split its name on the delimiter,
// which no value can contain, and compose skips exactly the segments with no
// value, so the tokens line up with the filled segments in order.
export function SegmentChipRow({ rule, meta = {}, mode, selections, fillExamples = false, seed = 0, selectedSegmentId, leavingSegmentId, onSelect, onAdd, onReorder, showName = false, badges = true, compact = false, testId = 'chip-row' }: SegmentChipRowProps) {
  const container = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const segments = rule.segments;
  useFlip(container, segments.map((segment) => segment.id).join('|'));

  const own: Record<string, string> = {};
  for (const [key, value] of Object.entries(selections ?? {})) if (value) own[key] = value;
  const chosen = mode === 'example' ? exampleSelections(rule, seed) : mode === 'values' ? (fillExamples ? { ...exampleSelections(rule, seed), ...own } : own) : null;
  // The segments showing a sample rather than a chosen value.
  const sampled = new Set(mode === 'example' ? segments.map((segment) => segment.key) : fillExamples ? segments.filter((segment) => !own[segment.key]).map((segment) => segment.key) : []);
  const result = chosen ? compose(rule, chosen) : null;
  const values: Record<string, string> = {};
  if (chosen && result && result.name && rule.delimiter) {
    const filled = segments.filter((segment) => chosen[segment.key]);
    const tokens = result.name.split(rule.delimiter);
    if (tokens.length === filled.length) filled.forEach((segment, index) => { values[segment.id] = tokens[index]; });
  }

  const ownIds = segments.filter((segment) => !meta[segment.id]?.inherited).map((segment) => segment.id);
  const onDrop = (event: DragEvent, target: Segment) => {
    event.preventDefault();
    if (!dragging || !onReorder || dragging === target.id) return;
    const toIndex = ownIds.indexOf(target.id);
    if (toIndex >= 0) onReorder(dragging, toIndex);
    setDragging(null);
  };

  const chipHeight = compact ? 'h-7 px-2 text-[11px]' : 'h-9 px-3 text-[13px]';
  return (
    <div data-testid={testId}>
      <div ref={container} className="flex flex-wrap items-center gap-1.5" role="list" aria-label="Segments">
        {segments.length === 0 && !onAdd && <span className="text-[12px] font-semibold text-muted-foreground">No segments yet.</span>}
        {segments.map((segment, index) => {
          const info = meta[segment.id];
          const inherited = info?.inherited ?? false;
          const value = values[segment.id];
          const text = mode === 'labels' ? segment.label : value ?? segment.label;
          const placeholder = mode !== 'labels' && value === undefined;
          const sample = mode === 'values' && fillExamples && !placeholder && sampled.has(segment.key);
          const selected = selectedSegmentId === segment.id;
          const draggable = Boolean(onReorder) && !inherited;
          const tone = inherited
            ? 'border-dashed border-border bg-muted/40 text-muted-foreground'
            : placeholder || sample
              ? 'border-dashed border-border bg-card text-muted-foreground'
              : fillExamples
                ? 'border-primary/60 bg-primary/10 text-foreground'
                : 'border-border bg-card text-foreground';
          const chip = (
            <>
              {inherited && <Lock className="h-3 w-3 shrink-0" aria-label="Inherited" />}
              <span className={`truncate ${mode === 'labels' ? 'font-bold' : 'font-mono'} ${placeholder || sample ? 'italic' : ''}`}>{text}</span>
              {!segment.required && <span className="text-[10px] font-semibold text-muted-foreground" title="Optional">opt</span>}
              {info?.scope && badges && !compact && <ScopeBadge scope={info.scope} small testId={`${testId}-scope-${segment.key}`} />}
            </>
          );
          const className = `chip-enter inline-flex max-w-[260px] items-center gap-1.5 rounded-[4px] border ${chipHeight} transition-colors ${tone} ${selected ? 'ring-2 ring-primary ring-offset-1 ring-offset-background' : ''} ${leavingSegmentId === segment.id ? 'chip-leave' : ''} ${dragging === segment.id ? 'opacity-40' : ''} ${onSelect ? 'cursor-pointer hover:border-primary/60' : ''}`;
          return (
            <Fragment key={segment.id}>
              {index > 0 && <span className="inline-flex h-7 min-w-6 items-center justify-center rounded-[3px] bg-primary/10 px-1.5 font-mono text-[13px] font-bold text-primary" aria-label={`delimiter ${rule.delimiter}`} data-testid={`${testId}-delimiter`}>{rule.delimiter}</span>}
              <div
                role="listitem"
                data-flip-id={segment.id}
                draggable={draggable}
                onDragStart={draggable ? () => setDragging(segment.id) : undefined}
                onDragEnd={draggable ? () => setDragging(null) : undefined}
                onDragOver={onReorder && !inherited ? (event) => event.preventDefault() : undefined}
                onDrop={onReorder && !inherited ? (event) => onDrop(event, segment) : undefined}
              >
                {onSelect
                  ? <button type="button" className={className} onClick={() => onSelect(segment.id)} aria-pressed={selected} title={inherited ? 'Inherited from the parent Rule' : undefined} data-testid={`${testId}-seg-${segment.key}`} data-inherited={inherited || undefined} data-selected={selected || undefined}>{chip}</button>
                  : <span className={className} title={inherited ? 'Inherited from the parent Rule' : undefined} data-testid={`${testId}-seg-${segment.key}`} data-inherited={inherited || undefined} data-sample={sample || undefined}>{chip}</span>}
              </div>
            </Fragment>
          );
        })}
        {onAdd && <button type="button" className={`inline-flex items-center gap-1 rounded-[4px] border border-dashed border-primary/50 ${chipHeight} font-bold text-primary transition hover:bg-primary/10`} onClick={onAdd} data-testid="button-add-segment-chip"><Plus className="h-3.5 w-3.5" /> Add segment</button>}
      </div>
      {showName && result && (
        <div className="mt-3">
          <div className="break-all font-mono text-[13px] text-primary" data-testid={`${testId}-name`}>{result.name || 'No name yet'}</div>
          {result.errors.length > 0 && <ul className="mt-1 list-disc pl-5 text-[11px] font-semibold text-destructive" data-testid={`${testId}-errors`}>{result.errors.map((message) => <li key={message}>{message}</li>)}</ul>}
        </div>
      )}
    </div>
  );
}
