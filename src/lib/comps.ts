// Paragliding comps from pgsites (FAI's calendar plus World Cup rounds), as
// the site pages, the week and the Year page show them. Comps aren't a
// forecast input: a comp at a site means a busy launch and, often, free
// flyers waiting until the task has launched.

import type { PgComp } from './pgsites-client';
import { calculateDistance } from './site-utils';

export type CompDiscipline = PgComp['discipline'];

export interface Comp {
  id: string;
  name: string;
  /** YYYY-MM-DD, end inclusive */
  startDate: string;
  endDate: string;
  place: string;
  countryCode: string | null;
  /** English country name, set on the server so pages render it the same everywhere */
  country: string | null;
  category: 1 | 2 | null;
  discipline: CompDiscipline;
  series: PgComp['series'];
  /** The comp's own page, where pilots enter */
  url: string | null;
  latitude: number | null;
  longitude: number | null;
}

/** A comp within this distance of a site is held there: it shares the launches. */
export const COMP_RADIUS_KM = 25;

/** What a comp on the day means for a pilot who isn't in it. */
export const COMP_DAY_NOTE =
  'Comp pilots usually launch first in the task window, and launch and landing will be busy. Free flyers may have to wait.';

export const DISCIPLINE_LABEL: Record<CompDiscipline, string> = {
  xc: 'Cross-country',
  'hike-fly': 'Hike & fly',
  accuracy: 'Accuracy',
  acro: 'Acro',
};

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

let regionNames: Intl.DisplayNames | null | undefined;

/** "France" for "fr"; the code itself when the runtime has no names. */
export function countryName(code: string | null): string | null {
  if (!code) return null;
  if (regionNames === undefined) {
    try {
      regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
    } catch {
      regionNames = null;
    }
  }
  try {
    return regionNames?.of(code.toUpperCase()) ?? code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}

/** The flag emoji for an ISO alpha-2 code. */
export function countryFlag(code: string | null): string {
  if (!code || !/^[a-z]{2}$/i.test(code)) return '';
  return String.fromCodePoint(
    ...[...code.toUpperCase()].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65),
  );
}

export function compFromPg(c: PgComp): Comp {
  return {
    id: c.id,
    name: c.name,
    startDate: c.start_date,
    endDate: c.end_date,
    place: c.place,
    countryCode: c.country_code,
    country: countryName(c.country_code),
    category: c.category,
    discipline: c.discipline,
    series: c.series,
    url: c.url,
    latitude: c.latitude,
    longitude: c.longitude,
  };
}

/** Comps running on `date` (YYYY-MM-DD). */
export function compsOn<T extends Pick<Comp, 'startDate' | 'endDate'>>(
  comps: T[],
  date: string,
): T[] {
  return comps.filter((c) => c.startDate <= date && c.endDate >= date);
}

/** Comps running on any day from..to. */
export function compsBetween<T extends Pick<Comp, 'startDate' | 'endDate'>>(
  comps: T[],
  from: string,
  to: string,
): T[] {
  return comps.filter((c) => c.startDate <= to && c.endDate >= from);
}

/** Comps held within COMP_RADIUS_KM of a point. */
export function compsAround<T extends Pick<Comp, 'latitude' | 'longitude'>>(
  comps: T[],
  latitude: number,
  longitude: number,
): T[] {
  return comps.filter(
    (c) =>
      c.latitude != null &&
      c.longitude != null &&
      calculateDistance(latitude, longitude, c.latitude, c.longitude) <= COMP_RADIUS_KM,
  );
}

function parts(date: string) {
  return {
    y: date.slice(0, 4),
    m: MONTHS[Number(date.slice(5, 7)) - 1],
    d: Number(date.slice(8, 10)),
  };
}

/** "Jul 3–10, 2027", "Aug 28 – Sep 4, 2027" or "Dec 30, 2026 – Jan 2, 2027"; no year with `year: false`. */
export function compDates(comp: Pick<Comp, 'startDate' | 'endDate'>, { year = true } = {}): string {
  const a = parts(comp.startDate);
  const b = parts(comp.endDate);
  const y = (p: { y: string }) => (year ? `, ${p.y}` : '');
  if (comp.startDate === comp.endDate) return `${a.m} ${a.d}${y(a)}`;
  if (a.y !== b.y) return `${a.m} ${a.d}${y(a)} – ${b.m} ${b.d}${y(b)}`;
  if (a.m !== b.m) return `${a.m} ${a.d} – ${b.m} ${b.d}${y(b)}`;
  return `${a.m} ${a.d}–${b.d}${y(b)}`;
}

