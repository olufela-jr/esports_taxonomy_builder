import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

// A side panel over the right of the page. Not modal: the page behind stays
// visible and usable (the segment chips above all). Escape closes it, and
// opening it moves focus to its first field.
// top: where the panel starts, so it can sit below a sticky bar it must not hide.
export function Drawer({ title, eyebrow, onClose, children, testId, top = 0 }: { title: string; eyebrow?: ReactNode; onClose: () => void; children: ReactNode; testId?: string; top?: number }) {
  const panel = useRef<HTMLElement>(null);

  useEffect(() => {
    panel.current?.querySelector<HTMLElement>('input, select, textarea')?.focus();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <aside ref={panel} style={{ top }} className="drawer-enter fixed bottom-0 right-0 z-30 flex w-full max-w-[440px] flex-col border-l border-border bg-card shadow-2xl" aria-label={title} data-testid={testId}>
      <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0">
          {eyebrow && <div className="mb-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-primary">{eyebrow}</div>}
          <h2 className="truncate font-display text-xl font-medium text-foreground">{title}</h2>
        </div>
        <button type="button" className="rounded-md p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground" onClick={onClose} aria-label="Close" data-testid="button-close-drawer"><X className="h-4 w-4" /></button>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
    </aside>
  );
}
