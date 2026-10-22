import { Card } from '@/components/ui/card';
import {
  ENSEMBLE_GRID_KM,
  ENSEMBLE_RUNS,
  HELD_WORDS,
  mainHeld,
  type EnsembleDay,
  type HowSureExperiment,
} from '@/lib/ensembles';
import { dayName, dayStatus, STATUS_DOT, STATUS_WORD } from '@/lib/verdict-display';
import type { DayScore } from '@/types';

/** Whether the runs and the main forecast agree: a flyable day when at least half the runs give a window. */
function agrees(day: EnsembleDay, main: DayScore): boolean {
  return (main.verdict === 'go') === (day.go * 2 >= day.runs);
}

/** "Oct 22, 08:14 UTC", the same on the server and in the browser. */
function fetchedWhen(iso: string): string {
  return `${new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: 'UTC',
  })} UTC`;
}

/** "Today", "Tomorrow", then "Sat 24": ten days repeat weekday names. */
function label(date: string, today: string): string {
  const name = dayName(date, today);
  return name === 'Today' || name === 'Tomorrow' ? name : `${name} ${Number(date.slice(8, 10))}`;
}

function DayRow({ day, today, main }: { day: EnsembleDay; today: string; main?: DayScore }) {
  const part = (n: number) => `${(n / day.runs) * 100}%`;
  const held = day.go * 2 < day.runs ? mainHeld(day) : null;
  const status = main ? dayStatus(main) : null;
  return (
    <li className="grid grid-cols-[5.5rem_1fr_4.5rem] items-center gap-x-2 gap-y-0.5 text-sm">
      <span>
        <span className="block font-medium">{label(day.date, today)}</span>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          {status ? (
            <>
              <span className={`inline-block size-2 rounded-full ${STATUS_DOT[status]}`} aria-hidden />
              {STATUS_WORD[status]}
            </>
          ) : (
            'Runs only'
          )}
        </span>
      </span>
      <span
        className="flex h-3 overflow-hidden rounded-sm bg-muted"
        role="img"
        aria-label={`${day.go} flyable, ${day.marginal} marginal, ${day.no} not flyable`}
      >
        <span className="bg-green-600" style={{ width: part(day.go) }} />
        <span className="bg-amber-400" style={{ width: part(day.marginal) }} />
        <span className="bg-slate-300 dark:bg-slate-600" style={{ width: part(day.no) }} />
      </span>
      <span className="text-right text-xs text-muted-foreground tabular-nums">
        {day.go} of {day.runs}
      </span>
      {held && (
        <span className="col-start-2 col-end-4 text-xs text-muted-foreground">
          Most runs without a window: {HELD_WORDS[held]}.
        </span>
      )}
    </li>
  );
}

/** How sure: ECMWF's 51 runs rated at the launch, beside the main forecast. */
export function HowSureCard({
  experiment,
  scores,
  followed,
}: {
  experiment: HowSureExperiment;
  /** The main forecast's days, to set beside the runs */
  scores: DayScore[] | null;
  /** A followed or private site, which SoarCast fetches the runs for */
  followed: boolean;
}) {
  if (experiment.why === 'failed') return null;
  const byDate = new Map((scores ?? []).map((s) => [s.date, s]));
  return (
    <Card className="gap-3 p-4 sm:p-6">
      <h3 className="text-lg font-semibold">How sure</h3>
      {experiment.days && experiment.days.length > 0 ? (
        <HowSureBody days={experiment.days} fetchedAt={experiment.fetchedAt} byDate={byDate} />
      ) : (
        <p className="text-sm text-muted-foreground">
          {followed
            ? 'SoarCast fetches this each morning. It shows by tomorrow.'
            : 'SoarCast fetches this only for Favorites and private sites. Add this site to Favorites and it shows by tomorrow.'}
        </p>
      )}
    </Card>
  );
}

function HowSureBody({
  days,
  fetchedAt,
  byDate,
}: {
  days: EnsembleDay[];
  fetchedAt: string;
  byDate: Map<string, DayScore>;
}) {
  const today = days[0].date;
  const both = days.filter((d) => byDate.has(d.date));
  const agreed = both.filter((d) => agrees(d, byDate.get(d.date)!)).length;
  return (
    <>
      <p className="text-sm text-muted-foreground">
        ECMWF runs its forecast {ENSEMBLE_RUNS} times at once, each from slightly different weather
        to start. Each bar shows how many runs give a flyable window at this launch. When most
        agree, the day is easier to call.
      </p>
      {both.length > 0 && (
        <p className="text-sm">
          The runs agree with the main forecast on {agreed} of {both.length} days.
        </p>
      )}
      <ul className="space-y-2" aria-label="Runs with a flyable window, by day">
        {days.map((d) => (
          <DayRow key={d.date} day={d} today={today} main={byDate.get(d.date)} />
        ))}
      </ul>
      <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="inline-block size-2 rounded-sm bg-green-600" aria-hidden /> Flyable
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block size-2 rounded-sm bg-amber-400" aria-hidden /> Marginal
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block size-2 rounded-sm bg-slate-300 dark:bg-slate-600" aria-hidden />{' '}
          Not flyable
        </span>
      </p>
      <p className="text-xs text-muted-foreground">
        The runs cover squares about {ENSEMBLE_GRID_KM} km across and have no thermal height, so
        they judge wind, gusts, rain and storms only. Fetched {fetchedWhen(fetchedAt)}.
      </p>
    </>
  );
}
