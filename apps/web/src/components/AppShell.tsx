import type { ReactNode } from 'react';
import { ShieldCheck, ChevronRight, LogOut } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import type { User } from '@/data/auth';
import type { RuleSet, Store, Tenant } from '@/data/store';

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

// badge: an in-app notice (v3 O17), the count of things waiting for this
// person behind the page: pending requests for an admin, decided ones for a
// member. The active item looks like a selected chip elsewhere in the app.
// id: the test id suffix, kept stable when a label changes.
function NavItem({ href, label, id, active, badge }: { href: string; label: string; id: string; active: boolean; badge?: number }) {
  return (
    <Link href={href} className={`flex items-center rounded-lg border px-3 py-2 text-sm font-semibold transition ${active ? 'border-primary/60 bg-primary/10 text-sidebar-accent-foreground' : 'border-transparent text-sidebar-foreground/65 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground'}`} aria-current={active ? 'page' : undefined} data-testid={`link-nav-${id}`}>
      <span>{label}</span>
      {badge ? <span className="ml-auto rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold text-primary-foreground" data-testid={`badge-nav-${id}`}>{badge}</span> : null}
    </Link>
  );
}

function NavGroup({ name, children }: { name: string; children: ReactNode }) {
  return (
    <>
      <div className="mt-6 px-3 font-mono text-[10px] font-medium uppercase tracking-[0.05em] text-sidebar-foreground/40">{name}</div>
      <nav className="mt-2 space-y-1" aria-label={name} data-testid={`nav-group-${name.toLowerCase().replaceAll(' ', '-')}`}>{children}</nav>
    </>
  );
}

type AppShellProps = {
  user: User;
  ruleSets: RuleSet[];
  storeKind: Store['kind'];
  ruleSetId: string | null;
  ruleId: string | null;
  onSelectRuleSet: (id: string | null) => void;
  onSelectRule: (id: string) => void;
  onSignOut: () => Promise<void>;
  definitionsBadge: number;
  // Access requests waiting on the super user.
  tenantsBadge: number;
  // Admins get Manage Rules and the Members action (the admin section); the
  // super user gets them too, read only, plus Tenants and the workspace switcher.
  canManage: boolean;
  isSuper: boolean;
  // The super user's role in the workspace shown, if any.
  roleHere: 'admin' | 'user' | null;
  tenants: Tenant[];
  tenantId: string | null;
  onSelectTenant: (id: string) => void;
  children: ReactNode;
};

