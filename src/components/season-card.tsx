import { CalendarRange, Trophy } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { GOAL_LABEL } from '@/lib/site-goals';
import { LOST_REASON_WORD, type SeasonMonth, type SeasonSummary } from '@/lib/seasons';
import type { Comp } from '@/lib/comps';
import type { SiteGoal } from '@/types';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

// Go is the stronger step of one green in both themes; flyable the weaker
const GO_FILL = 'bg-green-700 dark:bg-green-500';
const FLYABLE_FILL = 'bg-green-500 dark:bg-green-700';

function pct(n: number, of: number): number {
  return of > 0 ? Math.round((n / of) * 100) : 0;
}

function monthYear(date: string): string {
  return `${MONTHS[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}`;
}

/** The month in a sentence: how often it was a go, and what lost the other days. */
function monthDetail(m: SeasonMonth): string {
  if (m.days === 0) return 'No days rated';
  const lost = m.lost
    .slice(0, 2)
    .map((l) => LOST_REASON_WORD[l.reason] ?? l.reason)
    .join(' and ');
  return `Go on ${pct(m.counts.go, m.days)}% of days, flyable on ${pct(m.counts.flyable, m.days)}% more.${
    lost ? ` Mostly lost to ${lost}.` : ''
  }`;
}

/** The pilot's week against a typical one there: "about 1 go day in a typical week now". */
export function TypicalWeekLine({
  weekGoDays,
  typicalWeek,
}: {
  weekGoDays: number;
  typicalWeek: number | null;
}) {
  if (typicalWeek == null) return null;
  const typical = Math.round(typicalWeek);
  const compare =
    weekGoDays >= typical + 2
      ? 'a better week than usual'
      : weekGoDays <= typical - 2
        ? 'a worse week than usual'
        : 'about a usual week';
  return (
    <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
      <CalendarRange className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>
        This week: {weekGoDays === 1 ? '1 go day' : `${weekGoDays} go days`}. A typical week here at
        this time of year has {typical === 1 ? 'about 1' : `about ${typical}`}, so it&apos;s{' '}
        {compare}.
      </span>
    </p>
  );
}

/**
 * When a site is good through the year: for each month, the share of past
 * days that were a go for the pilot's goal, and that were flyable but less,
 * from the engine run over two years of archived forecasts.
 */
