import type { SegmentScope } from '@/lib/segment-meta';

// Global: a tenant-wide definition. Local: a list kept on one Rule's segment.
// The same badge on chips, in the segment drawer and on the Definitions page.
export function ScopeBadge({ scope, small = false, testId }: { scope: Exclude<SegmentScope, null>; small?: boolean; testId?: string }) {
  const tone = scope === 'global' ? 'border-primary/40 bg-primary/15 text-primary' : 'border-border bg-muted text-muted-foreground';
  const size = small ? 'px-1 py-px text-[8px]' : 'px-1.5 py-0.5 text-[10px]';
  return <span className={`inline-flex shrink-0 items-center rounded-[3px] border font-mono font-semibold uppercase tracking-wider ${tone} ${size}`} data-testid={testId}>{scope === 'global' ? 'Global' : 'Local'}</span>;
}
