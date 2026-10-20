import { Link, useLoaderData } from 'react-router';
import type { Route } from './+types/year';
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
import { calculateDistance } from '~/lib/site-utils';
import { launchSiteToSite } from '~/lib/launch-sites';
import { customSiteToSite } from '~/lib/custom-sites';
import { pgsitesSlug } from '~/lib/pgsites-client';
import { DESTINATION_BY_SLUG } from '~/lib/destinations';
import { decodeSeasonDays, seasonMonths } from '~/lib/seasons';
import { GOAL_LABEL } from '~/lib/site-goals';
import type { Site, SiteGoal } from '~/types';
import { CompName, CompRow } from '@/components/site-comps';
import { CompsCredit } from '@/components/data-credits';
import { MapPin, Trophy } from 'lucide-react';

/** How far ahead the calendar looks: far enough to plan next year's trips. */
const MONTHS_AHEAD = 18;

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

const VIEWS = { mine: 'Your sites', where: 'Where to fly', comps: 'Comps' } as const;
type View = keyof typeof VIEWS;

const GOALS = { soar: 'Soaring days', great: 'Great days' } as const;
type WhereGoal = keyof typeof GOALS;

const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];
const MONTH_OPTIONS = Object.fromEntries(MONTH_NAMES.map((m, i) => [String(i + 1), m])) as Record<
  string,
  string
>;

// Left out of links when they're the value; view and month always go in
const DEFAULT_FILTERS: Record<string, string> = {
  kind: 'flying',
  level: 'all',
  region: 'all',
  goal: 'soar',
};

function pick<T extends string>(value: string | null, options: Record<T, unknown>, fallback: T): T {
  return value && value in options ? (value as T) : fallback;
}

function matchesLevel(comp: Comp, level: Level): boolean {
  if (level === 'world-cup') return comp.series === 'pwc' || comp.series === 'pre-pwc';
  if (level === 'cat1') return comp.category === 1;
  if (level === 'cat2') return comp.category === 2;
  return true;
}

/** A comp in the calendar, with the pilot's own site it's held at, if any. */
export interface YearComp extends Comp {
  nearSite: { name: string; href: string } | null;
}

/** One of the pilot's sites through the year: go share by calendar month, and comps coming up. */
interface SiteYear {
  name: string;
  href: string;
  goal: SiteGoal;
  /** Go share for the site's goal per calendar month (index 0 = Jan); null before it's rated */
  goShare: number[] | null;
  /** The next comp at the site in each calendar month, within the next 12 months */
  comps: Array<Comp | null>;
}

/** A destination for a month: how often it was a go, and comps there then. */
interface WhereRow {
  slug: string;
  name: string;
  launch: string;
  countryCode: string | null;
  country: string | null;
  href: string;
  share: number;
  soarShare: number;
  greatShare: number;
  comps: Comp[];
}

