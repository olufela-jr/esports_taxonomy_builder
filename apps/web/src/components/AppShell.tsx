import { ReactNode, useState, useEffect } from 'react';
import { BookOpen, Zap, ClipboardCheck, Settings2, ShieldCheck, Menu, X, ChevronRight } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { useUi } from '@/context/UiContext';
import { useRuleSets } from '@/hooks/use-rulesets';

function IconMark() {
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-primary text-primary-foreground shadow-sm" data-testid="brand-mark">
      <span className="font-serif text-lg font-bold italic tracking-tighter">RS</span>
    </div>
  );
}

function NavItem({ href, icon: Icon, label, active, onClick }: { href: string; icon: typeof BookOpen; label: string; active: boolean; onClick?: () => void }) {
  return (
    <Link href={href} onClick={onClick} className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${active ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-sidebar-foreground/65 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground'}`} data-testid={`link-nav-${label.toLowerCase().replaceAll(' ', '-')}`}>
      <Icon className={`h-4 w-4 ${active ? 'text-accent' : 'text-sidebar-foreground/55 group-hover:text-accent'}`} />
      <span>{label}</span>
      {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-accent" />}
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { ruleSetId, ruleId, setRuleSetId, setRuleId, setLastAction } = useUi();
  const { ruleSets } = useRuleSets();

  const current = location.startsWith('/build') ? 'build' : location.startsWith('/check') ? 'check' : 'author';

  const selectedRuleSet = ruleSets.find(rs => rs.id === ruleSetId);

  // Keep the Rule selection valid for the selected Rule Set: fall back to its first Rule.
  useEffect(() => {
    if (selectedRuleSet && selectedRuleSet.rules.length > 0) {
      if (!ruleId || !selectedRuleSet.rules.find(r => r.id === ruleId)) {
        setRuleId(selectedRuleSet.rules[0].id);
      }
    }
  }, [selectedRuleSet, ruleId, setRuleId]);

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
                  setRuleSetId(null);
                  setLastAction('/author');
                  setLocation('/author');
                } else {
                  setRuleSetId(e.target.value);
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
              onChange={(e) => setRuleId(e.target.value)}
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
          <NavItem href="/author" onClick={() => setLastAction('/author')} icon={BookOpen} label="Author" active={current === 'author'} />
          <NavItem href="/build" onClick={() => setLastAction('/build')} icon={Zap} label="Build" active={current === 'build'} />
          <NavItem href="/check" onClick={() => setLastAction('/check')} icon={ClipboardCheck} label="Check" active={current === 'check'} />
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