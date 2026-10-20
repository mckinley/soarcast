import { Form, Link, useLoaderData } from 'react-router';
import type { Route } from './+types/planning';
import { eq } from 'drizzle-orm';
import { getDb } from '~/app/lib/db.server';
import { getSession } from '~/app/lib/auth.server';
import { compsWorldwide } from '~/app/lib/comps.server';
import { destinationSeasons, seasonSiteRef, seasonsForSites } from '~/app/lib/seasons.server';
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
import { pgsitesSlug } from '~/lib/pgsites-client';
import { DESTINATION_BY_SLUG } from '~/lib/destinations';
import { decodeSeasonDays, seasonMonths } from '~/lib/seasons';
import { GOAL_LABEL } from '~/lib/site-goals';
import type { Site } from '~/types';
import { CompName, CompRow } from '@/components/site-comps';
import { CompsCredit } from '@/components/data-credits';
import { ChevronLeft, ChevronRight, MapPin, Trophy } from 'lucide-react';

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

// Left out of links when they're the value
const DEFAULT_FILTERS: Record<string, string> = {
  view: 'where',
  kind: 'flying',
  level: 'all',
  region: 'all',
  goal: 'soar',
};

type Query = Record<string, string>;

function pick<T extends string>(value: string | null, options: Record<T, unknown>, fallback: T): T {
  return value && value in options ? (value as T) : fallback;
}

