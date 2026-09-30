// Shared Tailwind class strings for form controls and buttons. One place to
// restyle the console later.
export const inputClass = 'h-9 w-full rounded-[4px] border-0 bg-[#EAE8E3] px-3 text-[13px] font-semibold text-gray-900 shadow-inner outline-none transition-all placeholder:text-gray-500 focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50 hover:bg-[#F2F0EB]';
export const buttonPrimary = 'inline-flex h-9 items-center justify-center gap-2 rounded-[4px] bg-primary px-4 text-[13px] font-bold text-primary-foreground transition-all hover:brightness-110 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50';
export const buttonQuiet = 'inline-flex h-9 items-center justify-center gap-2 rounded-[4px] border border-border bg-card px-3.5 text-[13px] font-bold text-foreground transition-all hover:-translate-y-px hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50';
export const buttonDanger = 'inline-flex h-9 items-center justify-center gap-2 rounded-[4px] border border-destructive/25 bg-destructive/10 px-3.5 text-[13px] font-bold text-destructive transition-all hover:bg-destructive/20';
export const iconButton = 'rounded-md p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-30';

// Results surfaces: the card, the table inside it, and the dashed empty state.
// Check and the compliance board share these so the two screens read as one.
export const cardClass = 'rounded-xl bg-card p-6 shadow-sm border border-border/30';
export const tableCard = 'overflow-hidden rounded-xl bg-card shadow-sm border border-border/30';
export const tableWrap = 'overflow-x-auto';
export const tableClass = 'w-full min-w-[600px] text-left text-xs';
export const tableHead = 'bg-muted/30 font-mono text-[10px] uppercase tracking-widest text-muted-foreground';
export const tableHeadCell = 'px-5 py-3.5 font-semibold';
export const tableBody = 'divide-y divide-border';
export const tableRow = 'transition hover:bg-muted/40';
export const emptyStateClass = 'flex min-h-[430px] flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/50 px-8 text-center';