export function meta() {
  return [
    { title: 'Your year | SoarCast' },
    {
      name: 'description',
      content: 'Paragliding comps worldwide for the next 18 months, to plan a year of flying.',
    },
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env as Env;
  const url = new URL(request.url);
  const kind = pick<Kind>(url.searchParams.get('kind'), KINDS, 'flying');
  const level = pick<Level>(url.searchParams.get('level'), LEVELS, 'all');
  const region = pick<RegionFilter>(url.searchParams.get('region'), REGIONS, 'all');

  const from = new Date().toISOString().slice(0, 10);
  const months = monthsFrom(from, MONTHS_AHEAD);
  const lastMonth = months[months.length - 1];
  const to = new Date(Date.UTC(Number(lastMonth.slice(0, 4)), Number(lastMonth.slice(5, 7)), 0))
    .toISOString()
    .slice(0, 10);

  const [comps, session] = await Promise.all([
    compsWorldwide(env, { from, to, disciplines: KINDS[kind].disciplines }),
    getSession(request, env),
  ]);
  const db = getDb(env);

  // The pilot's own sites, rated the way their pages rate them
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

  const view = pick<View>(
    url.searchParams.get('view'),
    VIEWS,
    ownSites.length > 0 ? 'mine' : 'where',
  );
  const nextMonth = ((new Date().getUTCMonth() + 1) % 12) + 1;
  const month = Number(pick(url.searchParams.get('month'), MONTH_OPTIONS, String(nextMonth)));
  const goal = pick<WhereGoal>(url.searchParams.get('goal'), GOALS, 'soar');

  const nearOwnSite = (c: Comp) =>
    c.latitude != null && c.longitude != null
      ? ownSites.find(
          (s) =>
            calculateDistance(s.site.latitude, s.site.longitude, c.latitude!, c.longitude!) <=
            COMP_RADIUS_KM,
        )
      : undefined;

  const shown: YearComp[] = (comps ?? [])
    .filter(
      (c) =>
        matchesLevel(c, level) && (region === 'all' || countryRegion(c.countryCode) === region),
    )
    .map((c) => {
      const site = nearOwnSite(c);
      return { ...c, nearSite: site ? { name: site.site.name, href: site.href } : null };
    });

  // Your sites: each one's months, and the comps coming at it in the next 12 months
  let siteYears: SiteYear[] = [];
  if (view === 'mine' && ownSites.length > 0) {
    const seasons = await seasonsForSites(db, ownSites, from);
    const yearAhead = months.slice(0, 12);
    siteYears = ownSites.map(({ siteRef, site, href }) => {
      const season = seasons.get(siteRef);
      const near = (comps ?? []).filter(
        (c) =>
          c.latitude != null &&
          calculateDistance(site.latitude, site.longitude, c.latitude, c.longitude!) <=
            COMP_RADIUS_KM,
      );
      return {
        name: site.name,
        href,
        goal: site.goal ?? 'soar',
        goShare: season ? season.months.map((m) => m.goShare) : null,
        comps: Array.from({ length: 12 }, (_, i) => {
          const ym = yearAhead.find((m) => Number(m.slice(5, 7)) === i + 1)!;
          return near.find((c) => c.startDate.slice(0, 7) === ym) ?? null;
        }),
      };
    });
  }

  // Where to fly: destinations ranked by how often the month was a go
  let where: WhereRow[] = [];
  let destinationsRated = 0;
  if (view === 'where') {
    const rows = await destinationSeasons(db);
    destinationsRated = rows.length;
    const ym = months.slice(0, 13).find((m) => Number(m.slice(5, 7)) === month)!;
    where = rows
      .flatMap((row) => {
        const dest = DESTINATION_BY_SLUG.get(row.destination ?? '');
        if (!dest) return [];
        if (region !== 'all' && countryRegion(row.countryCode) !== region) return [];
        const days = decodeSeasonDays(row.days);
        const soarShare = seasonMonths(days, 'soar')[month - 1].goShare;
        const greatShare = seasonMonths(days, 'great')[month - 1].goShare;
        const pgsitesId = row.siteRef.replace(/^pg:/, '');
        return [
          {
            slug: dest.slug,
            name: dest.name,
            launch: row.name ?? dest.name,
            countryCode: row.countryCode,
            country: countryName(row.countryCode),
            href: `/sites/${pgsitesSlug(row.name ?? dest.name, pgsitesId)}`,
            share: goal === 'great' ? greatShare : soarShare,
            soarShare,
            greatShare,
            comps: compsAround(comps ?? [], row.latitude, row.longitude).filter(
              (c) => c.startDate.slice(0, 7) === ym,
            ),
          },
        ];
      })
      .sort((a, b) => b.share - a.share || b.soarShare - a.soarShare);
  }

  return {
    view,
    comps: shown,
    failed: comps === null,
    months,
    filters: { view, kind, level, region, month: String(month), goal },
    signedIn: !!session?.user?.id,
    siteYears,
    where,
    destinationsRated,
  };
}

/** One row of filter chips; each chip is a link, so filters work before the page hydrates. */
function FilterChips<T extends string>({
  name,
  options,
  value,
  filters,
}: {
  name: string;
  options: Record<T, string | { label: string }>;
  value: T;
  filters: Record<string, string>;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {(Object.entries(options) as Array<[T, string | { label: string }]>).map(([key, option]) => {
        const params = new URLSearchParams(
          Object.entries({ ...filters, [name]: key }).filter(([k, v]) => v !== DEFAULT_FILTERS[k]),
        );
        const active = key === value;
        return (
          <Link
            key={key}
            to={params.size > 0 ? `/year?${params}` : '/year'}
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

/** Go share as a heat cell: one green, darker for more go days. */
function shareCell(share: number): string {
  if (share >= 0.5) return 'bg-green-700 text-white dark:bg-green-500 dark:text-green-950';
  if (share >= 0.3) return 'bg-green-500/60 text-green-950 dark:text-green-50';
  if (share >= 0.15) return 'bg-green-500/35 text-green-950 dark:text-green-50';
  if (share > 0) return 'bg-green-500/15 text-foreground';
  return 'bg-muted/60 text-muted-foreground';
}

const pct = (share: number) => `${Math.round(share * 100)}%`;

/** The pilot's sites by month, the year ahead from this month. */
function YourSites({ siteYears, signedIn }: { siteYears: SiteYear[]; signedIn: boolean }) {
  if (siteYears.length === 0) {
    return (
      <p className="text-muted-foreground">
        {signedIn ? (
          <>
            Follow a few sites (or{' '}
            <Link to="/sites/custom/new" className="underline">
              add your own
            </Link>
            ) and they show up here, month by month.
          </>
        ) : (
          <>
            <Link to="/auth/signin" className="underline">
              Sign in
            </Link>{' '}
            and follow your sites to see them month by month.
          </>
        )}
      </p>
    );
  }
  const start = new Date().getUTCMonth();
  const order = Array.from({ length: 12 }, (_, i) => (start + i) % 12);
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        How often each month was a go for the goal you set at each site, over the last two years,
        from this month on. A trophy marks a comp there in the coming year.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-separate border-spacing-[2px] text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-background px-2 py-1 text-left font-medium">
                Site
              </th>
              {order.map((m) => (
                <th key={m} className="py-1 font-medium text-muted-foreground">
                  {MONTH_NAMES[m]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {siteYears.map((row) => (
              <tr key={row.href}>
                <td className="sticky left-0 z-10 max-w-40 bg-background px-2 py-1">
                  <Link to={row.href} className="block truncate font-medium hover:underline">
                    {row.name}
                  </Link>
                  <span className="text-[10px] text-muted-foreground">{GOAL_LABEL[row.goal]}</span>
                </td>
                {row.goShare ? (
                  order.map((m) => {
                    const comp = row.comps[m];
                    return (
                      <td
                        key={m}
                        className={`relative h-10 rounded text-center tabular-nums ${shareCell(row.goShare![m])}`}
                        title={`${row.name} in ${MONTH_NAMES[m]}: a go on ${pct(row.goShare![m])} of days${
                          comp ? `. Comp: ${comp.name}, ${compDates(comp)}` : ''
                        }`}
                      >
                        {pct(row.goShare![m])}
                        {comp && (
                          <Trophy className="absolute right-0.5 top-0.5 h-3 w-3 text-amber-600 dark:text-amber-400" />
                        )}
                      </td>
                    );
                  })
                ) : (
                  <td colSpan={12} className="rounded bg-muted/40 px-2 text-muted-foreground">
                    Being rated: its last two years arrive within a day.
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
    </div>
  );
}

/** Destinations ranked for a month. */
function WhereToFly({
  where,
  month,
  goal,
  rated,
}: {
  where: WhereRow[];
  month: number;
  goal: WhereGoal;
  rated: number;
}) {
  if (rated === 0) {
    return (
      <p className="text-muted-foreground">
        SoarCast is rating the destinations&apos; last two years now. They arrive over the next day
        or two.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        How often {MONTH_NAMES[month - 1]} was{' '}
        {goal === 'great' ? 'a great day (XC or a long ridge day)' : 'soarable'} at each
        destination&apos;s main launch over the last two years, best first.
      </p>
      {where.length === 0 ? (
        <p className="text-muted-foreground">No destinations rated in this region yet.</p>
      ) : (
        <ol className="divide-y">
          {where.map((row, i) => (
            <li
              key={row.slug}
              className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:gap-4"
            >
              <div className="flex min-w-0 flex-1 items-baseline gap-2">
                <span className="w-5 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <Link to={row.href} className="text-sm font-medium hover:underline">
                    {row.name}
                  </Link>
                  <div className="text-xs text-muted-foreground">
                    {countryFlag(row.countryCode)} {row.country}
                    {row.comps.map((c) => (
                      <span key={c.id} className="ml-2 inline-flex items-center gap-0.5">
                        <Trophy className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                        <CompName comp={c} className="underline" />, {compDates(c, { year: false })}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 pl-7 sm:w-64 sm:pl-0">
                <div className="h-2.5 flex-1 rounded-full bg-muted" aria-hidden>
                  <div
                    className="h-full rounded-full bg-green-700 dark:bg-green-500"
                    style={{ width: `${Math.round(row.share * 100)}%` }}
                  />
                </div>
                <span className="w-24 shrink-0 text-xs tabular-nums">
                  <span className="font-semibold">{pct(row.share)}</span>{' '}
                  <span className="text-muted-foreground">
                    {goal === 'great'
                      ? `soar ${pct(row.soarShare)}`
                      : `great ${pct(row.greatShare)}`}
                  </span>
                </span>
              </div>
            </li>
          ))}
        </ol>
      )}
      <p className="text-xs text-muted-foreground">
        {rated} destinations, each rated at one listed launch with its Paragliding Earth wind
        directions and SoarCast&apos;s default wind limit, on archived forecasts. A launch near it
        can do better or worse; open the site for its own season.
      </p>
    </div>
  );
}

export default function YearPage() {
  const { view, comps, failed, months, filters, signedIn, siteYears, where, destinationsRated } =
    useLoaderData<typeof loader>();
  const byMonth = new Map(groupByMonth(comps, months[0]).map((g) => [g.month, g.comps]));
  const atOwnSites = comps.filter((c) => c.nearSite).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Your year</h1>
        <p className="mt-1 text-muted-foreground">
          When your sites are at their best, where to travel each month, and the comps to plan
          around.
        </p>
      </div>

      <FilterChips name="view" options={VIEWS} value={view} filters={filters} />

      {view === 'mine' && <YourSites siteYears={siteYears} signedIn={signedIn} />}

      {view === 'where' && (
        <>
          <div className="space-y-2">
            <FilterChips
              name="month"
              options={MONTH_OPTIONS}
              value={filters.month}
              filters={filters}
            />
            <FilterChips name="goal" options={GOALS} value={filters.goal} filters={filters} />
            <FilterChips name="region" options={REGIONS} value={filters.region} filters={filters} />
          </div>
          <WhereToFly
            where={where}
            month={Number(filters.month)}
            goal={filters.goal}
            rated={destinationsRated}
          />
        </>
      )}

      {view === 'comps' && (
        <>
          <p className="text-sm text-muted-foreground">
            Paragliding comps worldwide for the next {MONTHS_AHEAD} months: World Cup rounds and FAI
            Category 1 and 2 comps. Enter on each comp&apos;s own page.
          </p>
          <div className="space-y-2">
            <FilterChips name="kind" options={KINDS} value={filters.kind} filters={filters} />
            <FilterChips name="level" options={LEVELS} value={filters.level} filters={filters} />
            <FilterChips name="region" options={REGIONS} value={filters.region} filters={filters} />
          </div>
          {/* The months at a glance; each jumps to its comps */}
          <nav
            aria-label="Months"
            className="grid grid-cols-6 gap-1 sm:grid-cols-9 lg:grid-cols-18"
          >
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

          {signedIn && atOwnSites > 0 && (
            <p className="text-sm text-muted-foreground">
              <MapPin className="mr-1 inline h-4 w-4 align-text-bottom" />
              {atOwnSites === 1 ? 'One comp is' : `${atOwnSites} comps are`} at your sites (within{' '}
              {COMP_RADIUS_KM} km).
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
            <p className="text-muted-foreground">No comps listed for these filters yet.</p>
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
                              At your site {comp.nearSite.name}
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
