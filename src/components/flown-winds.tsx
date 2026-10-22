import { Link } from 'react-router';
import { Card } from '@/components/ui/card';
import {
  CALM_KMH,
  directionsInWords,
  flownOffListing,
  mainFlownDirections,
  MIN_WIND_FLOWN_DAYS,
  type FlownWinds,
  type WindSector,
  type WindsExperiment,
} from '@/lib/flown-winds';

const link = 'underline underline-offset-2 hover:text-foreground';
/** A direction with fewer days than this gets a faint bar: its share says little. */
const FEW_DAYS = 10;

/** "Oct 2024", the same on the server and in the browser. */
function monthName(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** The experiments at the foot of a site page, under their own heading. */
export function ExperimentsSection({ children }: { children: React.ReactNode }) {
  return (
    <section className="space-y-3" aria-labelledby="experiments">
      <div>
        <h2 id="experiments" className="text-lg font-semibold">
          Experiments
        </h2>
        <p className="text-sm text-muted-foreground">
          Ideas still being tested. They never change a day&apos;s rating. What each one is and how
          it tested:{' '}
          <Link to="/guide/experiments" className={link}>
            Experiments
          </Link>
          . Turn them off in{' '}
          <Link to="/settings#experiments" className={link}>
            Settings
          </Link>
          .
        </p>
      </div>
      {children}
    </section>
  );
}

function SectorRow({
  label,
  sector,
  top,
}: {
  label: string;
  sector: Pick<WindSector, 'days' | 'flown'> & { listed?: WindSector['listed'] };
  top: number;
}) {
  const share = sector.days ? sector.flown / sector.days : 0;
  return (
    <li className="grid grid-cols-[5.5rem_1fr_6.5rem] items-center gap-2 text-sm">
      <span className="font-medium">
        {label}
        {sector.listed && (
          <span className="ml-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
            listed
          </span>
        )}
      </span>
      <span className="h-3 rounded-sm bg-muted" aria-hidden>
        {share > 0 && (
          <span
            className={`block h-3 rounded-sm ${sector.days < FEW_DAYS ? 'bg-sky-600/30 dark:bg-sky-400/30' : 'bg-sky-600 dark:bg-sky-400'}`}
            style={{ width: `${Math.max(3, (share / top) * 100)}%` }}
          />
        )}
      </span>
      <span className="text-right text-xs text-muted-foreground tabular-nums">
        {sector.days ? `${sector.flown} of ${sector.days} days` : 'no days'}
      </span>
    </li>
  );
}

function WindsBody({ w }: { w: FlownWinds }) {
  const top = Math.max(
    0.01,
    ...[...w.sectors, w.calm].map((s) => (s.days ? s.flown / s.days : 0)),
  );
  const main = mainFlownDirections(w);
  const off = flownOffListing(w);
  return (
    <>
      <p className="text-sm text-muted-foreground">
        How often pilots flew from here with the wind from each direction at {w.hour}:00, the hour
        most flights here started. {monthName(w.fromDate)} to {monthName(w.toDate)}.
      </p>
      <ul className="space-y-1.5" aria-label="Share of days flown by wind direction">
        {w.sectors.map((s) => (
          <SectorRow key={s.direction} label={s.direction} sector={s} top={top} />
        ))}
        <SectorRow label="Calm" sector={w.calm} top={top} />
      </ul>
      <div className="space-y-1 text-sm">
        {main.length > 0 && (
          <p>
            Most of the {w.flownDays} flown days had wind from {directionsInWords(main)}.
          </p>
        )}
        {off &&
          (off.days > 0 ? (
            <p>
              On {off.days} of them the wind came from a direction the listing doesn&apos;t name:{' '}
              {directionsInWords(off.directions)}.
            </p>
          ) : (
            <p>Every flown day had wind from a listed direction, or calm.</p>
          ))}
      </div>
      <p className="text-xs text-muted-foreground">
        &quot;Listed&quot; marks the directions the site is listed for. A faint bar has fewer than{' '}
        {FEW_DAYS} days. Calm is under {CALM_KMH} km/h. The wind is from ERA5, a record of past weather in squares about 30 km across, at the
        launch&apos;s height. A valley or a lee can differ. Flights are from pilots&apos; live
        trackers on Syncing Pilots.
      </p>
    </>
  );
}

/** Wind on flown days: which directions pilots really flew the launch in. */
export function FlownWindsCard({
  experiment,
  followed,
}: {
  experiment: WindsExperiment;
  /** A followed or private site, which the season build keeps the wind for */
  followed: boolean;
}) {
  if (experiment.why === 'failed') return null;
  return (
    <Card className="gap-3 p-4 sm:p-6">
      <h3 className="text-lg font-semibold">Wind on flown days</h3>
      {experiment.winds ? (
        <WindsBody w={experiment.winds} />
      ) : experiment.why === 'no-winds' ? (
        <p className="text-sm text-muted-foreground">
          {followed
            ? 'SoarCast is still gathering the wind for this site. It shows within a day.'
            : 'SoarCast keeps the wind for this only at Favorites and private sites. Add this site to Favorites and it shows within a day.'}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          Fewer than {MIN_WIND_FLOWN_DAYS} days with tracked flights from here, too few to say.
        </p>
      )}
    </Card>
  );
}
