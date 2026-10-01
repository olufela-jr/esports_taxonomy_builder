import { ChevronRight } from 'lucide-react';
import { Link } from 'wouter';

export type Crumb = { label: string; href?: string };

// The trail from the Rule Set down to what is open. The last crumb is the
// current page and is not a link.
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-4" data-testid="breadcrumbs">
      <ol className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        {items.map((item, index) => (
          <li key={`${index}-${item.label}`} className="flex items-center gap-1.5">
            {index > 0 && <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />}
            {item.href && index < items.length - 1
              ? <Link href={item.href} className="transition hover:text-foreground" data-testid={`crumb-${index}`}>{item.label}</Link>
              : <span className="text-foreground" aria-current="page" data-testid={`crumb-${index}`}>{item.label}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}
