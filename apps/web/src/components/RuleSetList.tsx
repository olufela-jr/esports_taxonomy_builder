import { useState } from 'react';
import { ArrowRight, BadgeCheck, Hash, Layers3, Plus, Search } from 'lucide-react';
import type { Rule } from '@taxo/shared';
import type { RuleSet, RuleSetStore } from '@/data/store';
import { PageHeading } from './PageHeading';
import { buttonPrimary, inputClass } from './styles';

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
}

function StatCard({ label, value, caption, icon: Icon, status }: { label: string; value: string; caption: string; icon: typeof Layers3; status: string }) {
  return <div className="rounded-xl bg-card p-6 shadow-sm border border-border/30">
    <div className="flex items-start justify-between">
      <div>
        <div className="font-display text-xl font-medium text-foreground">{label}</div>
        <div className="mt-1 text-[11px] font-bold text-muted-foreground">{caption}</div>
      </div>
      <div className="flex h-5 w-5 items-center justify-center rounded-full border border-muted-foreground/30 text-muted-foreground"><Icon className="h-3 w-3" /></div>
    </div>
    <div className="mt-8 font-display text-4xl tracking-tight text-foreground" data-testid={`text-stat-${label.toLowerCase().replaceAll(' ', '-')}`}>{value}</div>
    <div className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5"><span className="h-2 w-2 rounded-full bg-primary" /><span className="text-[10px] font-bold text-foreground">{status}</span></div>
  </div>;
}

function EmptyState({ query, canCreate }: { query: string; canCreate: boolean }) {
  return <div className="rounded-xl border border-dashed border-border bg-card/50 px-6 py-12 text-center"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded bg-muted text-muted-foreground"><Search className="h-5 w-5" /></div><h3 className="mt-4 text-sm font-semibold text-foreground">{query ? 'No matching Rule Sets' : 'No Rule Sets configured'}</h3><p className="mt-1.5 text-xs text-muted-foreground">{query ? 'Try a different search term.' : canCreate ? 'Create a new Rule Set to define naming rules.' : 'A workspace admin creates the first Rule Set.'}</p></div>;
}

function RuleSetRow({ ruleSet, index, onSelect }: { ruleSet: RuleSet; index: number; onSelect: () => void }) {
  const segmentCount = ruleSet.rules.reduce((sum: number, rule: Rule) => sum + rule.segments.length, 0);
  return <button onClick={onSelect} className="w-full text-left group flex flex-col gap-4 rounded-xl border border-border/30 bg-card p-5 transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md sm:flex-row sm:items-center sm:justify-between" data-testid={`card-ruleset-${ruleSet.id}`}>
    <div className="flex min-w-0 items-center gap-4"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-muted font-mono text-sm text-foreground shadow-inner">{String(index + 1).padStart(2, '0')}</div><div className="min-w-0"><h3 className="truncate font-display text-xl font-medium text-foreground">{ruleSet.name}</h3><p className="mt-1.5 text-[13px] font-medium text-muted-foreground">Updated {formatDate(ruleSet.updatedAt)}</p></div></div>
    <div className="flex items-center justify-between gap-5 pl-14 sm:justify-end sm:pl-0"><div className="text-right"><div className="font-display text-2xl font-medium text-foreground">{ruleSet.rules.length}</div><div className="text-[11px] font-bold text-muted-foreground mt-0.5">Rules / {segmentCount} segments</div></div><ArrowRight className="h-5 w-5 text-muted-foreground transition-all group-hover:translate-x-1 group-hover:text-primary" /></div>
  </button>;
}

// Feature 1, landing view: list, search, and open Rule Sets, or start a new one.
// canCreate: the signed-in user is a workspace admin; standard users only open.
export function RuleSetList({ ruleSets, canCreate, storeKind, onOpen, onCreate }: { ruleSets: RuleSet[]; canCreate: boolean; storeKind: RuleSetStore['kind']; onOpen: (id: string) => void; onCreate: () => void }) {
  const [query, setQuery] = useState('');
  const filtered = ruleSets.filter((item) => item.name.toLowerCase().includes(query.toLowerCase()));
  const totalSegments = ruleSets.reduce((sum, ruleSet) => sum + ruleSet.rules.reduce((ruleSum: number, rule: Rule) => ruleSum + rule.segments.length, 0), 0);
  return (
    <div>
      <PageHeading eyebrow="Marketing Operations" title="Rule Set overview" description="Manage campaign naming rules and structures across the organization." action={canCreate ? <button type="button" onClick={onCreate} className={buttonPrimary} data-testid="button-create-ruleset"><Plus className="h-4 w-4" /> New Rule Set</button> : undefined} />
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <StatCard label="Rule Sets" value={String(ruleSets.length)} caption="Active configurations" icon={Layers3} status="Active" />
        <StatCard label="Defined rules" value={String(ruleSets.reduce((sum, item) => sum + item.rules.length, 0))} caption={`${totalSegments} configured segments`} icon={Hash} status="Configured" />
        <StatCard label="Status" value="100%" caption={storeKind === 'firestore' ? 'Firestore connected' : 'Local draft active'} icon={BadgeCheck} status="Operational" />
      </div>
      <section id="rulesets">
        <div className="mb-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><h2 className="font-display text-2xl font-medium tracking-tight text-foreground">Configured Rule Sets</h2><p className="mt-1.5 text-sm text-muted-foreground">{canCreate ? 'Select a Rule Set to edit its rules and source mappings.' : 'Select a Rule Set to view its rules and source mappings.'}</p></div><div className="relative w-full sm:w-72"><Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} className={`${inputClass} pl-10`} placeholder="Search Rule Sets" aria-label="Search Rule Sets" data-testid="input-search-rulesets" /></div></div>
        {filtered.length > 0 ? <div className="grid gap-4">{filtered.map((ruleSet, index) => <RuleSetRow key={ruleSet.id} ruleSet={ruleSet} index={index} onSelect={() => onOpen(ruleSet.id)} />)}</div> : <EmptyState query={query} canCreate={canCreate} />}
      </section>
    </div>
  );
}
