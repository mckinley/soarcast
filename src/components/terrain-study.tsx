import { Card } from '@/components/ui/card';
import { COMPASS_POINTS } from '@/lib/site-utils';
import { COPERNICUS_DEM_CREDIT } from '@/lib/terrain-study/dem';
import {
  faceFits,
  FLAT_SLOPE_DEGREES,
  LEE_RATIO,
  type SunOnLaunch,
  type TerrainExperiment,
  type TerrainStudy,
} from '@/lib/terrain-study';
import { compassPoint } from '@/lib/wind-now';

/** A listed height this far (m) from the ground at the pin suggests the pin is off the launch. */
const PIN_OFF_M = 100;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "SW", "SW and W", "N, NE and E". */
function inWords(directions: number[]): string {
  const names = directions.map(compassPoint);
  return names.length <= 1
    ? (names[0] ?? '')
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

const meters = (m: number) => `${m.toLocaleString('en-US')} m`;
const km = (m: number) => (m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`);

function SlopeLines({
  study,
  ideal,
  ok,
  listedAltitude,
}: {
  study: TerrainStudy;
  ideal: number[];
  ok: number[];
  listedAltitude: number | null;
}) {
  const { face, suggestion } = study;
  const listed = [...ideal, ...ok].sort((a, b) => a - b);
  const pinOff =
    listedAltitude != null &&
    listedAltitude > 0 &&
    Math.abs(study.ground - listedAltitude) > PIN_OFF_M;
  return (
    <div className="space-y-1 text-sm">
      {face.slope < FLAT_SLOPE_DEGREES ? (
        <p>
          The ground at the pin is nearly flat ({Math.round(face.slope)}°), so its slope says little
          about the wind the launch needs.
        </p>
      ) : (
        <>
          <p>
            The ground at the pin faces {compassPoint(face.direction)} and slopes{' '}
            {Math.round(face.slope)}°.
          </p>
          {listed.length === 0 ? (
            suggestion.good.length + suggestion.ok.length > 0 && (
              <p>
                No wind is listed for this launch. The slope suits wind from{' '}
                {inWords(suggestion.good.length ? suggestion.good : suggestion.ok)}.
              </p>
            )
          ) : faceFits(face, listed) ? (
            <p>That fits the listed wind from {inWords(listed)}.</p>
          ) : (
            <p>
              The listed wind is from {inWords(listed)}, which doesn&apos;t fit the slope. The pin
              may sit off the launch, or the launch faces another way than the ground round it.
            </p>
          )}
        </>
      )}
      {pinOff && (
        <p>
          The ground at the pin is {meters(study.ground)}, but the launch is listed at{' '}
          {meters(listedAltitude!)}. The pin may be off the launch.
        </p>
      )}
    </div>
  );
}

function LeeLines({ study, listed }: { study: TerrainStudy; listed: number[] }) {
  const lee = study.upwind.filter((u) => u.lee && u.height != null && u.distance != null);
  return (
    <div className="space-y-1.5">
      <h4 className="text-sm font-semibold">Higher ground upwind</h4>
      {lee.length === 0 ? (
        <p className="text-sm">No higher ground lies close upwind in any direction.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {lee.map((u) => (
            <li key={u.direction}>
              <span className="font-medium">Wind from {compassPoint(u.direction)}</span>
              {listed.includes(u.direction) && (
                <span className="ml-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                  Listed
                </span>
              )}
              : ground {meters(u.height!)} higher, {km(u.distance!)} away.
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">
        Wind that crosses higher ground before it reaches the launch can be rough in its lee. Ground
        counts here when it is closer than {LEE_RATIO} times its height above the launch. The
        stronger the wind, the farther the rough air reaches.
      </p>
    </div>
  );
}

const sunText = (s: SunOnLaunch) =>
  s.first && s.last ? `${s.first} to ${s.last}` : 'No sun on the launch';

function SunLines({ today, months }: { today: SunOnLaunch; months: SunOnLaunch[] }) {
  return (
    <div className="space-y-1.5">
      <h4 className="text-sm font-semibold">Sun on the launch</h4>
      <p className="text-sm">
        Today: {sunText(today)}
        {today.hours > 0 && `, ${today.hours} hours`}.
      </p>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-muted-foreground sm:grid-cols-3">
        {months.map((m, i) => (
          <li key={MONTHS[i]}>
            <span className="inline-block w-8 font-medium text-foreground">{MONTHS[i]}</span>
            {m.first && m.last ? `${m.first} to ${m.last}` : 'none'}
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        Local times when the sun stands above the skyline and shines onto the slope, on the 15th of
        each month. Clouds aren&apos;t counted.
      </p>
    </div>
  );
}

/** Terrain around the launch: the slope at the pin, higher ground upwind and the sun. */
export function TerrainStudyCard({
  experiment,
  ideal,
  ok,
  listedAltitude,
}: {
  experiment: TerrainExperiment;
  /** The listed (or the pilot's own) wind directions, degrees */
  ideal: number[];
  ok: number[];
  listedAltitude: number | null;
}) {
  if (!experiment.view) return null;
  const { study, today, months } = experiment.view;
  const listed = [...ideal, ...ok].filter((d) => COMPASS_POINTS.some((p) => p.degrees === d));
  return (
    <Card className="gap-3 p-4 sm:p-6">
      <h3 className="text-lg font-semibold">Terrain around the launch</h3>
      <p className="text-sm text-muted-foreground">
        Read once from satellite heights: a height every 30 m near the pin, every 60 m out to 15 km.
      </p>
      <SlopeLines study={study} ideal={ideal} ok={ok} listedAltitude={listedAltitude} />
      <LeeLines study={study} listed={listed} />
      {today && months && <SunLines today={today} months={months} />}
      <p className="text-xs text-muted-foreground">
        The heights are of the surface, trees and buildings included. Heights: Copernicus DEM
        GLO-30, {COPERNICUS_DEM_CREDIT}
      </p>
    </Card>
  );
}
