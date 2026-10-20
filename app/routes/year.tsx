import { Link, useLoaderData } from 'react-router';
import type { Route } from './+types/year';
import { eq } from 'drizzle-orm';
import { getDb } from '~/app/lib/db.server';
import { getSession } from '~/app/lib/auth.server';
import { compsWorldwide } from '~/app/lib/comps.server';
import { customSites, launchSites, userFavoriteSites } from '~/db/schema';
import {
  COMP_RADIUS_KM,
  REGION_LABEL,
  countryFlag,
  countryRegion,
  groupByMonth,
  monthLabel,
  monthsFrom,
  type Comp,
  type CompDiscipline,
  type Region,
} from '~/lib/comps';
import { calculateDistance } from '~/lib/site-utils';
import { CompRow } from '@/components/site-comps';
import { CompsCredit } from '@/components/data-credits';
import { MapPin } from 'lucide-react';

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

const DEFAULT_FILTERS: Record<string, string> = { kind: 'flying', level: 'all', region: 'all' };

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

  // The pilot's own sites, to mark comps held at one of them
  let ownSites: Array<{ name: string; href: string; latitude: number; longitude: number }> = [];
  if (session?.user?.id) {
    const db = getDb(env);
    const [followed, customs] = await Promise.all([
      db
        .select({
          name: launchSites.name,
          slug: launchSites.slug,
          latitude: launchSites.latitude,
          longitude: launchSites.longitude,
        })
        .from(userFavoriteSites)
        .innerJoin(launchSites, eq(launchSites.id, userFavoriteSites.siteId))
        .where(eq(userFavoriteSites.userId, session.user.id)),
      db
        .select({
          id: customSites.id,
          name: customSites.name,
          latitude: customSites.latitude,
          longitude: customSites.longitude,
        })
        .from(customSites)
        .where(eq(customSites.userId, session.user.id)),
    ]);
    ownSites = [
      ...followed.map((s) => ({ ...s, href: `/sites/${s.slug}` })),
      ...customs.map((s) => ({
        name: s.name,
        href: `/sites/custom/${s.id}`,
        latitude: parseFloat(s.latitude),
        longitude: parseFloat(s.longitude),
      })),
    ];
  }

  const shown: YearComp[] = (comps ?? [])
    .filter(
      (c) =>
        matchesLevel(c, level) && (region === 'all' || countryRegion(c.countryCode) === region),
    )
    .map((c) => {
      const site =
        c.latitude != null && c.longitude != null
          ? ownSites.find(
              (s) =>
                calculateDistance(s.latitude, s.longitude, c.latitude!, c.longitude!) <=
                COMP_RADIUS_KM,
            )
          : undefined;
      return { ...c, nearSite: site ? { name: site.name, href: site.href } : null };
    });

  return {
    comps: shown,
    failed: comps === null,
    months,
    filters: { kind, level, region },
    signedIn: !!session?.user?.id,
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

export default function YearPage() {
  const { comps, failed, months, filters, signedIn } = useLoaderData<typeof loader>();
  const byMonth = new Map(groupByMonth(comps, months[0]).map((g) => [g.month, g.comps]));
  const atOwnSites = comps.filter((c) => c.nearSite).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Your year</h1>
        <p className="mt-1 text-muted-foreground">
          Paragliding comps worldwide for the next {MONTHS_AHEAD} months: World Cup rounds and FAI
          Category 1 and 2 comps. Enter on each comp&apos;s own page.
        </p>
      </div>

      <div className="space-y-2">
        <FilterChips name="kind" options={KINDS} value={filters.kind} filters={filters} />
        <FilterChips name="level" options={LEVELS} value={filters.level} filters={filters} />
        <FilterChips name="region" options={REGIONS} value={filters.region} filters={filters} />
      </div>

      {/* The months at a glance; each jumps to its comps */}
      <nav aria-label="Months" className="grid grid-cols-6 gap-1 sm:grid-cols-9 lg:grid-cols-18">
        {months.map((month) => {
          const count = byMonth.get(month)?.length ?? 0;
          const body = (
            <>
              <span className="text-[11px] text-muted-foreground">
                {monthLabel(month)}
                {month.endsWith('-01') || month === months[0] ? ` ’${month.slice(2, 4)}` : ''}
              </span>
              <span className={`text-sm font-semibold ${count ? '' : 'text-muted-foreground/50'}`}>
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
    </div>
  );
}
