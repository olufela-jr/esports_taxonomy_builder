import { ReactNode, useState } from 'react';
import { ShieldCheck, Menu, X, ChevronRight, LogOut } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import type { User } from '@/data/auth';
import type { RuleSet, RuleSetStore } from '@/data/store';

// Up to two initials for the avatar; falls back to "?" for an empty name.
function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join('') || '?';
}

function IconMark() {
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-primary text-primary-foreground shadow-sm" data-testid="brand-mark">
      <span className="font-display text-lg font-bold tracking-tighter">RS</span>
    </div>
  );
}

function NavItem({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link href={href} className={`group flex items-center rounded-lg px-3 py-2.5 text-sm font-semibold transition ${active ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-sidebar-foreground/65 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground'}`} data-testid={`link-nav-${label.toLowerCase().replaceAll(' ', '-')}`}>
      <span>{label}</span>
      {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-accent" />}
    </Link>
  );
}

type AppShellProps = {
  user: User;
  ruleSets: RuleSet[];
  storeKind: RuleSetStore['kind'];
  ruleSetId: string | null;
  ruleId: string | null;
  onSelectRuleSet: (id: string | null) => void;
  onSelectRule: (id: string) => void;
  onSignOut: () => Promise<void>;
  children: ReactNode;
};

// The action-first shell: the persistent Rule Set and Rule context, the three
// actions, the signed-in user, and the workspace for the current action.
export function AppShell({ user, ruleSets, storeKind, ruleSetId, ruleId, onSelectRuleSet, onSelectRule, onSignOut, children }: AppShellProps) {
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
            <div className="font-display text-[17px] font-medium tracking-tight">Campaign Naming</div>
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
          <NavItem href="/author" label="Author" active={current === 'author'} />
          <NavItem href="/build" label="Build" active={current === 'build'} />
          <NavItem href="/check" label="Check" active={current === 'check'} />
        </nav>
        
        <div className="mt-auto">
          <div className="mb-4 rounded border border-sidebar-border bg-sidebar-accent/30 p-3">
            <div className="flex items-center gap-2 text-xs font-semibold" data-testid="text-store-mode"><ShieldCheck className="h-4 w-4 text-muted-foreground" /> {storeKind === 'firestore' ? 'Shared workspace' : 'Local draft'}</div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-sidebar-foreground/60">{storeKind === 'firestore' ? 'Changes are saved to Firestore and visible to everyone in this workspace.' : 'Changes stay in this browser and are not shared.'}</p>
          </div>
          <div className="flex items-center gap-3 border-t border-sidebar-border px-2 pt-4">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-primary text-xs font-semibold text-primary-foreground" aria-hidden="true">{initials(user.name)}</div>
            <div className="min-w-0"><div className="truncate text-xs font-semibold" data-testid="text-user-name">{user.name}</div>{user.email && <div className="truncate text-[11px] text-sidebar-foreground/60">{user.email}</div>}<div className="text-[11px] text-sidebar-foreground/60" data-testid="text-user-role">{user.role === 'admin' ? 'Admin' : 'User'}</div></div>
            <button type="button" className="ml-auto rounded-md p-1.5 text-sidebar-foreground/55 transition hover:bg-sidebar-accent hover:text-sidebar-foreground" onClick={() => void onSignOut()} aria-label="Sign out" title="Sign out" data-testid="button-sign-out"><LogOut className="h-4 w-4" /></button>
          </div>
        </div>
      </aside>
      {mobileOpen && <button className="fixed inset-0 z-30 bg-primary/20 backdrop-blur-sm lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Close menu overlay" data-testid="button-menu-overlay" />}
      <main className="min-h-[100dvh] lg:pl-[248px]">
        <header className="sticky top-0 z-20 flex h-[68px] items-center justify-between border-b border-border/70 bg-background/90 px-5 backdrop-blur-md sm:px-8">
          <button className="rounded-lg border border-border bg-card p-2 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation" data-testid="button-open-navigation"><Menu className="h-5 w-5" /></button>
          <div className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex"><span className="font-mono text-[10px] uppercase tracking-[0.15em]">Workspace</span><ChevronRight className="h-3.5 w-3.5" /><span className="font-semibold text-foreground capitalize">{current}</span></div>
          <div className="ml-auto flex h-8 w-8 items-center justify-center rounded bg-primary text-[11px] font-semibold text-primary-foreground lg:hidden" title={user.name} aria-hidden="true">{initials(user.name)}</div>
        </header>
        <div className="mx-auto max-w-[1440px] px-5 py-8 sm:px-8 lg:px-10">{children}</div>
      </main>
    </div>
  );
}