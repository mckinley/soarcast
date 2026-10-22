// Credits the data licences ask for: Open-Meteo (CC BY 4.0) wherever a
// forecast shows, ERA5 (Copernicus, CC BY 4.0) and Open-Meteo wherever a
// season does, Paragliding Earth (CC BY-SA 3.0) wherever its sites do, and
// kk7 (CC BY-NC-SA 4.0) wherever its thermal maps do, and GeoNames (CC BY
// 4.0) wherever a search lists sites near a town. A launch found from
// tracked flights credits Syncing Pilots, and OpenStreetMap (ODbL) for its
// name. A takeoff from OpenStreetMap credits OpenStreetMap (ODbL) and links
// its page there. Cross-country flights credit NOGA's map and XContest,
// whose flights it counts. The Guide's Data sources page
// (src/guide/pages/data-sources.md) lists them all.

import { Link } from 'react-router';
import type { SiteOrigin } from '@/lib/pgsites-client';

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

/** Seasons: ERA5, the record of past weather, through Open-Meteo's open copy. */
export function SeasonCredit({ className = '' }: { className?: string }) {
  return (
    <p className={`text-xs text-muted-foreground ${className}`}>
      Past weather: ERA5 from the{' '}
      <a href="https://climate.copernicus.eu" className={link} target="_blank" rel="noreferrer">
        Copernicus Climate Change Service
      </a>
      , through{' '}
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
      <Link to="/guide/data-sources#seasons" className={link}>
        Data sources
      </Link>
    </p>
  );
}

/**
 * Credit for one listed site: its Paragliding Earth page, for a launch found
 * from tracked flights Syncing Pilots and OpenStreetMap, or for a takeoff
 * from OpenStreetMap its page there.
 */
export function SiteSourceCredit({
  pgeLink,
  origin = 'pge',
  sourceUrl,
  className = '',
}: {
  pgeLink?: string | null;
  origin?: SiteOrigin;
  sourceUrl?: string | null;
  className?: string;
}) {
  if (origin === 'pilot') {
    return (
      <p className={`text-xs text-muted-foreground ${className}`}>
        No site guide lists this launch. A pilot shared it. Ask local pilots about the site&apos;s
        rules and landing before flying.{' '}
        <Link to="/guide/data-sources#launches-pilots-shared" className={link}>
          More
        </Link>
      </p>
    );
  }
  if (origin === 'osm') {
    return (
      <p className={`text-xs text-muted-foreground ${className}`}>
        No site guide lists this launch. It is a takeoff mapped in{' '}
        <a
          href={sourceUrl || 'https://www.openstreetmap.org'}
          className={link}
          target="_blank"
          rel="noreferrer"
        >
          OpenStreetMap
        </a>{' '}
        (
        <a
          href="https://www.openstreetmap.org/copyright"
          className={link}
          target="_blank"
          rel="noreferrer"
        >
          ODbL
        </a>
        ). Ask local pilots about the site&apos;s rules and landing before flying.{' '}
        <Link to="/guide/data-sources#takeoffs-from-openstreetmap" className={link}>
          More
        </Link>
      </p>
    );
  }
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

/** Where the cross-country flight counts come from: NOGA's map, built from XContest flights. */
export function NogaCredit({
  href = 'https://noga.es/paragliding/map/',
  className = '',
}: {
  /** NOGA's page for the place, or its map */
  href?: string | null;
  className?: string;
}) {
  return (
    <p className={`text-xs text-muted-foreground ${className}`}>
      Flights from{' '}
      <a
        href={href ?? 'https://noga.es/paragliding/map/'}
        className={link}
        target="_blank"
        rel="noreferrer"
      >
        NOGA&apos;s map of cross-country takeoffs
      </a>
      , counted from flights on{' '}
      <a href="https://www.xcontest.org" className={link} target="_blank" rel="noreferrer">
        XContest
      </a>{' '}
      ·{' '}
      <Link to="/guide/data-sources#cross-country-flights" className={link}>
        Data sources
      </Link>
    </p>
  );
}
