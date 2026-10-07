import type { ReactNode } from 'react';
import { ArrowDown, ArrowUp, Lock, Trash2 } from 'lucide-react';
import { entriesFromCodes, type Definition, type EnumSegment, type Rule, type Segment } from '@taxo/shared';
import { Link } from 'wouter';
import type { SegmentMeta } from '@/lib/segment-meta';
import { GlobalBadge } from '../GlobalBadge';
import { buttonDanger, iconButton, inputClass } from '../styles';
import { entriesFromCodeList, isDefaultLabel, slugify } from './draft';
import { CommaListInput } from './RuleFields';

const labelClass = 'block text-[13px] font-bold text-foreground';

type SegmentCardProps = {
  segment: Segment;          // as resolved: an inherited segment is the parent's
  meta: SegmentMeta | undefined;
  position: number;          // 1-based place in the whole name
  total: number;
  rule: Rule;                // the Rule being edited
  ruleIndex: number;
  ownIndex: number;          // place among the Rule's own segments; -1 when inherited
  owner: Rule | undefined;   // the Rule an inherited segment belongs to
  base: string;              // the Rule Set's URL
  definitions: Definition[];
  findLocalList: (codes: string[]) => EnumSegment | undefined; // another segment's Local list with these codes
  inheritedBy: string[];     // Rules that inherit this segment; it cannot be removed
  selected: boolean;         // highlighted here and on its chip
  leaving: boolean;          // on its way out, after Remove
  onSelect: () => void;
  onChange: (updates: Partial<Segment>) => void;
  onMove: (toIndex: number) => void;
  onRemove: () => void;
};

