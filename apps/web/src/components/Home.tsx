import type { ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';
import { Link } from 'wouter';
import type { RuleSet } from '@/data/store';
import { PageHeading } from './PageHeading';

type HomeProps = {
  // Admins (and the super user, read only) manage rules; everyone builds and checks.
  canManage: boolean;
  ruleSets: RuleSet[];
  selectedRuleSet: RuleSet | undefined;
  selectedRule: RuleSet['rules'][number] | undefined;
};

function ActionBox({ href, title, body, context, testId }: { href: string; title: string; body: string; context: ReactNode; testId: string }) {
  return (
    <Link href={href} className="group flex min-h-[240px] flex-col rounded-xl border border-border/30 bg-card p-7 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md" data-testid={testId}>
      <h2 className="font-display text-2xl font-medium text-foreground">{title}</h2>
      <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{body}</p>
      <div className="mt-auto flex items-center justify-between gap-3 pt-6 text-[12px] font-bold text-muted-foreground">
        <span className="min-w-0 truncate">{context}</span>
        <ArrowRight className="h-4 w-4 shrink-0 transition-all group-hover:translate-x-1 group-hover:text-primary" />
      </div>
    </Link>
  );
}

// The landing page: the three things people come here to do. The Rule Set and
// Rule picked in the sidebar carry into Build and Check.
export function Home({ canManage, ruleSets, selectedRuleSet, selectedRule }: HomeProps) {
  const current = selectedRuleSet && selectedRule ? `${selectedRuleSet.name} / ${selectedRule.name}` : 'Pick a Rule Set and Rule in the sidebar';
  return (
    <div>
      <PageHeading eyebrow="Campaign naming" title="What do you want to do?" description="Manage the naming rules, build compliant names from them, or check names you already have." />
      <div className={`mx-auto grid gap-5 ${canManage ? 'md:grid-cols-3' : 'max-w-4xl md:grid-cols-2'}`} data-testid="section-home">
        {canManage && <ActionBox href="/rules" title="Manage Rules" body="Create and edit Rule Sets: the segments, order and values each name must follow." context={`${ruleSets.length} Rule Set${ruleSets.length === 1 ? '' : 's'}`} testId="box-home-rules" />}
        <ActionBox href="/build" title="Build" body="Pick values and generate compliant names, one or many at once, with tracking URLs." context={current} testId="box-home-build" />
        <ActionBox href="/check" title="Check" body="Upload names or scan live data and see which break the rules, and why." context={current} testId="box-home-check" />
      </div>
    </div>
  );
}

// A standard user who opens a Manage Rules link.
export function RulesAdminsOnly() {
  return (
    <div data-testid="text-rules-admins-only">
      <PageHeading eyebrow="Manage Rules" title="Admins only" description="Only a workspace admin can manage rules. Build and Check work with every Rule Set." />
    </div>
  );
}