// The action-first shell: the persistent Rule Set and Rule context, the
// actions, the signed-in user, and the workspace for the current action.
export function AppShell({ user, ruleSets, storeKind, ruleSetId, ruleId, onSelectRuleSet, onSelectRule, onSignOut, definitionsBadge, tenantsBadge, canManage, isSuper, roleHere, tenants, tenantId, onSelectTenant, children }: AppShellProps) {
  const [location, setLocation] = useLocation();

  const current = location.startsWith('/rules') ? 'rules' : location.startsWith('/build') ? 'build' : location.startsWith('/compliance') ? 'compliance' : location.startsWith('/check') ? 'check' : location.startsWith('/definitions') ? 'definitions' : location.startsWith('/members') ? 'members' : location.startsWith('/tenants') ? 'tenants' : location === '/' ? 'home' : '';
  const currentLabel = current === 'rules' ? 'Manage Rules' : current;

  const selectedRuleSet = ruleSets.find(rs => rs.id === ruleSetId);

  return (
    <div className="min-h-[100dvh] bg-background">
      <aside className="fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col overflow-y-auto bg-sidebar px-4 py-5 text-sidebar-foreground" data-testid="sidebar">
        <div className="flex items-center gap-3 px-2">
          <Link href="/" className="flex items-center gap-3" aria-label="Home" data-testid="link-home">
            <IconMark />
            <div>
              <div className="font-display text-[17px] font-medium tracking-tight">Campaign Naming</div>
              <div className="font-mono text-[10px] uppercase tracking-[0.05em] text-primary mt-0.5">Rule Set Tool</div>
            </div>
          </Link>
        </div>
        
        <div className="mt-8 px-2 flex flex-col gap-3">
          {isSuper && tenants.length > 0 && <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-sidebar-foreground ml-1">Workspace:</label>
            <select
              className="h-9 w-full rounded-[4px] border-0 bg-[#EAE8E3] px-3 text-[13px] font-semibold text-gray-900 outline-none transition focus:ring-2 focus:ring-primary shadow-inner"
              value={tenantId || ''}
              onChange={(e) => onSelectTenant(e.target.value)}
              data-testid="select-shell-tenant"
            >
              {tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}
            </select>
          </div>}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-sidebar-foreground ml-1">Rule Set:</label>
            <select 
              className="h-9 w-full rounded-[4px] border-0 bg-[#EAE8E3] px-3 text-[13px] font-semibold text-gray-900 outline-none transition focus:ring-2 focus:ring-primary shadow-inner"
              value={ruleSetId || ''}
              onChange={(e) => {
                if (e.target.value === 'manage') {
                  setLocation('/rules');
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
              {canManage && <option value="manage">-- Manage Rule Sets --</option>}
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

        {/* The homepage's three themes, each with its pages beneath it. */}
        <nav className="mt-8 space-y-1" aria-label="Home"><NavItem href="/" label="Home" id="home" active={current === 'home'} /></nav>
        <NavGroup name="Manage Rules">
          {canManage && <NavItem href="/rules" label="Rule Sets" id="manage-rules" active={current === 'rules'} />}
          <NavItem href="/definitions" label="Definitions" id="definitions" active={current === 'definitions'} badge={definitionsBadge} />
        </NavGroup>
        <NavGroup name="Build">
          <NavItem href="/build" label="Build names" id="build" active={current === 'build'} />
        </NavGroup>
        <NavGroup name="Check">
          <NavItem href="/check" label="Check names" id="check" active={current === 'check'} />
          <NavItem href="/compliance" label="Compliance" id="compliance" active={current === 'compliance'} />
        </NavGroup>
        {canManage && <NavGroup name="Admin">
          <NavItem href="/members" label="Members" id="members" active={current === 'members'} />
          {isSuper && <NavItem href="/tenants" label="Tenants" id="tenants" active={current === 'tenants'} badge={tenantsBadge} />}
        </NavGroup>}

        <div className="mt-auto">
          <div className="mb-4 rounded border border-sidebar-border bg-sidebar-accent/30 p-3">
            <div className="flex items-center gap-2 text-xs font-semibold" data-testid="text-store-mode"><ShieldCheck className="h-4 w-4 text-muted-foreground" /> {storeKind === 'firestore' ? 'Shared workspace' : 'Local draft'}</div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-sidebar-foreground/60">{storeKind === 'firestore' ? 'Changes are saved to Firestore and visible to everyone in this workspace.' : 'Changes stay in this browser and are not shared.'}</p>
          </div>
          <div className="flex items-center gap-3 border-t border-sidebar-border px-2 pt-4">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-primary text-xs font-semibold text-primary-foreground" aria-hidden="true">{initials(user.name)}</div>
            <div className="min-w-0"><div className="truncate text-xs font-semibold" data-testid="text-user-name">{user.name}</div>{user.email && <div className="truncate text-[11px] text-sidebar-foreground/60">{user.email}</div>}<div className="text-[11px] text-sidebar-foreground/60" data-testid="text-user-role">{isSuper ? `Super user, ${roleHere === 'admin' ? 'admin here' : 'read only here'}` : user.role === 'admin' ? 'Admin' : 'User'}</div></div>
            <button type="button" className="ml-auto rounded-md p-1.5 text-sidebar-foreground/55 transition hover:bg-sidebar-accent hover:text-sidebar-foreground" onClick={() => void onSignOut()} aria-label="Sign out" title="Sign out" data-testid="button-sign-out"><LogOut className="h-4 w-4" /></button>
          </div>
        </div>
      </aside>
      <main className="min-h-[100dvh] pl-[248px]">
        <header className="sticky top-0 z-20 flex h-[68px] items-center justify-between border-b border-border/70 bg-background/90 px-5 backdrop-blur-md sm:px-8">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><span className="font-mono text-[10px] uppercase tracking-[0.15em]">Workspace</span><ChevronRight className="h-3.5 w-3.5" /><span className="font-semibold text-foreground capitalize">{currentLabel}</span></div>
        </header>
        <div className="mx-auto max-w-[1440px] px-5 py-8 sm:px-8 lg:px-10">{children}</div>
      </main>
    </div>
  );
}