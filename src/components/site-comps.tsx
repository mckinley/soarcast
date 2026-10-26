import type { ReactNode } from 'react';
import { Trophy } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { addDays } from '@/lib/alert-schedule';
import {
  COMP_DAY_NOTE,
  COMP_RADIUS_KM,
  DISCIPLINE_LABEL,
  compDates,
  compLevel,
  compsBetween,
  compsOn,
  usualMonths,
  type Comp,
} from '@/lib/comps';

const badge = 'rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground';

/** The comp's name, linking its own page (where pilots enter) when known. */
export function CompName({ comp, className = '' }: { comp: Comp; className?: string }) {
  if (!comp.url) return <span className={className}>{comp.name}</span>;
  return (
    <a
      href={comp.url}
      target="_blank"
      rel="noreferrer"
      className={`underline-offset-2 hover:underline ${className}`}
    >
      {comp.name}
    </a>
  );
}

/** World Cup / Cat 1 / Cat 2, and the discipline when it isn't cross-country. */
export function CompBadges({ comp }: { comp: Comp }) {
  const level = compLevel(comp);
  return (
    <>
      {level && <span className={badge}>{level}</span>}
      {comp.discipline !== 'xc' && (
        <span className={badge}>{DISCIPLINE_LABEL[comp.discipline]}</span>
      )}
    </>
  );
}

/** One comp in a list: its dates, name and level, and whatever the page adds below. */
export function CompRow({
  comp,
  year = true,
  children,
}: {
  comp: Comp;
  year?: boolean;
  children?: ReactNode;
}) {
  return (
    <li className="flex flex-col gap-0.5 py-2 sm:flex-row sm:gap-3">
      <span className="shrink-0 text-sm tabular-nums text-muted-foreground sm:w-44">
        {compDates(comp, { year })}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <CompName comp={comp} className="text-sm font-medium" />
          <CompBadges comp={comp} />
        </div>
        {children}
      </div>
    </li>
  );
}

/** Under a site's week: a comp on today, else one on later this week. */
export function CompDayNotice({ comps, today }: { comps: Comp[]; today: string }) {
  const onToday = compsOn(comps, today);
  const thisWeek =
    onToday.length > 0 ? [] : compsBetween(comps, addDays(today, 1), addDays(today, 6));
  const shown = onToday.length > 0 ? onToday : thisWeek;
  if (shown.length === 0) return null;

  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-marginal-border bg-marginal p-3.5 text-sm text-marginal-foreground">
      <Trophy className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 space-y-1">
        {shown.map((comp) => (
          <p key={comp.id}>
            <span className="font-medium">
              {onToday.length > 0 ? 'Comp on today: ' : 'Comp this week: '}
            </span>
            <CompName comp={comp} className="underline" />, {compDates(comp, { year: false })}
          </p>
        ))}
        <p className="text-xs opacity-80">{COMP_DAY_NOTE}</p>
      </div>
    </div>
  );
}

/** A site's comps: what's coming, and when comps have been held there. Nothing when it has none. */
export function SiteCompsCard({ comps, today }: { comps: Comp[]; today: string }) {
  if (comps.length === 0) return null;
  const upcoming = comps.filter((c) => c.endDate >= today);
  const past = comps.filter((c) => c.endDate < today);
  const months = usualMonths(past);

  return (
    <Card className="gap-3 p-4 sm:p-6">
      <div className="flex items-center gap-2">
        <Trophy className="h-5 w-5 text-amber-600 dark:text-amber-400" />
        <h2 className="text-lg font-semibold">Comps here</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        FAI and World Cup comps within {COMP_RADIUS_KM} km.
        {past.length > 0 &&
          ` ${past.length === 1 ? 'One' : past.length} held since ${past[0].startDate.slice(0, 4)}${
            months ? `, ${past.length === 1 ? 'in' : 'mostly in'} ${months}` : ''
          }.`}
      </p>
      {upcoming.length > 0 ? (
        <ul className="divide-y">
          {upcoming.map((comp) => (
            <CompRow key={comp.id} comp={comp} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">None listed yet for the next two years.</p>
      )}
      {past.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            Held here before
          </summary>
          <ul className="divide-y">
            {[...past].reverse().map((comp) => (
              <CompRow key={comp.id} comp={comp} />
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}
