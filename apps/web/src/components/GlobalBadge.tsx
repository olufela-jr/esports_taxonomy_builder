// Marks a tenant-wide definition, applied everywhere it is used. A list with
// no badge is local: kept on one Rule's segment. The same badge on chips, on a
// Rule's segments and on the Definitions page.
export function GlobalBadge({ small = false, testId }: { small?: boolean; testId?: string }) {
  const size = small ? 'px-1 py-px text-[8px]' : 'px-1.5 py-0.5 text-[10px]';
  return <span className={`inline-flex shrink-0 items-center rounded-[3px] border border-primary/40 bg-primary/15 font-mono font-semibold uppercase tracking-wider text-primary ${size}`} data-testid={testId}>Global</span>;
}