function planningHref(query: Query, change: Record<string, string>): string {
  const params = new URLSearchParams(
    Object.entries({ ...query, ...change }).filter(([k, v]) => v !== DEFAULT_FILTERS[k]),
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

/** "Nov 2026", or "Nov 2026 – Jan 2027". */
function windowLabel(months: string[]): string {
  const first = monthLabel(months[0], { year: true });
  return months.length === 1
    ? first
    : `${first} – ${monthLabel(months[months.length - 1], { year: true })}`;
}

/** A comp in the calendar, with the favorite site it's held at, if any. */
export interface PlanningComp extends Comp {
  nearSite: { name: string; href: string } | null;
}

/** A destination or favorite site across the window. */
interface PlaceRow {
  key: string;
  name: string;
  href: string;
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
}

export function meta() {
  return [
    { title: 'Planning | SoarCast' },
    {
      name: 'description',
      content:
        'Where and when the paragliding is good, month by month from two years of rated days, and the comps worldwide to plan trips around.',
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
  if (region !== 'all') query.region = region;
  if (kind !== 'flying') query.kind = kind;
  if (level !== 'all') query.level = level;

  const [comps, session] = await Promise.all([
    compsWorldwide(env, { from: compsFrom, to: compsTo, disciplines: KINDS[kind].disciplines }),
    getSession(request, env),
  ]);
  const db = getDb(env);

  // Favorite and private sites, rated the way their pages rate them
  let ownSites: Array<{ siteRef: string; site: Site; href: string }> = [];
  if (session?.user?.id) {
    const [followed, customs] = await Promise.all([
      db
        .select({ favorite: userFavoriteSites, site: launchSites })
        .from(userFavoriteSites)
        .innerJoin(launchSites, eq(launchSites.id, userFavoriteSites.siteId))
        .where(eq(userFavoriteSites.userId, session.user.id)),
      db.select().from(customSites).where(eq(customSites.userId, session.user.id)),
    ]);
    ownSites = [
      ...followed.map((f) => ({
        siteRef: seasonSiteRef('pgsites', f.site.pgsitesId),
        site: launchSiteToSite(f.site, f.favorite),
        href: `/sites/${f.site.slug}`,
      })),
      ...customs.map((c) => ({
        siteRef: seasonSiteRef('custom', c.id),
        site: customSiteToSite(c),
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
  const byRank = (a: PlaceRow, b: PlaceRow) =>
    (b.shares ? 1 : 0) - (a.shares ? 1 : 0) || b.avg - a.avg || a.name.localeCompare(b.name);

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
        };
      })
      .sort(byRank);
  }

  if (view === 'where') {
    const rows = await destinationSeasons(db);
    destinationsRated = rows.length;
    places = rows
      .flatMap((row): PlaceRow[] => {
        const dest = DESTINATION_BY_SLUG.get(row.destination ?? '');
        if (!dest) return [];
        if (region !== 'all' && countryRegion(row.countryCode) !== region) return [];
        const days = decodeSeasonDays(row.days);
        const byMonth = {
          soar: seasonMonths(days, 'soar'),
          great: seasonMonths(days, 'great'),
        };
        const shareIn = (g: WhereGoal, m: string) => byMonth[g][Number(m.slice(5, 7)) - 1].goShare;
        const shares = months.map((m) => shareIn(goal, m));
        const otherGoal: WhereGoal = goal === 'great' ? 'soar' : 'great';
        const pgsitesId = row.siteRef.replace(/^pg:/, '');
        return [
          {
            key: dest.slug,
            name: dest.name,
            href: `/sites/${pgsitesSlug(row.name ?? dest.name, pgsitesId)}`,
            detail: countryName(row.countryCode) ?? '',
            flag: countryFlag(row.countryCode),
            shares,
            avg: mean(shares),
            comps: compsByMonth(row.latitude, row.longitude),
            other: {
              label: otherGoal === 'great' ? 'great' : 'soar',
              share: mean(months.map((m) => shareIn(otherGoal, m))),
            },
          },
        ];
      })
      .sort(byRank);
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
    filters: { kind, level, region, goal },
    comps: shown,
    failed: comps === null,
    signedIn: !!session?.user?.id,
    hasOwnSites: ownSites.length > 0,
    places,
    destinationsRated,
  };
}

/** One row of filter chips; each chip is a link, so filters work before the page hydrates. */
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
    <div className="flex flex-wrap gap-1.5">
      {(Object.entries(options) as Array<[T, string | { label: string }]>).map(([key, option]) => {
        const active = key === value;
        return (
          <Link
            key={key}
            to={planningHref(query, { [name]: key })}
            preventScrollReset
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
              active
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border hover:bg-accent'
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
    'inline-flex h-8 w-8 items-center justify-center rounded-md border transition-colors';
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
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
            className="h-8 rounded-md border bg-background px-2 text-sm"
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
            <button type="submit" className="ml-1 h-8 rounded-md border px-2 text-sm">
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
  if (share >= 0.5) return 'bg-green-700 text-white dark:bg-green-500 dark:text-green-950';
  if (share >= 0.3) return 'bg-green-500/60 text-green-950 dark:text-green-50';
  if (share >= 0.15) return 'bg-green-500/35 text-green-950 dark:text-green-50';
  if (share > 0) return 'bg-green-500/15 text-foreground';
  return 'bg-muted/60 text-muted-foreground';
}

const pct = (share: number) => `${Math.round(share * 100)}%`;

const PENDING = 'Being rated: its last two years arrive within a day.';

function ShareLegend() {
  return (
    <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      <li>Share of days a go:</li>
      {[
        [0.6, '50% or more'],
        [0.4, '30–50%'],
        [0.2, '15–30%'],
        [0.05, 'under 15%'],
        [0, 'never'],
      ].map(([share, label]) => (
        <li key={label} className="flex items-center gap-1">
          <span className={`h-3 w-4 rounded-sm ${shareCell(share as number)}`} />
          {label}
        </li>
      ))}
    </ul>
  );
}

function PlaceName({ row }: { row: PlaceRow }) {
  return (
    <>
      <Link to={row.href} className="block truncate text-sm font-medium hover:underline">
        {row.name}
      </Link>
      <span className="text-xs text-muted-foreground">
        {row.flag ? `${row.flag} ` : ''}
        {row.detail}
      </span>
    </>
  );
}

/** Places ranked for one month, with a bar each. */
function RankedList({ rows, month }: { rows: PlaceRow[]; month: string }) {
  let rank = 0;
  return (
    <ol className="divide-y">
      {rows.map((row) => {
        const share = row.shares?.[0];
        if (share != null) rank++;
        return (
          <li
            key={row.key}
            className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:gap-4"
          >
            <div className="flex min-w-0 flex-1 items-baseline gap-2">
              <span className="w-5 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                {share != null ? rank : ''}
              </span>
              <div className="min-w-0">
                <PlaceName row={row} />
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
                    className="h-full rounded-full bg-green-700 dark:bg-green-500"
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
    <div className="overflow-x-auto">
      <table className="border-separate border-spacing-[2px] text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 w-36 min-w-36 bg-background px-2 py-1 text-left font-medium sm:w-56 sm:min-w-56">
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
              <td className="sticky left-0 z-10 w-36 min-w-36 max-w-36 bg-background px-2 py-1 sm:w-56 sm:min-w-56 sm:max-w-56">
                <PlaceName row={row} />
              </td>
              {row.shares ? (
                <>
                  <td
                    className={`h-10 rounded text-center font-semibold tabular-nums ${shareCell(row.avg)}`}
                    title={`${row.name}: a go on ${pct(row.avg)} of days across ${windowLabel(months)}`}
                  >
                    {pct(row.avg)}
                  </td>
                  {months.map((m, i) => {
                    const share = row.shares![i];
                    const comps = row.comps[i];
                    return (
                      <td
                        key={m}
                        className={`relative h-10 rounded text-center tabular-nums ${shareCell(share)}`}
                        title={`${row.name} in ${monthLabel(m, { year: true })}: a go on ${pct(share)} of days${comps
                          .map((c) => `. Comp: ${c.name}, ${compDates(c)}`)
                          .join('')}`}
                      >
                        {pct(share)}
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

function Places({ rows, months, label }: { rows: PlaceRow[]; months: string[]; label: string }) {
  return months.length === 1 ? (
    <RankedList rows={rows} month={months[0]} />
  ) : (
    <div className="space-y-3">
      <PlaceGrid rows={rows} months={months} label={label} />
      <ShareLegend />
    </div>
  );
}

const SEASONS_NOTE =
  'Seasons come from the last two years of days, so a month reads the same in any year; comps are the ones listed for those dates.';

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
  } = useLoaderData<typeof loader>();
  const byMonth = new Map(groupByMonth(comps, months[0]).map((g) => [g.month, g.comps]));
  const atOwnSites = comps.filter((c) => c.nearSite).length;
  const when = windowLabel(months);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Planning</h1>
        <p className="mt-1 text-muted-foreground">
          Where and when the flying is good, and the comps to plan trips around, for any months
          ahead.
        </p>
      </div>

      <div className="space-y-3">
        <FilterChips name="view" options={VIEWS} value={view} query={query} />
        <WindowPicker
          query={query}
          from={from}
          span={span}
          firstMonth={firstMonth}
          lastMonth={lastMonth}
        />
      </div>

      {view === 'where' && (
        <>
          <div className="space-y-2">
            <FilterChips name="goal" options={GOALS} value={filters.goal} query={query} />
            <FilterChips name="region" options={REGIONS} value={filters.region} query={query} />
          </div>
          {destinationsRated === 0 ? (
            <p className="text-muted-foreground">
              The destinations&apos; last two years are being rated now. They arrive over the next
              day or two.
            </p>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                How often {when} was{' '}
                {filters.goal === 'great' ? 'a great day (XC or a long ridge day)' : 'soarable'} at
                each destination&apos;s main launch, best {months.length > 1 ? 'on average ' : ''}
                first. A trophy marks a comp there.
              </p>
              {places.length === 0 ? (
                <p className="text-muted-foreground">No destinations rated in this region yet.</p>
              ) : (
                <Places rows={places} months={months} label="Destination" />
              )}
              <p className="text-xs text-muted-foreground">
                {destinationsRated} destinations, each rated at one listed launch with its
                Paragliding Earth wind directions and SoarCast&apos;s default wind limit, on
                archived forecasts. A launch near it can do better or worse; open the site for its
                own season. {SEASONS_NOTE}
              </p>
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
                <Link to="/auth/signin" className="underline">
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
          </div>
        ))}

      {view === 'comps' && (
        <>
          <p className="text-sm text-muted-foreground">
            Paragliding comps worldwide, {when}: World Cup rounds and FAI Category 1 and 2 comps.
            Enter on each comp&apos;s own page. Comps are usually listed up to a year or so ahead,
            so later months fill in as they&apos;re announced.
          </p>
          <div className="space-y-2">
            <FilterChips name="kind" options={KINDS} value={filters.kind} query={query} />
            <FilterChips name="level" options={LEVELS} value={filters.level} query={query} />
            <FilterChips name="region" options={REGIONS} value={filters.region} query={query} />
          </div>
          {/* The months at a glance; each jumps to its comps */}
          {months.length > 1 && !failed && (
            <nav aria-label="Months" className="grid grid-cols-6 gap-1 sm:grid-cols-12">
              {months.map((month) => {
                const count = byMonth.get(month)?.length ?? 0;
                const body = (
                  <>
                    <span className="text-[11px] text-muted-foreground">
                      {monthLabel(month)}
                      {month.endsWith('-01') || month === months[0]
                        ? ` ’${month.slice(2, 4)}`
                        : ''}
                    </span>
                    <span
                      className={`text-sm font-semibold ${count ? '' : 'text-muted-foreground/50'}`}
                    >
                      {count}
                    </span>
                  </>
                );
                const className =
                  'flex flex-col items-center rounded-md border px-1 py-1.5 transition-colors';
                return count ? (
                  <a key={month} href={`#${month}`} className={`${className} hover:bg-accent`}>
                    {body}
                  </a>
                ) : (
                  <div key={month} className={`${className} border-dashed`}>
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
            <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-4 text-amber-900 dark:text-amber-200">
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
                <section key={month} id={month} className="scroll-mt-16">
                  <h2 className="border-b pb-1 text-lg font-semibold">
                    {monthLabel(month, { year: true, long: true })}
                  </h2>
                  <ul className="divide-y">
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