// One segment of the Rule, in the list under the chips. Clicking or typing in
// it selects it, which lights its chip. An inherited segment is shown read
// only with a way to its own Rule; a Global one shows its definition's values
// and links to Definitions rather than editing them here.
export function SegmentCard(props: SegmentCardProps) {
  const { segment, meta, position, total, rule, ruleIndex, ownIndex, owner, base, definitions, inheritedBy, onChange, onMove, onRemove } = props;
  const frame = (body: ReactNode) => (
    <section
      id={`segment-${segment.id}`}
      className={`rounded-xl border bg-card p-5 shadow-sm transition ${props.selected ? 'border-primary ring-2 ring-primary/40' : 'border-border/30 hover:border-primary/40'} ${props.leaving ? 'chip-leave' : ''}`}
      onClick={props.onSelect}
      onFocusCapture={props.onSelect}
      data-selected={props.selected ? 'true' : undefined}
      data-testid={`segment-${segment.key}`}
    >
      <div className="mb-4 flex items-center gap-3">
        <span className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 font-mono text-[11px] font-bold ${props.selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'}`}>{position}</span>
        <h3 className="min-w-0 flex-1 truncate font-display text-lg font-medium text-foreground">{segment.label || 'Untitled segment'}</h3>
        <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{position} of {total}</span>
        {meta?.scope === 'global' && <GlobalBadge small testId={`badge-segment-scope-${segment.key}`} />}
      </div>
      {body}
    </section>
  );

  if (ownIndex < 0) {
    return frame(<>
      <p className="flex items-start gap-2 rounded-[4px] border border-border bg-muted/40 px-3 py-2 text-[12px] font-semibold text-muted-foreground" data-testid="text-segment-inherited"><Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Inherited from {owner?.name ?? 'the parent Rule'}. Change it there and every Rule that inherits it follows.</p>
      <SegmentSummary segment={segment} />
      {owner && <Link href={`${base}/${owner.id}/segments/${segment.id}`} className="mt-4 inline-flex text-[13px] font-bold text-primary underline-offset-2 hover:underline" data-testid="link-segment-owner">Edit on {owner.name}</Link>}
    </>);
  }

  const definitionId = segment.kind === 'enum' ? segment.definitionId : undefined;
  const platform = rule.tags?.platform;
  const offered = definitions.filter((definition) => definition.platforms.length === 0 || (platform !== undefined && definition.platforms.includes(platform)) || definition.id === definitionId);
  const chosen = definitions.find((definition) => definition.id === definitionId);
  const ids = `${ruleIndex}-${ownIndex}`;
  // Name the segment after the list it now uses, unless someone renamed it.
  const following = isDefaultLabel(segment.label, [chosen?.name, segment.kind === 'enum' && !definitionId ? props.findLocalList(segment.allowedValues.map((entry) => entry.code))?.label : undefined]);
  const named = (name: string) => (following ? { label: name, key: slugify(name) || `segment_${ownIndex + 1}` } : {});
  const ownCount = rule.segments.length;

  return frame(
      <div className="grid grid-cols-2 gap-x-5 gap-y-4" data-testid={`card-segment-${ids}`}>
        <label className={labelClass}>Label:<input className={`${inputClass} mt-2`} value={segment.label} onChange={(event) => onChange({ label: event.target.value, key: slugify(event.target.value) || `segment_${ownIndex + 1}` })} data-testid={`input-segment-label-${ids}`} /></label>
        <label className={labelClass}>Key: <span className="ml-1 font-normal text-muted-foreground">(machine name)</span><input className={`${inputClass} mt-2 font-mono`} value={segment.key} onChange={(event) => onChange({ key: event.target.value.toLowerCase().replaceAll(' ', '_') })} data-testid={`input-segment-key-${ids}`} /></label>
        <label className={labelClass}>Type:<select className={`${inputClass} mt-2`} value={segment.kind} onChange={(event) => onChange(event.target.value === 'enum' ? { kind: 'enum', allowedValues: segment.kind === 'enum' ? segment.allowedValues : entriesFromCodes(['value']) } : { kind: 'freeform', maxLength: segment.kind === 'freeform' ? segment.maxLength : 32, illegalChars: segment.kind === 'freeform' ? segment.illegalChars : [' ', '/', '?', '#', '&'] })} data-testid={`select-segment-kind-${ids}`}><option value="enum">Allowed values</option><option value="freeform">Freeform</option></select></label>

        {segment.kind === 'enum' ? (
          <>
            <label className={labelClass}>Values from:<select className={`${inputClass} mt-2`} value={definitionId ?? ''} onChange={(event) => onChange(event.target.value ? { definitionId: event.target.value, allowedValues: [], ...named(definitions.find((definition) => definition.id === event.target.value)?.name ?? '') } : { definitionId: undefined, allowedValues: segment.allowedValues.length > 0 ? segment.allowedValues : entriesFromCodes(['value']) })} data-testid={`select-segment-source-${ids}`}><option value="">Local list (this Rule only)</option>{offered.map((definition) => <option key={definition.id} value={definition.id}>Global: {definition.name}{definition.platforms.length > 0 ? ` (${definition.platforms.join(', ')})` : ''}</option>)}</select></label>
            {definitionId ? (
              <div className="rounded-[4px] border border-border bg-muted/30 p-3 text-[12px]" data-testid={`text-segment-definition-${ids}`}>
                {chosen ? <>
                  <div className="mb-2 flex items-center justify-between gap-2"><span className="font-bold text-foreground">{chosen.name}</span><GlobalBadge small /></div>
                  <div className="text-muted-foreground">{chosen.entries.length === 0 ? 'No values yet.' : chosen.entries.map((entry) => `${entry.label} (${entry.code})`).join(', ')}</div>
                  <Link href={`/definitions/${chosen.id}`} className="mt-3 inline-flex font-bold text-primary underline-offset-2 hover:underline" data-testid="link-segment-definition">Open in Definitions</Link>
                  <p className="mt-1 text-[11px] text-muted-foreground">Global values are edited in Definitions, for every Rule that uses them.</p>
                </> : <span className="font-semibold text-destructive">This definition no longer exists.</span>}
              </div>
            ) : (
              <label className={labelClass}>Local values: <span className="ml-1 font-normal text-muted-foreground">(comma separated, matched exactly)</span><CommaListInput className={`${inputClass} mt-2 font-mono`} value={segment.allowedValues.map((entry) => entry.code)} onChange={(codes) => { const match = props.findLocalList(codes); onChange({ allowedValues: entriesFromCodeList(codes, segment.allowedValues), ...(match ? named(match.label) : {}) }); }} placeholder="na, emea, apac" testId={`input-segment-values-${ids}`} /></label>
            )}
          </>
        ) : (
          <>
            <label className={labelClass}>Max characters:<input type="number" min="1" max="200" className={`${inputClass} mt-2`} value={segment.maxLength || ''} onChange={(event) => onChange({ maxLength: event.target.value === '' ? 0 : Number(event.target.value) })} data-testid={`input-segment-max-length-${ids}`} /></label>
            <label className={labelClass}>Illegal characters: <span className="ml-1 font-normal text-muted-foreground">(the delimiter is always illegal)</span><input className={`${inputClass} mt-2 font-mono`} value={segment.illegalChars.join('')} onChange={(event) => onChange({ illegalChars: Array.from(new Set([...event.target.value])) })} data-testid={`input-segment-illegal-chars-${ids}`} /></label>
          </>
        )}

        <label className="col-span-2 flex items-center gap-2 text-[13px] font-bold text-foreground"><input type="checkbox" checked={segment.required} onChange={(event) => onChange({ required: event.target.checked })} className="h-4 w-4 rounded-sm border-gray-300 text-primary focus:ring-primary" data-testid={`checkbox-segment-required-${ids}`} /> Required <span className="font-normal text-muted-foreground">(optional segments may only come last)</span></label>

        <div className="col-span-2 flex items-center justify-between gap-3 border-t border-border pt-4">
          <div className="flex items-center gap-1">
            <button type="button" className={iconButton} onClick={() => onMove(ownIndex - 1)} disabled={ownIndex === 0} aria-label="Move segment earlier" title="Move earlier" data-testid={`button-move-segment-up-${ids}`}><ArrowUp className="h-4 w-4" /></button>
            <button type="button" className={iconButton} onClick={() => onMove(ownIndex + 1)} disabled={ownIndex === ownCount - 1} aria-label="Move segment later" title="Move later" data-testid={`button-move-segment-down-${ids}`}><ArrowDown className="h-4 w-4" /></button>
          </div>
          <button type="button" className={buttonDanger} onClick={onRemove} disabled={inheritedBy.length > 0} title={inheritedBy.length > 0 ? `Inherited by ${inheritedBy.join(', ')}` : undefined} data-testid={`button-remove-segment-${ids}`}><Trash2 className="h-4 w-4" /> Remove</button>
        </div>
        {inheritedBy.length > 0 && <p className="col-span-2 text-[11px] font-bold text-muted-foreground" data-testid={`text-segment-inherited-by-${ids}`}>Inherited by {inheritedBy.join(', ')}, so it cannot be removed.</p>}
      </div>
  );
}

function SegmentSummary({ segment }: { segment: Segment }) {
  return (
    <dl className="mt-4 grid grid-cols-[110px_1fr] gap-x-3 gap-y-2 text-[13px]">
      <dt className="font-bold text-muted-foreground">Key</dt><dd className="font-mono text-foreground">{segment.key}</dd>
      <dt className="font-bold text-muted-foreground">Type</dt><dd className="text-foreground">{segment.kind === 'enum' ? 'Allowed values' : 'Freeform'}</dd>
      {segment.kind === 'enum'
        ? <><dt className="font-bold text-muted-foreground">Values</dt><dd className="font-mono text-foreground">{segment.allowedValues.map((entry) => entry.code).join(', ') || 'None'}</dd></>
        : <><dt className="font-bold text-muted-foreground">Max characters</dt><dd className="text-foreground">{segment.maxLength}</dd></>}
      <dt className="font-bold text-muted-foreground">Required</dt><dd className="text-foreground">{segment.required ? 'Yes' : 'No'}</dd>
    </dl>
  );
}
