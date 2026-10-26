import type { ReactNode } from 'react';
import { Form, Link, useFetcher, useLoaderData } from 'react-router';
import type { Route } from './+types/planning';
import { eq } from 'drizzle-orm';
import { getDb } from '~/app/lib/db.server';
import { getSession, requireAuth } from '~/app/lib/auth.server';
import { ensureLaunchSite } from '~/app/lib/launch-sites.server';
import { putInNamedArea } from '~/app/lib/site-areas.server';
import { compsWorldwide } from '~/app/lib/comps.server';
import { allNogaTakeoffs } from '~/app/lib/noga.server';
import {
  destinationSeasons,
  rowStats,
  seasonSiteRef,
  seasonsForSites,
  type SeasonRow,
} from '~/app/lib/seasons.server';
import { customSites, launchSites, userFavoriteSites } from '~/db/schema';
import {
  COMP_RADIUS_KM,
  REGION_LABEL,
  compDates,
  compsAround,
  countryFlag,
  countryName,
  countryRegion,
  groupByMonth,
  monthLabel,
  monthsFrom,
  type Comp,
  type CompDiscipline,
  type Region,
} from '~/lib/comps';
import { launchSiteToSite } from '~/lib/launch-sites';
import { customSiteToSite } from '~/lib/custom-sites';
import { keepsMountainMargins } from '~/app/lib/mountain-margins.server';
import { getPgsitesApiKey, pgsitesSlug } from '~/lib/pgsites-client';
import {
  AREAS,
  AREA_BY_SLUG,
  AREA_RADIUS_KM,
  DESTINATIONS,
  DESTINATION_BY_SLUG,
  type Destination,
} from '~/lib/destinations';
import { anyGoSharesFromStats, SEASON_YEARS, statsMonths, type SeasonStats } from '~/lib/seasons';
import { GOAL_LABEL } from '~/lib/site-goals';
import { aboutPerYear, regionFlights, siteFlights, type NogaFlights } from '~/lib/noga';
import type { Site } from '~/types';
import { CompName, CompRow } from '@/components/site-comps';
import { CompsCredit, NogaCredit, SeasonCredit } from '@/components/data-credits';
import { PlanningMapWrapper } from '@/components/planning-map-wrapper';
import type { PlanningMapPoint, PlanningMapProps } from '@/components/planning-map';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, MapPin, Star, Trophy } from 'lucide-react';
import { launchSiteSlug } from '~/lib/site-address';

/** How many years ahead the start month can be. */
const YEARS_AHEAD = 5;

const VIEWS = { where: 'Where to fly', favorites: 'Favorites', comps: 'Comps' } as const;
type View = keyof typeof VIEWS;

/** How long a window to plan: a trip, a season, a year or two. */
const SPANS = {
  '1': '1 month',
  '3': '3 months',
  '6': '6 months',
  '12': '1 year',
  '24': '2 years',
} as const;
type Span = keyof typeof SPANS;

// A trip is planned month by month; sites and comps a year at a time
const DEFAULT_SPAN: Record<View, Span> = { where: '1', favorites: '12', comps: '12' };

const KINDS = {
  flying: { label: 'Cross-country & hike and fly', disciplines: ['xc', 'hike-fly'] },
  xc: { label: 'Cross-country', disciplines: ['xc'] },
  'hike-fly': { label: 'Hike & fly', disciplines: ['hike-fly'] },
  accuracy: { label: 'Accuracy', disciplines: ['accuracy'] },
  acro: { label: 'Acro', disciplines: ['acro'] },
  all: { label: 'All', disciplines: [] },
} satisfies Record<string, { label: string; disciplines: CompDiscipline[] }>;
type Kind = keyof typeof KINDS;

const LEVELS = {
  all: 'Any level',
  'world-cup': 'World Cup',
  cat1: 'Cat 1',
  cat2: 'Cat 2',
} as const;
type Level = keyof typeof LEVELS;

const REGIONS = { all: 'Worldwide', ...REGION_LABEL } as const;
type RegionFilter = Region | 'all';

const GOALS = { soar: 'Soaring days', great: 'Great days' } as const;
type WhereGoal = keyof typeof GOALS;

/** Where to fly ranks by go days, or by the long cross-country flights pilots logged there. */
const SORTS = { go: 'Most go days', xc: 'Most cross-country flights' } as const;
type Sort = keyof typeof SORTS;

/** Where to fly ranks flying areas, or whole countries. */
const GROUPS = { area: 'Areas', country: 'Countries' } as const;
type Group = keyof typeof GROUPS;

// Left out of links when they're the value
const DEFAULT_FILTERS: Record<string, string> = {
  view: 'where',
  kind: 'flying',
  level: 'all',
  region: 'all',
  goal: 'soar',
  sort: 'go',
  by: 'area',
};

type Query = Record<string, string>;

function pick<T extends string>(value: string | null, options: Record<T, unknown>, fallback: T): T {
  return value && value in options ? (value as T) : fallback;
}

function planningHref(query: Query, change: Record<string, string>): string {
  const params = new URLSearchParams(
    Object.entries({ ...query, ...change }).filter(
      ([k, v]) => v !== '' && v !== DEFAULT_FILTERS[k],
    ),
  );
  return params.size > 0 ? `/planning?${params}` : '/planning';
}

function matchesLevel(comp: Comp, level: Level): boolean {
  if (level === 'world-cup') return comp.series === 'pwc' || comp.series === 'pre-pwc';
  if (level === 'cat1') return comp.category === 1;
  if (level === 'cat2') return comp.category === 2;
  return true;
}

