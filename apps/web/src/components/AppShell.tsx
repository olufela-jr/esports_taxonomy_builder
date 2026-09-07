import { ReactNode, useState } from 'react';
import { BookOpen, Zap, ClipboardCheck, Settings2, ShieldCheck, Menu, X, ChevronRight } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import type { RuleSet } from '@/data/store';

function IconMark() {
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-primary text-primary-foreground shadow-sm" data-testid="brand-mark">
      <span className="font-serif text-lg font-bold italic tracking-tighter">RS</span>
    </div>
  );
}

function NavItem({ href, icon: Icon, label, active }: { href: string; icon: typeof BookOpen; label: string; active: boolean }) {
  return (
    <Link href={href} className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${active ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-sidebar-foreground/65 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground'}`} data-testid={`link-nav-${label.toLowerCase().replaceAll(' ', '-')}`}>
      <Icon className={`h-4 w-4 ${active ? 'text-accent' : 'text-sidebar-foreground/55 group-hover:text-accent'}`} />
      <span>{label}</span>
      {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-accent" />}
    </Link>
  );
}

type AppShellProps = {
  ruleSets: RuleSet[];
  ruleSetId: string | null;
  ruleId: string | null;
  onSelectRuleSet: (id: string | null) => void;
  onSelectRule: (id: string) => void;
  children: ReactNode;
};

// The action-first shell: the persistent Rule Set and Rule context, the three
// actions, and the workspace for the current one.
export function AppShell({ ruleSets, ruleSetId, ruleId, onSelectRuleSet, onSelectRule, children }: AppShellProps) {
  const [location, setLocation] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const current = location.startsWith('/build') ? 'build' : location.startsWith('/check') ? 'check' : 'author';

  const selectedRuleSet = ruleSets.find(rs => rs.id === ruleSetId);

  return (
    <div className="min-h-[100dvh] bg-background">
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col bg-sidebar px-4 py-5 text-sidebar-foreground transition-transform duration-300 lg:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`} data-testid="sidebar">
        <div className="flex items-center gap-3 px-2">
          <IconMark />
          <div>
            <div className="font-serif text-[17px] font-medium tracking-tight">Campaign Naming</div>
            <div className="font-mono text-[10px] uppercase tracking-[0.05em] text-primary mt-0.5">Rule Set Tool</div>
          </div>
          <button className="ml-auto rounded-md p-1.5 text-sidebar-foreground/55 hover:bg-sidebar-accent lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Close navigation" data-testid="button-close-navigation"><X className="h-4 w-4" /></button>
        </div>
        
        <div className="mt-8 px-2 flex flex-col gap-3">
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-sidebar-foreground ml-1">Rule Set:</label>
            <select 
              className="h-9 w-full rounded-[4px] border-0 bg-[#EAE8E3] px-3 text-[13px] font-semibold text-gray-900 outline-none transition focus:ring-2 focus:ring-primary shadow-inner"
              value={ruleSetId || ''}
              onChange={(e) => {
                if (e.target.value === 'manage') {
                  onSelectRuleSet(null);
                  setLocation('/author');
                } else {
                  onSelectRuleSet(e.target.value);
                }
              }}
              data-testid="select-shell-ruleset"
            >
              <option value="" disabled>Select Rule Set</option>
              {ruleSets.map(rs => (
                <option key={rs.id} value={rs.id}>{rs.name}</option>
              ))}
              <option value="manage">-- Manage Rule Sets --</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-sidebar-foreground ml-1">Rule:</label>
            <select 
              className="h-9 w-full rounded-[4px] border-0 bg-[#EAE8E3] px-3 text-[13px] font-semibold text-gray-900 outline-none transition focus:ring-2 focus:ring-primary shadow-inner disabled:opacity-50"
              value={ruleId || ''}
              onChange={(e) => onSelectRule(e.target.value)}
              data-testid="select-shell-rule"
              disabled={!selectedRuleSet}
            >
              {!selectedRuleSet && <option value="">No Rule Set selected</option>}
              {selectedRuleSet && selectedRuleSet.rules.map(r => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-8 px-3 font-mono text-[10px] font-medium uppercase tracking-[0.05em] text-sidebar-foreground/40">Actions</div>
        <nav className="mt-2 space-y-1" aria-label="Main navigation">
          <NavItem href="/author" icon={BookOpen} label="Author" active={current === 'author'} />
          <NavItem href="/build" icon={Zap} label="Build" active={current === 'build'} />
          <NavItem href="/check" icon={ClipboardCheck} label="Check" active={current === 'check'} />
        </nav>
        
        <div className="mt-auto">
          <div className="mb-4 rounded border border-sidebar-border bg-sidebar-accent/30 p-3">
            <div className="flex items-center gap-2 text-xs font-semibold"><ShieldCheck className="h-4 w-4 text-muted-foreground" /> Local draft</div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-sidebar-foreground/60">Changes are saved in this browser session.</p>
          </div>
          <div className="flex items-center gap-3 border-t border-sidebar-border px-2 pt-4">
            <div className="flex h-8 w-8 items-center justify-center rounded bg-primary text-xs font-semibold text-primary-foreground">MC</div>
            <div className="min-w-0"><div className="truncate text-xs font-semibold">Maya Chen</div><div className="truncate text-[11px] text-sidebar-foreground/60">Marketing Operations</div></div>
            <button className="ml-auto rounded-md p-1 text-sidebar-foreground/55 hover:bg-sidebar-accent hover:text-sidebar-foreground" aria-label="Open settings" data-testid="button-workspace-settings"><Settings2 className="h-4 w-4" /></button>
          </div>
        </div>
      </aside>
      {mobileOpen && <button className="fixed inset-0 z-30 bg-primary/20 backdrop-blur-sm lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Close menu overlay" data-testid="button-menu-overlay" />}
      <main className="min-h-[100dvh] lg:pl-[248px]">
        <header className="sticky top-0 z-20 flex h-[68px] items-center justify-between border-b border-border/70 bg-background/90 px-5 backdrop-blur-md sm:px-8">
          <button className="rounded-lg border border-border bg-card p-2 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation" data-testid="button-open-navigation"><Menu className="h-5 w-5" /></button>
          <div className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex"><span className="font-mono text-[10px] uppercase tracking-[0.15em]">Workspace</span><ChevronRight className="h-3.5 w-3.5" /><span className="font-semibold text-foreground capitalize">{current}</span></div>
          <div className="ml-auto flex items-center gap-2 sm:gap-4">
            <div className="hidden items-center gap-2 rounded border border-border bg-card px-2.5 py-1.5 text-[11px] text-muted-foreground md:flex"><span className="h-1.5 w-1.5 rounded-full bg-accent" /><span>System operational</span></div>
            <div className="flex h-8 w-8 items-center justify-center rounded bg-primary text-[11px] font-semibold text-primary-foreground sm:hidden">MC</div>
          </div>
        </header>
        <div className="mx-auto max-w-[1440px] px-5 py-8 sm:px-8 lg:px-10">{children}</div>
      </main>
    </div>
  );
}