export function SeasonCard({
  season,
  goal,
  today,
  comps = [],
  followed,
}: {
  season: SeasonSummary | null;
  goal: SiteGoal;
  /** The site's today, to mark this month */
  today: string;
  /** Comps held at the site, to mark the months they run */
  comps?: Comp[];
  /** Whether the season build rates this site (followed, custom or a destination) */
  followed: boolean;
}) {
  if (!season) {
    return (
      <Card className="gap-2 p-4 sm:p-6">
        <h2 className="text-lg font-semibold">Season</h2>
        <p className="text-sm text-muted-foreground">
          {followed
            ? 'Coming soon: SoarCast is rating this site’s last two years, month by month. It runs twice a day, so check back tomorrow.'
            : 'Add this site to Favorites to see its best months: SoarCast then rates its last two years, month by month.'}
        </p>
      </Card>
    );
  }

  const thisMonth = Number(today.slice(5, 7));
  const peak = season.months.reduce((a, b) => (b.goShare > a.goShare ? b : a));
  const compMonths = Array.from({ length: 12 }, () => 0);
  for (const c of comps) if (c.endDate < today) compMonths[Number(c.startDate.slice(5, 7)) - 1]++;

  return (
    <Card className="gap-3 p-4 sm:p-6">
      <div>
        <h2 className="text-lg font-semibold">Season</h2>
        <p className="text-sm text-muted-foreground">
          Days that were a go ({GOAL_LABEL[goal].toLowerCase()}), by month.
        </p>
      </div>

      <p className="text-sm">
        {season.best ? (
          <>
            <span className="font-medium">Best months: {season.best.text}</span>, a go on about{' '}
            {Math.round(season.best.share * 100)}% of days.
          </>
        ) : (
          `No month here was a go (${GOAL_LABEL[goal].toLowerCase()}) in the last two years.`
        )}
      </p>

      {/* Columns: go, then flyable stacked on top, out of every day of the month */}
      <div className="relative pt-5" role="img" aria-label="Go and flyable days by month">
        <div className="relative h-28">
          {[0, 50, 100].map((v) => (
            <div
              key={v}
              className="absolute inset-x-0 border-t border-border/60"
              style={{ bottom: `${v}%` }}
            >
              <span className="absolute -top-2 right-full mr-1 hidden text-[10px] text-muted-foreground sm:block">
                {v}%
              </span>
            </div>
          ))}
          <div className="absolute inset-0 grid grid-cols-12">
            {season.months.map((m, i) => {
              const go = pct(m.counts.go, m.days);
              const flyable = pct(m.counts.flyable, m.days);
              const align = i < 3 ? 'left-0' : i > 8 ? 'right-0' : 'left-1/2 -translate-x-1/2';
              return (
                <div
                  key={m.month}
                  tabIndex={0}
                  className="group relative flex h-full flex-col items-center justify-end outline-none"
                  aria-label={`${MONTHS_LONG[i]}: ${monthDetail(m)}`}
                >
                  {m === peak && go > 0 && (
                    <span className="mb-0.5 text-[10px] font-semibold tabular-nums">{go}%</span>
                  )}
                  <div className="flex w-full max-w-6 flex-col items-stretch gap-[2px] px-[3px] transition-opacity group-hover:opacity-80 group-focus:opacity-80">
                    {flyable > 0 && (
                      <div
                        className={`rounded-t-[4px] ${FLYABLE_FILL}`}
                        style={{ height: `${(flyable / 100) * 112}px` }}
                      />
                    )}
                    {go > 0 && (
                      <div
                        className={`${flyable > 0 ? '' : 'rounded-t-[4px]'} ${GO_FILL}`}
                        style={{ height: `${(go / 100) * 112}px` }}
                      />
                    )}
                  </div>
                  <div
                    className={`pointer-events-none absolute bottom-full z-10 mb-1 hidden w-48 rounded-md border bg-popover p-2 text-xs text-popover-foreground shadow-md group-hover:block group-focus:block ${align}`}
                  >
                    <div className="font-medium">{MONTHS_LONG[i]}</div>
                    <div className="text-muted-foreground">{monthDetail(m)}</div>
                    {compMonths[i] > 0 && (
                      <div className="mt-1 text-muted-foreground">
                        Comps held here in {MONTHS[i]}: {compMonths[i]}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="mt-1 grid grid-cols-12 border-t border-border">
          {MONTHS.map((name, i) => (
            <div key={name} className="flex flex-col items-center pt-1">
              <span
                className={`text-[10px] ${i + 1 === thisMonth ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}
              >
                {name}
              </span>
              {compMonths[i] > 0 && (
                <Trophy
                  className="mt-0.5 h-3 w-3 text-amber-600 dark:text-amber-400"
                  aria-label={`Comps held here in ${MONTHS_LONG[i]}`}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <li className="flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 rounded-sm ${GO_FILL}`} />
          Go: {GOAL_LABEL[goal].toLowerCase()}
        </li>
        <li className="flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 rounded-sm ${FLYABLE_FILL}`} />
          Flyable, but less than that
        </li>
        {compMonths.some((n) => n > 0) && (
          <li className="flex items-center gap-1.5">
            <Trophy className="h-3 w-3 text-amber-600 dark:text-amber-400" />
            Months comps were held here
          </li>
        )}
      </ul>

      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
          Month by month
        </summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-1 pr-2 font-medium">Month</th>
                <th className="py-1 pr-2 text-right font-medium">Go</th>
                <th className="py-1 pr-2 text-right font-medium">Flyable</th>
                <th className="py-1 pr-2 text-right font-medium">Marginal</th>
                <th className="py-1 pr-2 text-right font-medium">Not flyable</th>
                <th className="py-1 font-medium">Mostly lost to</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {season.months.map((m, i) => (
                <tr key={m.month} className="border-b last:border-0">
                  <td className="py-1 pr-2">{MONTHS[i]}</td>
                  <td className="py-1 pr-2 text-right">{pct(m.counts.go, m.days)}%</td>
                  <td className="py-1 pr-2 text-right">{pct(m.counts.flyable, m.days)}%</td>
                  <td className="py-1 pr-2 text-right">{pct(m.counts.marginal, m.days)}%</td>
                  <td className="py-1 pr-2 text-right">{pct(m.counts.no, m.days)}%</td>
                  <td className="py-1">
                    {m.lost[0] ? (LOST_REASON_WORD[m.lost[0].reason] ?? m.lost[0].reason) : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <p className="text-xs text-muted-foreground">
        Every day from {monthYear(season.fromDate)} to {monthYear(season.toDate)}, rated the way
        today&apos;s forecast is, on archived forecasts. Two years is enough to see the seasons but
        one odd year still moves a month.
        {!season.sameSettings &&
          ' These use the settings the site had when it was rated; the current ones come with the next update.'}
      </p>
    </Card>
  );
}
