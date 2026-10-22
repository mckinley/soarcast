import { Card } from '@/components/ui/card';
import { NogaCredit } from '@/components/data-credits';
import { aboutPerYear, mainMonths, NOGA_MIN_POINTS, type NogaFlights } from '@/lib/noga';

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

/**
 * Cross-country flights from the launch's NOGA site, by month: how many
 * flights of about 100 km or more pilots logged on XContest here. Shows how
 * far the flying goes and when. It never changes a verdict.
 */
export function XcFlightsCard({ xc, today }: { xc: NogaFlights; today: string }) {
  const thisMonth = Number(today.slice(5, 7));
  const top = Math.max(...xc.perYear);
  const peak = xc.perYear.indexOf(top);
  const months = mainMonths(xc.perYear);
  const perYear = xc.flights / xc.years;

  return (
    <Card className="gap-3 p-4 sm:p-6">
      <div>
        <h2 className="text-lg font-semibold">Cross-country flights</h2>
        <p className="text-sm text-muted-foreground">
          Flights of {NOGA_MIN_POINTS} points or more on XContest (about 100 km), a year on average,
          by month.
        </p>
      </div>

      <p className="text-sm">
        <span className="font-medium">
          {aboutPerYear(perYear).replace(/^about/, 'About')} a year
        </span>{' '}
        from here over {xc.years} years.
        {months && ` Most were in ${months}.`}
        {xc.maxPoints != null && ` The best scored ${Math.round(xc.maxPoints)} points.`}
      </p>

      <div role="img" aria-label="Cross-country flights a year by month">
        <div className="grid h-20 grid-cols-12 items-end">
          {xc.perYear.map((n, i) => (
            <div
              key={MONTHS[i]}
              className="flex h-full flex-col items-center justify-end px-[3px]"
              title={`${MONTHS_LONG[i]}: ${aboutPerYear(n)} a year`}
            >
              {i === peak && n > 0 && (
                <span className="mb-0.5 text-[10px] font-semibold tabular-nums">
                  {n >= 10 ? Math.round(n) : n.toFixed(1)}
                </span>
              )}
              {n > 0 && (
                <div
                  className="w-full max-w-6 rounded-t-[4px] bg-sky-600 dark:bg-sky-400"
                  style={{ height: `${Math.max(2, (n / top) * 64)}px` }}
                />
              )}
            </div>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-12 border-t border-border">
          {MONTHS.map((name, i) => (
            <span
              key={name}
              className={`pt-1 text-center text-[10px] ${i + 1 === thisMonth ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}
            >
              {name}
            </span>
          ))}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        NOGA groups this launch with the takeoffs around it as {xc.name}. Only long flights count,
        so a quiet month here can still be good for local flying.
      </p>
      <NogaCredit href={xc.href} />
    </Card>
  );
}
