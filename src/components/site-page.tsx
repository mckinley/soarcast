import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ChevronLeft } from 'lucide-react';

/** The top of a site page: a link back, the name, a line of facts and the page's buttons. */
export function SiteHeader({
  back,
  title,
  facts,
  actions,
  children,
}: {
  back: { to: string; label: string };
  title: string;
  /** Short facts in one line: place, height, what it gives, wind limit */
  facts: Array<ReactNode | null | false | undefined>;
  actions?: ReactNode;
  /** A line under the facts */
  children?: ReactNode;
}) {
  const shown = facts.filter((f) => f != null && f !== false && f !== '');
  return (
    <header className="space-y-2">
      <Link
        to={back.to}
        className="-ml-1 inline-flex items-center gap-0.5 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        {back.label}
      </Link>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1.5">
          <h1 className="text-[28px] leading-tight font-bold tracking-tight md:text-4xl">
            {title}
          </h1>
          {shown.length > 0 && (
            // Each fact keeps its words together, and the dot stays with the fact before it
            <p className="text-[15px] text-muted-foreground">
              {shown.map((fact, i) => (
                <span key={i}>
                  <span className="inline-flex items-center gap-1 whitespace-nowrap">
                    {fact}
                    {i < shown.length - 1 && <span aria-hidden>·</span>}
                  </span>{' '}
                </span>
              ))}
            </p>
          )}
          {children}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2 pt-1">{actions}</div>}
      </div>
    </header>
  );
}

/** A titled group of cards on a site page, two across on a computer. */
export function SiteSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <div className="grid items-start gap-4 md:grid-cols-2">{children}</div>
    </section>
  );
}

/** One fact in a site's About card: its name on the left, the value on the right. */
export function FactRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1.5 border-b py-3 first:pt-0 last:border-b-0">
      <dt className="shrink-0 text-sm text-muted-foreground">{label}</dt>
      <dd className="ml-auto min-w-0 text-right text-sm">{children}</dd>
    </div>
  );
}

/** "543 m (1,781 ft)" */
export function heightText(meters: number): string {
  return `${Math.round(meters).toLocaleString('en-US')} m (${Math.round(meters * 3.28084).toLocaleString('en-US')} ft)`;
}