/** "YYYY-MM" plus n months. */
function addMonths(month: string, n: number): string {
  const d = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

/** "Nov 2026", or "Nov 2026 to Jan 2027". */
function windowLabel(months: string[]): string {
  const first = monthLabel(months[0], { year: true });
  return months.length === 1
    ? first
    : `${first} to ${monthLabel(months[months.length - 1], { year: true })}`;
}

/** A comp in the calendar, with the favorite site it's held at, if any. */
export interface PlanningComp extends Comp {
  nearSite: { name: string; href: string } | null;
}

/** A flying area, country, launch or favorite site across the window. */
interface PlaceRow {
  key: string;
  name: string;
  /** Where it opens; null for a launch not rated yet */
  href: string | null;
  /** An area or country: its launches, best first, each with its share over the window */
  parts?: Array<{ name: string; href: string; share: number }>;
  /** Under the name: the country, or the site's goal */
  detail: string;
  flag: string | null;
  /** Go share for the goal in each window month, 0-1; null before the place is rated */
  shares: number[] | null;
  /** Mean share over the window, to rank by */
  avg: number;
  /** Comps starting at the place in each window month */
  comps: Comp[][];
  /** Where to fly over one month: the other goal's share */
  other?: { label: string; share: number };
  /** Cross-country flights a year from the place in each window month (NOGA); null when none near */
  xc?: PlaceXc | null;
}

/** A place's cross-country flights in the window, from NOGA's site or regions. */
interface PlaceXc {
  perMonth: number[];
  /** Mean over the window, to rank by */
  avg: number;
  /** NOGA's site or region the flights are from */
  name: string;
  href: string | null;
}

export function meta() {
  return [
    { title: 'Planning | SoarCast' },
    {
      name: 'description',
      content: `Where and when the paragliding is good, month by month from ${SEASON_YEARS} years of past weather, and the comps worldwide to plan trips around.`,
    },
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env as Env;
  const url = new URL(request.url);
  const q = url.searchParams;

  const today = new Date().toISOString().slice(0, 10);
  const thisMonth = today.slice(0, 7);
  const lastMonth = `${Number(today.slice(0, 4)) + YEARS_AHEAD}-12`;

  const view = pick<View>(q.get('view') === 'mine' ? 'favorites' : q.get('view'), VIEWS, 'where');
  const kind = pick<Kind>(q.get('kind'), KINDS, 'flying');
  const level = pick<Level>(q.get('level'), LEVELS, 'all');
  const region = pick<RegionFilter>(q.get('region'), REGIONS, 'all');
  const goal = pick<WhereGoal>(q.get('goal'), GOALS, 'soar');
  const sort = pick<Sort>(q.get('sort'), SORTS, 'go');
  const by = pick<Group>(q.get('by'), GROUPS, 'area');
  // Where to fly opened on one area or country lists its launches
  const inArea = AREA_BY_SLUG.has(q.get('area') ?? '') ? q.get('area')! : null;
  const inCountry = inArea ? null : (/^[a-z]{2}$/.exec(q.get('country') ?? '')?.[0] ?? null);

  // The window: any month from now to YEARS_AHEAD out, for a month to two years
  const fromParam = q.get('from');
  const validFrom =
    fromParam && /^\d{4}-(0[1-9]|1[0-2])$/.test(fromParam) && fromParam >= thisMonth
      ? fromParam <= lastMonth
        ? fromParam
        : lastMonth
      : null;
  const from = validFrom ?? (view === 'where' ? addMonths(thisMonth, 1) : thisMonth);
  const spanParam = q.get('span');
  const span = pick<Span>(spanParam, SPANS, DEFAULT_SPAN[view]);
  const months = monthsFrom(`${from}-01`, Number(span));
  const end = months[months.length - 1];
  const compsFrom = from === thisMonth ? today : `${from}-01`;
  const compsTo = new Date(Date.UTC(Number(end.slice(0, 4)), Number(end.slice(5, 7)), 0))
    .toISOString()
    .slice(0, 10);

  // What the URL set, so links keep it and leave the rest to each view's defaults
  const query: Query = { view };
  if (validFrom) query.from = validFrom;
  if (spanParam && spanParam in SPANS) query.span = span;
  if (goal !== 'soar') query.goal = goal;
  if (sort !== 'go') query.sort = sort;
  if (region !== 'all') query.region = region;
  if (kind !== 'flying') query.kind = kind;
  if (level !== 'all') query.level = level;
  if (by !== 'area') query.by = by;
  if (inArea) query.area = inArea;
  if (inCountry) query.country = inCountry;

  const [comps, session] = await Promise.all([
    compsWorldwide(env, { from: compsFrom, to: compsTo, disciplines: KINDS[kind].disciplines }),
    getSession(request, env),
  ]);
  const db = getDb(env);

  // Favorite and private sites, rated the way their pages rate them
  let ownSites: Array<{ siteRef: string; site: Site; href: string }> = [];
  // Followed listed sites by pgsites id, with the area each is in
  const followedPgIds = new Map<string, string | null>();
  if (session?.user?.id) {
    const [followed, customs, margins] = await Promise.all([
      db
        .select({ favorite: userFavoriteSites, site: launchSites })
        .from(userFavoriteSites)
        .innerJoin(launchSites, eq(launchSites.id, userFavoriteSites.siteId))
        .where(eq(userFavoriteSites.userId, session.user.id)),
      db.select().from(customSites).where(eq(customSites.userId, session.user.id)),
      keepsMountainMargins(db, session.user.id),
    ]);
    for (const f of followed) followedPgIds.set(f.site.pgsitesId, f.favorite.areaId);
    ownSites = [
      ...followed.map((f) => ({
        siteRef: seasonSiteRef('pgsites', f.site.pgsitesId),
        site: launchSiteToSite(f.site, f.favorite, margins),
        href: `/sites/${launchSiteSlug(f.site)}`,
      })),
      ...customs.map((c) => ({
        siteRef: seasonSiteRef('custom', c.id),
        site: customSiteToSite(c, margins),
        href: `/sites/custom/${c.id}`,
      })),
    ].sort((a, b) => a.site.name.localeCompare(b.site.name));
  }

  /** Comps starting at a place in each window month. */
  const compsByMonth = (latitude: number, longitude: number) => {
    const near = compsAround(comps ?? [], latitude, longitude);
    return months.map((m) => near.filter((c) => c.startDate.slice(0, 7) === m));
  };
  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const byGo = (a: PlaceRow, b: PlaceRow) =>
    (b.shares ? 1 : 0) - (a.shares ? 1 : 0) || b.avg - a.avg || a.name.localeCompare(b.name);
  const byRank =
    view === 'where' && sort === 'xc'
      ? (a: PlaceRow, b: PlaceRow) => (b.xc?.avg ?? -1) - (a.xc?.avg ?? -1) || byGo(a, b)
      : byGo;
  // Cross-country flights from NOGA's copy, for Where to fly and Favorites
  const noga = view === 'comps' ? [] : await allNogaTakeoffs(db);
  /** Cross-country flights in each window month. */
  const xcInWindow = (f: NogaFlights | null): PlaceXc | null => {
    if (!f) return null;
    const perMonth = months.map((m) => f.perYear[Number(m.slice(5, 7)) - 1]);
    return { perMonth, avg: mean(perMonth), name: f.name, href: f.href };
  };

  let places: PlaceRow[] = [];
  let destinationsRated = 0;

  if (view === 'favorites' && ownSites.length > 0) {
    const seasons = await seasonsForSites(db, ownSites, today);
    places = ownSites
      .map(({ siteRef, site, href }): PlaceRow => {
        const season = seasons.get(siteRef);
        const shares = season
          ? months.map((m) => season.months[Number(m.slice(5, 7)) - 1].goShare)
          : null;
        return {
          key: href,
          name: site.name,
          href,
          detail: GOAL_LABEL[site.goal ?? 'soar'],
          flag: null,
          shares,
          avg: shares ? mean(shares) : 0,
          comps: compsByMonth(site.latitude, site.longitude),
          xc: xcInWindow(siteFlights(noga, site.latitude, site.longitude)),
        };
      })
      .sort(byRank);
  }

  let opened: {
    name: string;
    launches: number;
    /** A flying area that can be saved to Favorites as one area */
    save: { area: string; listed: number; saved: boolean; savedIn: string | null } | null;
  } | null = null;
  let pending: string[] = [];
  let mapPoints: PlanningMapPoint[] = [];
  let mapExtents: PlanningMapProps['extents'] = [];
  if (view === 'where') {
    const rows = await destinationSeasons(db);
    destinationsRated = rows.length;
    const rated = new Map<string, Launch>();
    for (const row of rows) {
      const dest = DESTINATION_BY_SLUG.get(row.destination ?? '');
      if (dest) rated.set(dest.slug, { row, dest, stats: rowStats(row) });
    }
    const otherGoal: WhereGoal = goal === 'great' ? 'soar' : 'great';
    const otherLabel = otherGoal === 'great' ? 'great' : 'soar';
    /** Go share in each window month, from calendar-month shares. */
    const inWindow = (byCal: number[]) => months.map((m) => byCal[Number(m.slice(5, 7)) - 1]);
    const count = (n: number, one: string) =>
      `${n} ${one}${n === 1 ? '' : one.endsWith('h') ? 'es' : 's'}`;
    const inRegion = (d: Destination) =>
      region === 'all' || countryRegion(d.countryCode) === region;

    /** A launch, rated or not yet. */
    const launchRow = (dest: Destination): PlaceRow => {
      const l = rated.get(dest.slug);
      const shares = l ? inWindow(launchShares(l, goal)) : null;
      const latitude = l?.row.latitude ?? dest.latitude;
      const longitude = l?.row.longitude ?? dest.longitude;
      return {
        key: dest.slug,
        name: dest.name,
        href: l
          ? `/sites/${pgsitesSlug(l.row.name ?? dest.name, l.row.siteRef.replace(/^pg:/, ''))}`
          : null,
        detail: countryName(dest.countryCode) ?? '',
        flag: countryFlag(dest.countryCode),
        shares,
        avg: shares ? mean(shares) : 0,
        comps: compsByMonth(latitude, longitude),
        xc: xcInWindow(siteFlights(noga, latitude, longitude)),
        other: l
          ? { label: otherLabel, share: mean(inWindow(launchShares(l, otherGoal))) }
          : undefined,
      };
    };

    /** Areas or countries, each a go on a day when any of its rated launches was. */
    const groupRows = (group: Group): PlaceRow[] => {
      const groups = new Map<string, Destination[]>();
      for (const dest of DESTINATIONS.filter(inRegion)) {
        const key = group === 'country' ? dest.countryCode : dest.area;
        groups.set(key, [...(groups.get(key) ?? []), dest]);
      }
      return [...groups]
        .map(([key, dests]): PlaceRow => {
          const members = dests.flatMap((dest) => rated.get(dest.slug) ?? []);
          const share = (g: WhereGoal) =>
            inWindow(
              anyGoSharesFromStats(
                members.map((l) => l.stats),
                g,
              ),
            );
          const shares = members.length > 0 ? share(goal) : null;
          const parts = dests.map(launchRow).sort(byRank);
          const codes = [...new Set(dests.map((dest) => dest.countryCode))];
          const areas = [...new Set(dests.map((dest) => dest.area))];
          return {
            key,
            name:
              group === 'country'
                ? (countryName(key) ?? key)
                : (AREA_BY_SLUG.get(key)?.name ?? key),
            href: planningHref(query, group === 'country' ? { country: key } : { area: key }),
            detail:
              group === 'country'
                ? `${areas.length === 1 ? (AREA_BY_SLUG.get(areas[0])?.name ?? '') : count(areas.length, 'area')} · ${count(dests.length, 'launch')}`
                : `${codes.map((c) => countryName(c)).join(', ')} · ${count(dests.length, 'launch')}`,
            flag: codes.map((c) => countryFlag(c)).join(' '),
            shares,
            avg: shares ? mean(shares) : 0,
            comps: months.map((_, i) => uniqueComps(parts.flatMap((p) => p.comps[i]))),
            xc: xcInWindow(
              regionFlights(
                noga,
                dests.map((dest) => {
                  const l = rated.get(dest.slug);
                  return {
                    latitude: l?.row.latitude ?? dest.latitude,
                    longitude: l?.row.longitude ?? dest.longitude,
                  };
                }),
              ),
            ),
            other: shares ? { label: otherLabel, share: mean(share(otherGoal)) } : undefined,
            parts: parts
              .filter((p) => p.shares && p.href)
              .map((p) => ({ name: p.name.replace(/ \(.*\)$/, ''), href: p.href!, share: p.avg })),
          };
        })
        .sort(byRank);
    };

    if (inArea || inCountry) {
      const dests = DESTINATIONS.filter((dest) =>
        inArea ? dest.area === inArea : dest.countryCode === inCountry,
      );
      // Its launches found on Paragliding Earth can be saved; saved when all are favorites
      const listed = dests.flatMap(
        (dest) => rated.get(dest.slug)?.row.siteRef.replace(/^pg:/, '') ?? [],
      );
      opened = {
        name: inArea ? AREA_BY_SLUG.get(inArea)!.name : (countryName(inCountry) ?? inCountry!),
        launches: dests.length,
        save:
          inArea && listed.length > 0
            ? {
                area: inArea,
                listed: listed.length,
                saved: listed.every((id) => followedPgIds.has(id)),
                savedIn: followedPgIds.get(listed[0]) ?? null,
              }
            : null,
      };
      places = dests.map(launchRow).sort(byRank);
      mapPoints = dests.map((dest) => {
        const row = places.find((p) => p.key === dest.slug)!;
        return {
          key: dest.slug,
          name: dest.name,
          href: row.href,
          latitude: dest.latitude,
          longitude: dest.longitude,
          share: row.shares ? row.avg : null,
          detail: row.detail,
        };
      });
      mapExtents = [...new Set(dests.map((dest) => dest.area))].map((slug) => {
        const a = AREA_BY_SLUG.get(slug)!;
        return { key: slug, latitude: a.latitude, longitude: a.longitude };
      });
    } else {
      const areaRows = groupRows('area');
      const rows = by === 'country' ? groupRows('country') : areaRows;
      // The ones not rated yet read as one line under the ranking
      places = rows.filter((row) => row.shares);
      pending = rows.filter((row) => !row.shares).map((row) => row.name);
      // The map always shows the areas: how the world is divided up here
      mapPoints = areaRows.map((row) => {
        const a = AREA_BY_SLUG.get(row.key)!;
        return {
          key: row.key,
          name: row.name,
          href: row.href,
          latitude: a.latitude,
          longitude: a.longitude,
          share: row.shares ? row.avg : null,
          detail: row.detail,
        };
      });
      mapExtents = mapPoints.map((p) => ({
        key: p.key,
        latitude: p.latitude,
        longitude: p.longitude,
      }));
    }
  }

  const nearOwnSite = (c: Comp) =>
    c.latitude != null && c.longitude != null
      ? ownSites.find((s) => compsAround([c], s.site.latitude, s.site.longitude).length > 0)
      : undefined;
  const shown: PlanningComp[] =
    view === 'comps'
      ? (comps ?? [])
          .filter(
            (c) =>
              matchesLevel(c, level) &&
              (region === 'all' || countryRegion(c.countryCode) === region),
          )
          .map((c) => {
            const site = nearOwnSite(c);
            return { ...c, nearSite: site ? { name: site.site.name, href: site.href } : null };
          })
      : [];

  return {
    view,
    query,
    from,
    span,
    months,
    firstMonth: thisMonth,
    lastMonth,
    filters: { kind, level, region, goal, sort, by },
    comps: shown,
    failed: comps === null,
    signedIn: !!session?.user?.id,
    hasOwnSites: ownSites.length > 0,
    places,
    destinationsRated,
    opened,
    pending,
    mapPoints,
    mapExtents,
  };
}

/**
 * Saves a flying area: its launches found on Paragliding Earth go into
 * Favorites, together in an area of the same name. Returns that area's id.
 */
export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env as Env;
  const session = await requireAuth(request, env);
  const formData = await request.formData();
  if (formData.get('intent') !== 'saveArea') return { error: 'Unknown action' };
  const area = AREA_BY_SLUG.get(String(formData.get('area') ?? ''));
  if (!area) return { error: 'Unknown area' };

  const db = getDb(env);
  const apiKey = getPgsitesApiKey(env);
  const slugs = new Set(area.launches.map((l) => l.slug));
  const refs = (await destinationSeasons(db))
    .filter((row) => slugs.has(row.destination ?? '') && row.siteRef.startsWith('pg:'))
    .map((row) => row.siteRef.slice(3));
  const sites = (await Promise.all(refs.map((id) => ensureLaunchSite(db, apiKey, id)))).flatMap(
    (s) => s ?? [],
  );
  if (sites.length === 0) return { error: 'None of its launches could be found' };

  await Promise.all(
    sites.map((site) =>
      db
        .insert(userFavoriteSites)
        .values({ userId: session.user.id, siteId: site.id, notify: false })
        .onConflictDoNothing(),
    ),
  );
  const areaId = await putInNamedArea(
    db,
    session.user.id,
    area.name,
    sites.map((s) => s.id),
  );
  return { areaId };
}

/** A rated travel launch, with its season. */
interface Launch {
  row: SeasonRow;
  dest: Destination;
  stats: SeasonStats;
}

/** A launch's go share by calendar month (index 0 = Jan). */
function launchShares(l: Launch, goal: WhereGoal): number[] {
  return statsMonths(l.stats, goal).map((m) => m.goShare);
}

function uniqueComps(comps: Comp[]): Comp[] {
  return [...new Map(comps.map((c) => [c.id, c])).values()];
}

/** The page's three views, as a segmented switch. Each is a link, like the filters. */
function ViewTabs({ value, query }: { value: View; query: Query }) {
  return (
    <nav
      aria-label="Views"
      className="flex w-full rounded-xl bg-muted p-1 sm:inline-flex sm:w-auto"
    >
      {(Object.entries(VIEWS) as Array<[View, string]>).map(([key, label]) => {
        const active = key === value;
        return (
          <Link
            key={key}
            to={planningHref(query, { view: key })}
            preventScrollReset
            className={`flex-1 rounded-lg px-4 py-1.5 text-center text-sm font-medium whitespace-nowrap transition-colors sm:flex-none ${
              active
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            aria-current={active ? 'page' : undefined}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

/** A filter with its name: beside it on a computer, above it on a phone. */
function FilterRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5 sm:grid-cols-[6rem_minmax(0,1fr)] sm:items-center sm:gap-3">
      <span className="text-xs font-medium text-muted-foreground sm:text-sm">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/**
 * One row of filter chips; each chip is a link, so filters work before the
 * page hydrates. On a phone the row scrolls sideways instead of wrapping.
 */
function FilterChips<T extends string>({
  name,
  options,
  value,
  query,
}: {
  name: string;
  options: Record<T, string | { label: string }>;
  value: T;
  query: Query;
}) {
  return (
    <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
      {(Object.entries(options) as Array<[T, string | { label: string }]>).map(([key, option]) => {
        const active = key === value;
        return (
          <Link
            key={key}
            to={planningHref(query, { [name]: key })}
            preventScrollReset
            className={`shrink-0 rounded-full border px-3 py-1.5 text-[13px] font-medium whitespace-nowrap transition-colors ${
              active
                ? 'border-foreground bg-foreground text-background'
                : 'bg-background hover:bg-accent'
            }`}
            aria-current={active ? 'true' : undefined}
          >
            {typeof option === 'string' ? option : option.label}
          </Link>
        );
      })}
    </div>
  );
}

/** When to plan for: a start month any time in the next few years, and how long. */
function WindowPicker({
  query,
  from,
  span,
  firstMonth,
  lastMonth,
}: {
  query: Query;
  from: string;
  span: Span;
  firstMonth: string;
  lastMonth: string;
}) {
  const step = Number(span);
  const prev = addMonths(from, -step) >= firstMonth ? addMonths(from, -step) : null;
  const next = addMonths(from, step) <= lastMonth ? addMonths(from, step) : null;
  const years = Array.from(
    { length: Number(lastMonth.slice(0, 4)) - Number(firstMonth.slice(0, 4)) + 1 },
    (_, i) => Number(firstMonth.slice(0, 4)) + i,
  );
  const arrow =
    'inline-flex size-9 items-center justify-center rounded-lg border bg-background transition-colors';
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
      <div className="flex items-center gap-1">
        {prev ? (
          <Link
            to={planningHref(query, { from: prev })}
            preventScrollReset
            className={`${arrow} hover:bg-accent`}
            aria-label="Earlier"
          >
            <ChevronLeft className="h-4 w-4" />
          </Link>
        ) : (
          <span className={`${arrow} opacity-40`} aria-hidden>
            <ChevronLeft className="h-4 w-4" />
          </span>
        )}
        <Form
          method="get"
          action="/planning"
          preventScrollReset
          onChange={(e) => e.currentTarget.requestSubmit()}
        >
          {Object.entries(query)
            .filter(([k, v]) => k !== 'from' && v !== DEFAULT_FILTERS[k])
            .map(([k, v]) => (
              <input key={k} type="hidden" name={k} value={v} />
            ))}
          <label className="sr-only" htmlFor="planning-from">
            From
          </label>
          <select
            id="planning-from"
            name="from"
            defaultValue={from}
            key={from}
            className="h-9 rounded-lg border bg-background px-2.5 text-sm font-medium"
          >
            {years.map((y) => (
              <optgroup key={y} label={String(y)}>
                {Array.from({ length: 12 }, (_, i) => `${y}-${String(i + 1).padStart(2, '0')}`)
                  .filter((m) => m >= firstMonth && m <= lastMonth)
                  .map((m) => (
                    <option key={m} value={m}>
                      {monthLabel(m, { year: true })}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
          <noscript>
            <button type="submit" className="ml-1 h-9 rounded-lg border px-2.5 text-sm">
              Show
            </button>
          </noscript>
        </Form>
        {next ? (
          <Link
            to={planningHref(query, { from: next })}
            preventScrollReset
            className={`${arrow} hover:bg-accent`}
            aria-label="Later"
          >
            <ChevronRight className="h-4 w-4" />
          </Link>
        ) : (
          <span className={`${arrow} opacity-40`} aria-hidden>
            <ChevronRight className="h-4 w-4" />
          </span>
        )}
      </div>
      <FilterChips name="span" options={SPANS} value={span} query={query} />
    </div>
  );
}

/** Go share as a heat cell: one green, darker for more go days. */
function shareCell(share: number): string {
  if (share >= 0.5) return 'bg-go text-go-foreground';
  if (share >= 0.3) return 'bg-green-500/60 text-green-950 dark:text-green-50';
  if (share >= 0.15) return 'bg-green-500/35 text-green-950 dark:text-green-50';
  if (share > 0) return 'bg-green-500/15 text-foreground';
  return 'bg-muted/60 text-muted-foreground';
}

const pct = (share: number) => `${Math.round(share * 100)}%`;

/** Cross-country flights in a typical month, short for a grid cell: "120", "4", "<1". */
function xcShort(n: number): string {
  if (n === 0) return '';
  return n < 1 ? '<1' : String(Math.round(n));
}

/** "about 120 flights of 100 km or more in a typical November" */
function xcWords(n: number, month: string): string {
  const count = n === 0 ? 'no flights' : `${aboutPerYear(n)} flight${n >= 1.5 ? 's' : ''}`;
  return `${count} of 100 km or more in a typical ${monthLabel(month, { long: true })}`;
}

const PENDING = 'Being rated. Its seasons arrive within a day.';

function ShareLegend({ pending = false }: { pending?: boolean }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      <li>Share of days a go:</li>
      {[
        [0.6, '50% or more'],
        [0.4, '30 to 50%'],
        [0.2, '15 to 30%'],
        [0.05, 'under 15%'],
        [0, 'never'],
      ].map(([share, label]) => (
        <li key={label} className="flex items-center gap-1">
          <span className={`h-3 w-4 rounded-sm ${shareCell(share as number)}`} />
          {label}
        </li>
      ))}
      {pending && (
        <li className="flex items-center gap-1">
          <span className="h-3 w-4 rounded-sm border border-dashed border-muted-foreground" />
          not rated yet
        </li>
      )}
    </ul>
  );
}

function PlaceName({ row }: { row: PlaceRow }) {
  return (
    <>
      {row.href ? (
        <Link to={row.href} className="block truncate text-sm font-medium hover:underline">
          {row.name}
        </Link>
      ) : (
        <span className="block truncate text-sm font-medium">{row.name}</span>
      )}
      <span className="text-xs text-muted-foreground">
        {row.flag ? `${row.flag} ` : ''}
        {row.detail}
      </span>
    </>
  );
}

/** An area's launches, best first: "Annecy 62% · Saint-Hilaire 60% · +1". */
function PartsLine({ parts }: { parts: NonNullable<PlaceRow['parts']> }) {
  if (parts.length < 2) return null;
  const shown = parts.slice(0, 3);
  return (
    <div className="text-xs text-muted-foreground">
      {shown.map((p, i) => (
        <span key={p.href}>
          {i > 0 && ' · '}
          <Link to={p.href} className="hover:underline">
            {p.name}
          </Link>{' '}
          <span className="tabular-nums">{pct(p.share)}</span>
        </span>
      ))}
      {parts.length > shown.length && ` · +${parts.length - shown.length} more`}
    </div>
  );
}

/** Places ranked for one month, with a bar each. */
function RankedList({ rows, month }: { rows: PlaceRow[]; month: string }) {
  let rank = 0;
  return (
    <ol className="divide-y rounded-2xl border bg-card px-3 sm:px-5">
      {rows.map((row) => {
        const share = row.shares?.[0];
        if (share != null) rank++;
        return (
          <li
            key={row.key}
            className="flex flex-col gap-1.5 py-3 sm:flex-row sm:items-center sm:gap-4"
          >
            <div className="flex min-w-0 flex-1 items-baseline gap-2">
              <span className="w-5 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                {share != null ? rank : ''}
              </span>
              <div className="min-w-0">
                <PlaceName row={row} />
                {row.parts && <PartsLine parts={row.parts} />}
                {row.xc && (
                  <div className="text-xs text-muted-foreground">
                    Cross-country: {xcWords(row.xc.perMonth[0], month)}
                  </div>
                )}
                {row.comps[0].map((c) => (
                  <span
                    key={c.id}
                    className="ml-2 inline-flex items-center gap-0.5 text-xs text-muted-foreground first-of-type:ml-0"
                  >
                    <Trophy className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                    <CompName comp={c} className="underline" />, {compDates(c, { year: false })}
                  </span>
                ))}
              </div>
            </div>
            {share != null ? (
              <div className="flex items-center gap-2 pl-7 sm:w-64 sm:pl-0">
                <div className="h-2.5 flex-1 rounded-full bg-muted" aria-hidden>
                  <div
                    className="h-full rounded-full bg-go"
                    style={{ width: `${Math.round(share * 100)}%` }}
                  />
                </div>
                <span
                  className="w-24 shrink-0 text-xs tabular-nums"
                  title={`${row.name} in ${monthLabel(month, { long: true })}: a go on ${pct(share)} of days`}
                >
                  <span className="font-semibold">{pct(share)}</span>{' '}
                  {row.other && (
                    <span className="text-muted-foreground">
                      {row.other.label} {pct(row.other.share)}
                    </span>
                  )}
                </span>
              </div>
            ) : (
              <p className="pl-7 text-xs text-muted-foreground sm:w-64 sm:pl-0">{PENDING}</p>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** Places by month across the window, with the window's mean first. */
function PlaceGrid({ rows, months, label }: { rows: PlaceRow[]; months: string[]; label: string }) {
  return (
    <div className="w-fit max-w-full overflow-x-auto rounded-2xl border bg-card p-1.5 sm:p-3">
      <table className="border-separate border-spacing-[2px] text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 w-36 min-w-36 bg-card px-2 py-1 text-left font-medium sm:w-56 sm:min-w-56">
              {label}
            </th>
            <th className="w-12 min-w-12 py-1 font-medium">Avg</th>
            {months.map((m, i) => (
              <th key={m} className="w-12 min-w-12 py-1 font-medium text-muted-foreground">
                {monthLabel(m)}
                {i === 0 || m.endsWith('-01') ? (
                  <span className="block text-[10px] font-normal">{m.slice(0, 4)}</span>
                ) : (
                  <span className="block text-[10px]">&nbsp;</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <td className="sticky left-0 z-10 w-36 min-w-36 max-w-36 bg-card px-2 py-1 sm:w-56 sm:min-w-56 sm:max-w-56">
                <PlaceName row={row} />
              </td>
              {row.shares ? (
                <>
                  <td
                    className={`h-10 rounded text-center font-semibold tabular-nums ${shareCell(row.avg)}`}
                    title={`${row.name}: a go on ${pct(row.avg)} of days across ${windowLabel(months)}`}
                  >
                    {pct(row.avg)}
                    {row.xc && <XcCount n={row.xc.avg} />}
                  </td>
                  {months.map((m, i) => {
                    const share = row.shares![i];
                    const comps = row.comps[i];
                    return (
                      <td
                        key={m}
                        className={`relative h-10 rounded text-center tabular-nums ${shareCell(share)}`}
                        title={`${row.name} in ${monthLabel(m, { year: true })}: a go on ${pct(share)} of days${
                          row.xc ? `. Cross-country: ${xcWords(row.xc.perMonth[i], m)}` : ''
                        }${comps.map((c) => `. Comp: ${c.name}, ${compDates(c)}`).join('')}`}
                      >
                        {pct(share)}
                        {row.xc && <XcCount n={row.xc.perMonth[i]} />}
                        {comps.length > 0 && (
                          <Trophy className="absolute right-0.5 top-0.5 h-3 w-3 text-amber-600 dark:text-amber-400" />
                        )}
                      </td>
                    );
                  })}
                </>
              ) : (
                <td
                  colSpan={months.length + 1}
                  className="rounded bg-muted/40 px-2 text-muted-foreground"
                >
                  {PENDING}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A grid cell's second line: cross-country flights in a typical month. */
function XcCount({ n }: { n: number }) {
  return <span className="block text-[9px] font-normal leading-none opacity-75">{xcShort(n)}</span>;
}

function Places({ rows, months, label }: { rows: PlaceRow[]; months: string[]; label: string }) {
  return months.length === 1 ? (
    <RankedList rows={rows} month={months[0]} />
  ) : (
    <div className="space-y-3">
      <PlaceGrid rows={rows} months={months} label={label} />
      <ShareLegend />
      {rows.some((r) => r.xc) && (
        <p className="text-xs text-muted-foreground">
          The small number under a share is how many cross-country flights of 100 km or more pilots
          logged there in a typical month.
        </p>
      )}
    </div>
  );
}

/** Saves an opened flying area's launches to Favorites, together as one area. */
function SaveArea({
  save,
  signedIn,
}: {
  save: { area: string; listed: number; saved: boolean; savedIn: string | null };
  signedIn: boolean;
}) {
  const fetcher = useFetcher<typeof action>();
  const result = fetcher.data;
  const areaId = result && 'areaId' in result ? result.areaId : null;
  const dashboard = (id: string | null) => (id ? `/dashboard?area=${id}` : '/dashboard');
  const launches = save.listed === 1 ? 'its launch' : `its ${save.listed} launches`;

  if (!signedIn) {
    return (
      <p className="text-sm text-muted-foreground">
        <Link to="/login" className="underline">
          Sign in
        </Link>{' '}
        to save this area to Favorites and see its week on the dashboard.
      </p>
    );
  }
  if (areaId || save.saved) {
    return (
      <p className="text-sm text-muted-foreground">
        {areaId ? 'Saved.' : 'In Favorites.'}{' '}
        <Link to={dashboard(areaId ?? save.savedIn)} className="underline">
          See this week on the dashboard
        </Link>
      </p>
    );
  }
  return (
    <fetcher.Form method="post" className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <input type="hidden" name="intent" value="saveArea" />
      <input type="hidden" name="area" value={save.area} />
      <Button type="submit" variant="outline" size="sm" disabled={fetcher.state !== 'idle'}>
        <Star className="mr-1.5 h-4 w-4" />
        {fetcher.state !== 'idle' ? 'Saving' : 'Save this area'}
      </Button>
      <span className="text-xs text-muted-foreground">
        Adds {launches} to Favorites, together as one area.
      </span>
      {result && 'error' in result && (
        <span className="text-xs text-destructive">{result.error}</span>
      )}
    </fetcher.Form>
  );
}

const SEASONS_NOTE = `Seasons come from the last ${SEASON_YEARS} years of weather, so a month reads the same in any year. Comps are the ones listed for those dates.`;

export default function PlanningPage() {
  const {
    view,
    query,
    from,
    span,
    months,
    firstMonth,
    lastMonth,
    filters,
    comps,
    failed,
    signedIn,
    hasOwnSites,
    places,
    destinationsRated,
    opened,
    pending,
    mapPoints,
    mapExtents,
  } = useLoaderData<typeof loader>();
  const byMonth = new Map(groupByMonth(comps, months[0]).map((g) => [g.month, g.comps]));
  const atOwnSites = comps.filter((c) => c.nearSite).length;
  const when = windowLabel(months);
  const goalWords = filters.goal === 'great' ? 'a great day (XC or a long ridge day)' : 'soarable';

  return (
    <div className="space-y-6">
      <header className="space-y-4">
        <div>
          <h1 className="text-[28px] leading-tight font-bold tracking-tight md:text-4xl">
            Planning
          </h1>
          <p className="mt-1.5 max-w-2xl text-muted-foreground">
            Where and when the flying is good, and the comps to plan trips around, for any months
            ahead.
          </p>
        </div>
        <ViewTabs value={view} query={query} />
      </header>

      <section aria-label="Filters" className="space-y-3.5 rounded-2xl border bg-card p-4">
        <FilterRow label="When">
          <WindowPicker
            query={query}
            from={from}
            span={span}
            firstMonth={firstMonth}
            lastMonth={lastMonth}
          />
        </FilterRow>
        {view === 'where' && (
          <>
            <FilterRow label="Go means">
              <FilterChips name="goal" options={GOALS} value={filters.goal} query={query} />
            </FilterRow>
            <FilterRow label="Rank by">
              <FilterChips name="sort" options={SORTS} value={filters.sort} query={query} />
            </FilterRow>
            {!opened && (
              <>
                <FilterRow label="Show">
                  <FilterChips name="by" options={GROUPS} value={filters.by} query={query} />
                </FilterRow>
                <FilterRow label="Region">
                  <FilterChips
                    name="region"
                    options={REGIONS}
                    value={filters.region}
                    query={query}
                  />
                </FilterRow>
              </>
            )}
          </>
        )}
        {view === 'comps' && (
          <>
            <FilterRow label="Type">
              <FilterChips name="kind" options={KINDS} value={filters.kind} query={query} />
            </FilterRow>
            <FilterRow label="Level">
              <FilterChips name="level" options={LEVELS} value={filters.level} query={query} />
            </FilterRow>
            <FilterRow label="Region">
              <FilterChips name="region" options={REGIONS} value={filters.region} query={query} />
            </FilterRow>
          </>
        )}
      </section>

      {view === 'where' && (
        <>
          <div className="space-y-2.5">
            <div className="h-72 overflow-hidden rounded-2xl border sm:h-96">
              <PlanningMapWrapper
                points={mapPoints}
                extents={mapExtents}
                radiusKm={AREA_RADIUS_KM}
              />
            </div>
            <ShareLegend pending />
            <p className="text-xs text-muted-foreground">
              Colors show the share of days that were a go across {when}. The {AREAS.length} flying
              areas are a hand-picked list of trip destinations, not a standard way to divide the
              world. Each one is a few well-known launches within {AREA_RADIUS_KM} km of its middle,
              close enough to fly from one base. A place that isn&apos;t on the map isn&apos;t on
              the list yet.
            </p>
          </div>
          {destinationsRated === 0 ? (
            <p className="text-muted-foreground">
              The flying areas&apos; last {SEASON_YEARS} years are being rated now. They arrive
              within a day.
            </p>
          ) : (
            <div className="space-y-3">
              {opened && (
                <div>
                  <Link
                    to={planningHref(query, { area: '', country: '' })}
                    preventScrollReset
                    className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    All {filters.by === 'country' ? 'countries' : 'areas'}
                  </Link>
                  <h2 className="mt-1 text-xl font-semibold tracking-tight">{opened.name}</h2>
                  {opened.save && <SaveArea save={opened.save} signedIn={signedIn} />}
                </div>
              )}
              <p className="text-sm text-muted-foreground">
                {opened ? (
                  <>
                    How often {when} was {goalWords} at each of its launches
                    {filters.sort === 'go' &&
                      `, best ${months.length > 1 ? 'on average ' : ''}first`}
                    .
                  </>
                ) : (
                  <>
                    How often {when} was {goalWords} somewhere in each{' '}
                    {filters.by === 'country' ? 'country' : 'area'}, at one launch or another
                    {filters.sort === 'go' &&
                      `, best ${months.length > 1 ? 'on average ' : ''}first`}
                    . Open one for its launches.
                  </>
                )}{' '}
                {filters.sort === 'xc' &&
                  'Ranked by the cross-country flights of 100 km or more pilots logged there, most first. '}
                A trophy marks a comp there.
              </p>
              {places.length > 0 && (
                <Places
                  rows={places}
                  months={months}
                  label={opened ? 'Launch' : filters.by === 'country' ? 'Country' : 'Area'}
                />
              )}
              {places.length === 0 && pending.length === 0 && (
                <p className="text-muted-foreground">Nothing rated here yet.</p>
              )}
              {pending.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  Not rated yet, arriving within a day: {pending.join(', ')}.
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                {destinationsRated < DESTINATIONS.length &&
                  `${destinationsRated} of ${DESTINATIONS.length} launches rated so far. `}
                Each launch is rated on {SEASON_YEARS} years of past weather, with its Paragliding
                Earth wind directions and SoarCast&apos;s default wind limit. An area or country
                counts a day as a go when any of its launches was. Open a launch to see its own
                season. {SEASONS_NOTE} Cross-country flights for a launch are the ones from the
                takeoffs around it. For an area or country they are the ones from the flying regions
                its launches are in. Only long flights count, so a place with few can still be good
                for local flying.
              </p>
              <SeasonCredit />
              <NogaCredit />
            </div>
          )}
        </>
      )}

      {view === 'favorites' &&
        (!hasOwnSites ? (
          <p className="text-muted-foreground">
            {signedIn ? (
              <>
                Favorite sites, and{' '}
                <Link to="/sites/custom/new" className="underline">
                  private sites
                </Link>
                , show up here month by month.
              </>
            ) : (
              <>
                <Link to="/login" className="underline">
                  Sign in
                </Link>{' '}
                to see favorite sites month by month.
              </>
            )}
          </p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              How often {when} was a go for each site&apos;s goal, best{' '}
              {months.length > 1 ? 'on average ' : ''}first. A trophy marks a comp there.
            </p>
            <Places rows={places} months={months} label="Site" />
            <p className="text-xs text-muted-foreground">{SEASONS_NOTE}</p>
            <SeasonCredit />
            {places.some((p) => p.xc) && <NogaCredit />}
          </div>
        ))}

      {view === 'comps' && (
        <>
          <p className="text-sm text-muted-foreground">
            Paragliding comps worldwide, {when}: World Cup rounds and FAI Category 1 and 2 comps.
            Enter on each comp&apos;s own page. Comps are usually listed up to a year or so ahead,
            so later months fill in as they&apos;re announced.
          </p>
          {/* The months at a glance; each jumps to its comps */}
          {months.length > 1 && !failed && (
            <nav aria-label="Months" className="grid grid-cols-6 gap-1 sm:grid-cols-12">
              {months.map((month) => {
                const count = byMonth.get(month)?.length ?? 0;
                const body = (
                  <>
                    <span className="text-[11px] text-muted-foreground">
                      {monthLabel(month)}
                      {month.endsWith('-01') || month === months[0] ? ` ’${month.slice(2, 4)}` : ''}
                    </span>
                    <span
                      className={`text-sm font-semibold ${count ? '' : 'text-muted-foreground/50'}`}
                    >
                      {count}
                    </span>
                  </>
                );
                const className =
                  'flex flex-col items-center rounded-lg border bg-card px-1 py-1.5 transition-colors';
                return count ? (
                  <a key={month} href={`#${month}`} className={`${className} hover:bg-accent`}>
                    {body}
                  </a>
                ) : (
                  <div key={month} className={`${className} border-dashed bg-transparent`}>
                    {body}
                  </div>
                );
              })}
            </nav>
          )}

          {signedIn && atOwnSites > 0 && (
            <p className="text-sm text-muted-foreground">
              <MapPin className="mr-1 inline h-4 w-4 align-text-bottom" />
              {atOwnSites === 1 ? 'One comp is' : `${atOwnSites} comps are`} at favorite sites
              (within {COMP_RADIUS_KM} km).
            </p>
          )}

          {failed ? (
            <div className="rounded-2xl border border-marginal-border bg-marginal p-4 text-marginal-foreground">
              <p className="font-medium">Comps unavailable right now</p>
              <p className="text-sm">
                The site database didn&apos;t answer. Reload the page in a minute.
              </p>
            </div>
          ) : comps.length === 0 ? (
            <p className="text-muted-foreground">
              No comps listed for {when} with these filters yet.
            </p>
          ) : (
            months
              .filter((month) => byMonth.has(month))
              .map((month) => (
                <section key={month} id={month} className="scroll-mt-16 space-y-2">
                  <h2 className="text-lg font-semibold tracking-tight">
                    {monthLabel(month, { year: true, long: true })}
                  </h2>
                  <ul className="divide-y rounded-2xl border bg-card px-4 [&>li]:py-3">
                    {byMonth.get(month)!.map((comp) => (
                      <CompRow key={comp.id} comp={comp}>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                          <span>
                            {countryFlag(comp.countryCode)}{' '}
                            {[comp.place, comp.country].filter(Boolean).join(', ')}
                          </span>
                          {comp.nearSite && (
                            <Link
                              to={comp.nearSite.href}
                              className="inline-flex items-center gap-0.5 text-primary hover:underline"
                            >
                              <MapPin className="h-3 w-3" />
                              At {comp.nearSite.name}
                            </Link>
                          )}
                        </div>
                      </CompRow>
                    ))}
                  </ul>
                </section>
              ))
          )}
          <CompsCredit />
        </>
      )}
    </div>
  );
}
