import { Fragment, useRef, useState, type DragEvent } from 'react';
import { Lock, Plus } from 'lucide-react';
import { compose, type Rule, type Segment } from '@taxo/shared';
import { exampleSelections } from '@/lib/examples';
import type { SegmentMeta } from '@/lib/segment-meta';
import { useFlip } from '@/lib/use-flip';
import { GlobalBadge } from './GlobalBadge';

// labels: segment labels, the shape of the name. example: sample values in
// place of the labels.
export type ChipMode = 'labels' | 'example';

type SegmentChipRowProps = {
  rule: Rule; // RESOLVED: inherited segments first, definitions filled in
  meta?: Record<string, SegmentMeta>;
  mode: ChipMode;
  // labels mode: a name to show in place of a segment's label, by segment id.
  // Build names a Global definition's segment after the definition.
  names?: Record<string, string>;
  seed?: number; // example mode: 0 is each enum's first code
  selectedSegmentId?: string | null;
  leavingSegmentId?: string | null; // a segment on its way out, for the exit animation
  onSelect?: (segmentId: string) => void;
  onAdd?: () => void;
  // Drag to reorder the Rule's own segments; toIndex is a position among them.
  onReorder?: (segmentId: string, toIndex: number) => void;
  showName?: boolean; // the composed name and compose's errors under the chips
  badges?: boolean; // the Global/Local badges; off where scope does not matter
  numbered?: boolean; // each chip's position in the name, from 1
  compact?: boolean;
  testId?: string;
};

// The one preview of a name, everywhere a single name is shown. Every value
// on a chip comes out of compose: the chips split its name on the delimiter,
// which no value can contain, and compose skips exactly the segments with no
// value, so the tokens line up with the filled segments in order.
export function SegmentChipRow({ rule, meta = {}, mode, names = {}, seed = 0, selectedSegmentId, leavingSegmentId, onSelect, onAdd, onReorder, showName = false, badges = true, numbered = false, compact = false, testId = 'chip-row' }: SegmentChipRowProps) {
  const container = useRef<HTMLDivElement>(null);
  // The chip being dragged: state for its faded look, a ref for the drop, which
  // can arrive before React has re-rendered with the state.
  const [dragging, setDragging] = useState<string | null>(null);
  const draggedId = useRef<string | null>(null);
  const startDrag = (id: string | null) => {
    draggedId.current = id;
    setDragging(id);
  };
  const segments = rule.segments;
  useFlip(container, segments.map((segment) => segment.id).join('|'));

  const chosen = mode === 'example' ? exampleSelections(rule, seed) : null;
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
    const moving = draggedId.current;
    if (!moving || !onReorder || moving === target.id) return;
    const toIndex = ownIds.indexOf(target.id);
    if (toIndex >= 0) onReorder(moving, toIndex);
    startDrag(null);
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
          const text = mode === 'labels' ? names[segment.id] ?? segment.label : value ?? segment.label;
          const placeholder = mode !== 'labels' && value === undefined;
          const selected = selectedSegmentId === segment.id;
          const draggable = Boolean(onReorder) && !inherited;
          const tone = inherited
            ? 'border-dashed border-border bg-muted/40 text-muted-foreground'
            : placeholder
              ? 'border-dashed border-border bg-card text-muted-foreground'
              : 'border-border bg-card text-foreground';
          const chip = (
            <>
              {numbered && <span className="font-mono text-[10px] font-semibold text-primary" data-testid={`${testId}-index-${segment.key}`}>{index + 1}</span>}
              {inherited && <Lock className="h-3 w-3 shrink-0" aria-label="Inherited" />}
              <span className={`truncate ${mode === 'labels' ? 'font-bold' : 'font-mono'} ${placeholder ? 'italic' : ''}`}>{text}</span>
              {!segment.required && <span className="text-[10px] font-semibold text-muted-foreground" title="Optional">opt</span>}
              {info?.scope === 'global' && badges && !compact && <GlobalBadge small testId={`${testId}-scope-${segment.key}`} />}
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
                onDragStart={draggable ? () => startDrag(segment.id) : undefined}
                onDragEnd={draggable ? () => startDrag(null) : undefined}
                onDragOver={onReorder && !inherited ? (event) => event.preventDefault() : undefined}
                onDrop={onReorder && !inherited ? (event) => onDrop(event, segment) : undefined}
              >
                {onSelect
                  ? <button type="button" className={className} onClick={() => onSelect(segment.id)} aria-pressed={selected} title={inherited ? 'Inherited from the parent Rule' : undefined} data-testid={`${testId}-seg-${segment.key}`} data-inherited={inherited || undefined} data-selected={selected || undefined}>{chip}</button>
                  : <span className={className} title={inherited ? 'Inherited from the parent Rule' : undefined} data-testid={`${testId}-seg-${segment.key}`} data-inherited={inherited || undefined}>{chip}</span>}
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
