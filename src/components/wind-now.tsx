import { Card } from '@/components/ui/card';
import { ageText } from '@/lib/map-layers';
import {
  heightText,
  readingText,
  WIND_ARROW_PATH,
  windColor,
  type NearStation,
  type WindStation,
} from '@/lib/wind-now';

const ARROW_COLORS = { green: '#16a34a', amber: '#d97706', red: '#dc2626' } as const;

/** An arrow pointing the way the wind blows, coloured by its strength. */
export function WindArrow({
  station,
  size = 18,
}: {
  station: Pick<WindStation, 'direction' | 'speed' | 'gust'>;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden
      style={{ transform: `rotate(${station.direction + 180}deg)` }}
    >
      <path d={WIND_ARROW_PATH} fill={ARROW_COLORS[windColor(station)]} />
    </svg>
  );
}

/** The wind the nearest stations measure now. Nothing when no station is near. */
export function WindNowCard({
  stations,
  checkedAt,
  launchAltitude,
}: {
  stations: NearStation[];
  checkedAt: number;
  launchAltitude: number | null;
}) {
  if (stations.length === 0) return null;
  return (
    <Card className="gap-2 p-4 sm:p-6">
      <h2 className="text-lg font-semibold">Wind now</h2>
      <ul className="space-y-2">
        {stations.map((s) => {
          const height = heightText(s.altitude, launchAltitude);
          return (
            <li key={s.id} className="flex items-start gap-2 text-sm">
              <span className="mt-0.5 shrink-0">
                <WindArrow station={s} />
              </span>
              <span>
                <span className="font-medium">{readingText(s)}</span>
                <span className="text-muted-foreground">
                  {' '}
                  · {ageText(s.at * 1000, checkedAt * 1000)}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {s.url ? (
                    <a
                      href={s.url}
                      className="underline underline-offset-2"
                      target="_blank"
                      rel="noreferrer"
                    >
                      {s.name}
                    </a>
                  ) : (
                    s.name
                  )}
                  , {s.distanceKm < 1 ? 'under 1' : Math.round(s.distanceKm)} km away
                  {height ? `, ${height}` : ''}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted-foreground">
        Measured by weather stations, not forecast. Gathered by{' '}
        <a
          href="https://winds.mobi"
          className="underline underline-offset-2"
          target="_blank"
          rel="noreferrer"
        >
          winds.mobi
        </a>{' '}
        from {[...new Set(stations.map((s) => s.provider))].join(', ')}.
      </p>
    </Card>
  );
}