/** World Cup, Pre-World Cup, Cat 1 or Cat 2. */
export function compLevel(comp: Pick<Comp, 'series' | 'category'>): string | null {
  if (comp.series === 'pwc') return 'World Cup';
  if (comp.series === 'pre-pwc') return 'Pre-World Cup';
  if (comp.category) return `Cat ${comp.category}`;
  return null;
}

/** "May" for "2027-05"; "May 2027" with the year. */
export function monthLabel(month: string, { year = false, long = false } = {}): string {
  const name = (long ? MONTHS_LONG : MONTHS)[Number(month.slice(5, 7)) - 1];
  return year ? `${name} ${month.slice(0, 4)}` : name;
}

/**
 * Comps by the month they start in ("YYYY-MM"), in date order. A comp that
 * started before `firstMonth` and is still on files under `firstMonth`.
 */
export function groupByMonth<T extends Pick<Comp, 'startDate'>>(
  comps: T[],
  firstMonth = '',
): Array<{ month: string; comps: T[] }> {
  const groups = new Map<string, T[]>();
  for (const c of [...comps].sort((a, b) => a.startDate.localeCompare(b.startDate))) {
    const start = c.startDate.slice(0, 7);
    const month = start < firstMonth ? firstMonth : start;
    groups.set(month, [...(groups.get(month) ?? []), c]);
  }
  return [...groups].map(([month, list]) => ({ month, comps: list }));
}

/** The months from `from`'s month on, `count` of them, as "YYYY-MM". */
export function monthsFrom(from: string, count: number): string[] {
  const y = Number(from.slice(0, 4));
  const m = Number(from.slice(5, 7)) - 1;
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(y, m + i, 1));
    return d.toISOString().slice(0, 7);
  });
}

/**
 * The months a place usually holds comps, from the ones it has held: the
 * busiest months, at most three, in calendar order ("May and Sep").
 */
export function usualMonths(past: Pick<Comp, 'startDate'>[]): string | null {
  if (past.length === 0) return null;
  const counts = Array.from({ length: 12 }, () => 0);
  for (const c of past) counts[Number(c.startDate.slice(5, 7)) - 1]++;
  const top = Math.max(...counts);
  // A month that held one comp among several isn't a usual month
  const enough = top === 1 ? 1 : Math.max(2, Math.ceil(top / 2));
  const months = counts
    .map((n, i) => ({ n, i }))
    .filter(({ n }) => n >= enough)
    .sort((a, b) => b.n - a.n)
    .slice(0, 3)
    .sort((a, b) => a.i - b.i)
    .map(({ i }) => MONTHS[i]);
  return months.length === 1
    ? months[0]
    : `${months.slice(0, -1).join(', ')} and ${months[months.length - 1]}`;
}

export type Region = 'europe' | 'north-america' | 'latin-america' | 'asia' | 'oceania' | 'africa';

export const REGION_LABEL: Record<Region, string> = {
  europe: 'Europe',
  'north-america': 'US & Canada',
  'latin-america': 'Latin America',
  asia: 'Asia & Middle East',
  oceania: 'Oceania',
  africa: 'Africa',
};

// Where pilots would look for a country's comps: Turkey and the Caucasus with
// Europe (as CIVL groups them), Mexico with Latin America.
const REGION_COUNTRIES: Record<Region, string> = {
  europe:
    'ad al am at az ba be bg by ch cy cz de dk ee es fi fo fr gb ge gg gi gr hr hu ie im is it je li lt lu lv mc md me mk mt nl no pl pt ro rs ru se si sk sm tr ua va xk',
  'north-america': 'us ca gl bm pm',
  'latin-america':
    'mx gt bz sv hn ni cr pa cu do ht jm pr tt bb bs ag dm gd kn lc vc aw cw bq co ve ec pe bo br py uy ar cl gy sr gf',
  asia: 'ae af bd bh bn bt cn hk id il in iq ir jo jp kg kh kp kr kw kz la lb lk mm mn mo mv my np om ph pk ps qa sa sg sy th tj tl tm tw uz vn ye',
  oceania: 'au nz fj pg nc pf ws to vu sb ck nu',
  africa:
    'dz ao bj bw bf bi cm cv cf td km cd cg ci dj eg gq er sz et ga gm gh gn gw ke ls lr ly mg mw ml mr mu ma mz na ne ng rw st sn sc sl so za ss sd tz tg tn ug zm zw re yt',
};

const COUNTRY_REGION = new Map<string, Region>(
  (Object.entries(REGION_COUNTRIES) as Array<[Region, string]>).flatMap(([region, codes]) =>
    codes.split(' ').map((code) => [code, region] as [string, Region]),
  ),
);

export function countryRegion(code: string | null): Region | null {
  return code ? (COUNTRY_REGION.get(code.toLowerCase()) ?? null) : null;
}
