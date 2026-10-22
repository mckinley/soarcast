// Credits the data licences ask for: Open-Meteo (CC BY 4.0) wherever a
// forecast shows, Paragliding Earth (CC BY-SA 3.0) wherever its sites do, and
// kk7 (CC BY-NC-SA 4.0) wherever its thermal maps do, and GeoNames (CC BY
// 4.0) wherever a search lists sites near a town. A launch found from
// tracked flights credits Syncing Pilots, and OpenStreetMap (ODbL) for its
// name. The Guide's Data sources page (src/guide/pages/data-sources.md)
// lists them all.

import { Link } from 'react-router';

const link = 'underline underline-offset-2 hover:text-foreground';

export const PGE_ATTRIBUTION =
  'Sites: <a href="https://www.paraglidingearth.com">Paragliding Earth</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC BY-SA 3.0</a>)';

export const KK7_ATTRIBUTION =
  'Thermals: <a href="https://thermal.kk7.ch">thermal.kk7.ch</a> (<a href="https://creativecommons.org/licenses/by-nc-sa/4.0/">CC BY-NC-SA 4.0</a>)';

export function ForecastCredit({ className = '' }: { className?: string }) {
  return (
    <p className={`text-xs text-muted-foreground ${className}`}>
      Weather data by{' '}
      <a href="https://open-meteo.com/" className={link} target="_blank" rel="noreferrer">
        Open-Meteo.com
      </a>{' '}
      (
      <a
        href="https://creativecommons.org/licenses/by/4.0/"
        className={link}
        target="_blank"
        rel="noreferrer"
      >
        CC BY 4.0
      </a>
      ) ·{' '}
      <Link to="/guide/data-sources" className={link}>
        Data sources
      </Link>
    </p>
  );
}

/**
 * Credit for one listed site: its Paragliding Earth page, or for a launch
 * found from tracked flights, Syncing Pilots and OpenStreetMap.
 */
export function SiteSourceCredit({
  pgeLink,
  origin = 'pge',
  className = '',
}: {
  pgeLink?: string | null;
  origin?: 'pge' | 'flown';
  className?: string;
}) {
  if (origin === 'flown') {
    return (
      <p className={`text-xs text-muted-foreground ${className}`}>
        No site guide lists this launch. SoarCast found it from flights{' '}
        <a href="https://syncingpilots.com" className={link} target="_blank" rel="noreferrer">
          Syncing Pilots
        </a>{' '}
        tracked. Its name comes from{' '}
        <a
          href="https://www.openstreetmap.org/copyright"
          className={link}
          target="_blank"
          rel="noreferrer"
        >
          OpenStreetMap
        </a>{' '}
        (ODbL). Ask local pilots about the site&apos;s rules and landing before flying.{' '}
        <Link to="/guide/data-sources#launches-found-from-flights" className={link}>
          More
        </Link>
      </p>
    );
  }
  return (
    <p className={`text-xs text-muted-foreground ${className}`}>
      Site information from{' '}
      <a
        href={pgeLink || 'https://www.paraglidingearth.com'}
        className={link}
        target="_blank"
        rel="noreferrer"
      >
        Paragliding Earth
      </a>{' '}
      (
      <a
        href="https://creativecommons.org/licenses/by-sa/3.0/"
        className={link}
        target="_blank"
        rel="noreferrer"
      >
        CC BY-SA 3.0
      </a>
      ). Check the site&apos;s rules and the local club before flying.
    </p>
  );
}

/** Where comps come from; their own pages have the final dates and entry. */
export function CompsCredit({ className = '' }: { className?: string }) {
  return (
    <p className={`text-xs text-muted-foreground ${className}`}>
      Comps from the{' '}
      <a
        href="https://www.fai.org/commission/civl"
        className={link}
        target="_blank"
        rel="noreferrer"
      >
        FAI sporting calendar
      </a>{' '}
      and the{' '}
      <a href="https://pwca.org" className={link} target="_blank" rel="noreferrer">
        Paragliding World Cup
      </a>
      . Dates and places can change. Check the comp&apos;s own page before planning around it.
    </p>
  );
}

/** Credit for the town names a site search found. */
export function PlacesCredit({ className = '' }: { className?: string }) {
  return (
    <span className={`text-xs text-muted-foreground ${className}`}>
      Places:{' '}
      <a href="https://www.geonames.org/" className={link} target="_blank" rel="noreferrer">
        GeoNames
      </a>{' '}
      (
      <a
        href="https://creativecommons.org/licenses/by/4.0/"
        className={link}
        target="_blank"
        rel="noreferrer"
      >
        CC BY 4.0
      </a>
      )
    </span>
  );
}
