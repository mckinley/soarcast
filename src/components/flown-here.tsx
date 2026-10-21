import { Card } from '@/components/ui/card';
import { FLOWN_RADIUS_KM, type FlownDay, type FlownHere } from '@/lib/flown-days';
import { LOST_REASON_WORD } from '@/lib/seasons';
import { STATUS_WORD, type DayStatus } from '@/lib/verdict-display';
import type { SiteGoal } from '@/types';

const STATUSES: DayStatus[] = ['go', 'flyable', 'marginal', 'no'];
/** Fewer flown days than this say too little to judge the forecast by. */
const MIN_CHECK_DAYS = 5;

function pct(n: number, of: number): number {
  return of > 0 ? Math.round((n / of) * 100) : 0;
}

/** "Sun, Oct 19", the same on the server and in the browser. */
function dayName(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function duration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h} h ${m} min` : `${m} min`;
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** One flown day in a line: "7 pilots: 6 soaring, 2 cross-country. Longest flight 2 h 49 min." */
function dayLine(d: FlownDay): string {
  const kinds = [
    d.soared && `${d.soared} soaring`,
    d.xc && `${d.xc} cross-country`,
    d.sled && plural(d.sled, 'glide down', 'glides down'),
  ].filter(Boolean);
  const longest = d.longestMinutes ? ` Longest flight ${duration(d.longestMinutes)}.` : '';
  return `${plural(d.pilots, 'pilot')}: ${kinds.join(', ')}.${longest}`;
}

/**
 * Days pilots really flew from the site, from their live trackers on
 * Syncing Pilots, and how SoarCast rated those days. Never changes a verdict.
 */
export function FlownHereCard({ flown, goal }: { flown: FlownHere | null; goal: SiteGoal }) {
  if (!flown) return null;
  const check = flown.check;
  const enough = !!check && check.flownDays >= MIN_CHECK_DAYS;

  return (
    <Card className="gap-3 p-4 sm:p-6">
      <div>
        <h2 className="text-lg font-semibold">Flown here</h2>
        <p className="text-sm text-muted-foreground">
          From pilots&apos; live trackers (inReach and SPOT) on Syncing Pilots.
        </p>
      </div>

      {flown.flownDays === 0 ? (
        <p className="text-sm">No tracked flights from here in the last two years.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {flown.recent.map((d) => (
            <li key={d.date}>
              <span className="font-medium">{dayName(d.date)}:</span> {dayLine(d)}
            </li>
          ))}
        </ul>
      )}

      {check && enough && (
        <div className="space-y-1 text-sm">
          <p>
            Pilots flew from here on {check.flownDays} of the {check.ratedDays} past days SoarCast
            rated. It called those days:
          </p>
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {STATUSES.map((s) => (
              <li key={s}>
                {STATUS_WORD[s]}{' '}
                <span className="font-semibold tabular-nums">
                  {pct(check.flownByStatus[s], check.flownDays)}%
                </span>
              </li>
            ))}
          </ul>
          {check.missedBy.length > 0 && (
            <p className="text-muted-foreground">
              It held back flown days mostly for{' '}
              {check.missedBy
                .slice(0, 2)
                .map((m) => LOST_REASON_WORD[m.reason] ?? m.reason)
                .join(' and ')}
              .
            </p>
          )}
          {check.ratedByStatus.go.days > 0 && check.ratedByStatus.no.days > 0 && (
            <p className="text-muted-foreground">
              Pilots flew on {pct(check.ratedByStatus.go.flown, check.ratedByStatus.go.days)}% of
              the days it called Go, and on{' '}
              {pct(check.ratedByStatus.no.flown, check.ratedByStatus.no.days)}% of the days it called
              Not flyable.
            </p>
          )}
          {goal !== 'launch' && check.soaringDays >= MIN_CHECK_DAYS && (
            <p className="text-muted-foreground">
              Pilots soared or went cross-country on {check.soaringDays} days. SoarCast expected
              that on {pct(check.soaringDays - check.soaringCalledSled, check.soaringDays)}% of
              them.
            </p>
          )}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        A flight counts when it takes off within {FLOWN_RADIUS_KM} km of the launch. A short glide
        down counts too, even when the tracker missed the flight itself. Only some pilots carry a
        live tracker, so a day with no tracked flight may still have been flown.
      </p>
    </Card>
  );
}
