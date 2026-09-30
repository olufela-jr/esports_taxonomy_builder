// Presentational pieces shared by Check and the compliance board. Nothing here
// counts anything: the numbers arrive from the engine, these only format them.
import { UNTAGGED, type Counts } from '@taxo/shared';
import { AlertTriangle } from 'lucide-react';
import {
  cardClass,
  emptyStateClass,
  tableBody,
  tableCard,
  tableClass,
  tableHead,
  tableHeadCell,
  tableWrap,
} from './styles';

// Rounding happens here, in the UI. The engine only returns raw counts.
export function percent(counts: Counts): number {
  return counts.scanned > 0 ? Math.round((counts.valid / counts.scanned) * 100) : 0;
}

export function ModeButton({ active, onClick, testId, children }: { active: boolean; onClick: () => void; testId: string; children: React.ReactNode }) {
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

export function StatusPill({ invalidCount }: { invalidCount: number }) {
  return invalidCount
    ? <div className="inline-flex items-center gap-1.5 rounded-full border border-destructive/50 bg-destructive/10 px-2 py-0.5"><span className="h-2 w-2 rounded-full bg-destructive" /><span className="text-[10px] font-bold text-foreground">Action needed</span></div>
    : <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5"><span className="h-2 w-2 rounded-full bg-primary" /><span className="text-[10px] font-bold text-foreground">All clear</span></div>;
}

export function CountCard({ label, caption, counts, missingColumn, testId }: { label: string; caption?: string; counts: Counts; missingColumn?: string; testId?: string }) {
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

export function TagBreakdown({ title, groups, testId }: { title: string; groups: Record<string, Counts>; testId: string }) {
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

export function EmptyState({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className={emptyStateClass}>
      <div className="flex h-14 w-14 items-center justify-center rounded bg-muted text-muted-foreground">{icon}</div>
      <h2 className="mt-5 text-sm font-semibold text-foreground">{title}</h2>
      <p className="mt-1.5 max-w-xs text-xs leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}

// A titled card with a horizontally scrolling table inside, the shape every
// results table on both screens uses.
export function ResultsTable({ title, subtitle, action, columns, testId, children }: {
  title: string;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  columns: string[];
  testId?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={tableCard} data-testid={testId}>
      <div className="flex items-center justify-between gap-4 border-b border-border/50 px-6 py-5">
        <div>
          <h2 className="font-display text-xl font-medium text-foreground">{title}</h2>
          {subtitle && <p className="mt-1 text-[11px] font-bold text-muted-foreground">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className={tableWrap}>
        <table className={tableClass}>
          <thead className={tableHead}>
            <tr>{columns.map((column) => <th key={column} className={tableHeadCell}>{column}</th>)}</tr>
          </thead>
          <tbody className={tableBody}>{children}</tbody>
        </table>
      </div>
    </div>
  );
}

export { cardClass };
