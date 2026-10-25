import { Suspense } from 'react';
import { Await, useLoaderData, useFetcher, Link, redirect } from 'react-router';
import type { Route } from './+types/sites.$slug';
import type { DayScore, Site } from '~/types';
import { getDb } from '~/app/lib/db.server';
import { getSession } from '~/app/lib/auth.server';
import {
  customSites,
  launchSites,
  userFavoriteSites,
  type LaunchSite,
  type UserFavoriteSite,
} from '~/db/schema';
import { eq, and, gte, lt } from 'drizzle-orm';
import { getIdealWindDirections, getOkWindDirections, getOrientations } from '~/lib/site-utils';
import { evaluateDays, launchProfileFromSite, defaultWindLimit } from '~/lib/forecast-engine';
import { siteTerrain, TERRAIN_LABEL } from '~/lib/site-terrain';
import { keepsMountainMargins } from '~/app/lib/mountain-margins.server';
import { MountainMarginsNote } from '@/components/mountain-margins-note';
import { getAtmosphericProfile, profileToday, setProfileDb } from '~/lib/weather-profile';
import { SiteDetailClient, ForecastUnavailable } from '@/components/site-detail-client';
import { MapDisplayWrapper } from '@/components/map-display-wrapper';
import { SiteNotes } from '@/components/site-notes';
import { SiteSourceCredit } from '@/components/data-credits';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ArrowLeft, Heart } from 'lucide-react';
import { RecentSiteTracker } from '@/components/recent-site-tracker';
import { OrientationBadges } from '@/components/orientation-badges';
import { WindDirectionBadges } from '@/components/wind-direction-badges';
import { ElevationDisplay } from '@/components/elevation-display';
import {
  searchSites,
  getSiteById,
  getPgsitesApiKey,
  siteOrigin,
  type PgSite,
  type SiteOrigin,
} from '~/lib/pgsites-client';
import { launchSiteValuesFromPgSite } from '~/lib/launch-sites';
import { refreshLaunchSites } from '~/app/lib/launch-sites.server';
import {
  launchSiteSlug,
  matchNameInResults,
  matchSlugInResults,
  pgSiteSlug,
  pickLaunchSite,
  readSiteAddress,
  slugName,
} from '~/lib/site-address';
import { defaultGoal, siteKindFromTags, SITE_KIND_LABEL } from '~/lib/site-goals';
import { SiteKindSelect } from '@/components/site-goal-picker';
import { SiteCompsCard } from '@/components/site-comps';
import { compsAtSite } from '~/app/lib/comps.server';
import { seasonSiteRef, seasonWithDays } from '~/app/lib/seasons.server';
import { SeasonCard } from '@/components/season-card';
import { flownDaysAt } from '~/app/lib/flown-days.server';
import { upNowAt } from '~/app/lib/up-now.server';
import { ognNowAt } from '~/app/lib/ogn.server';
import { UpNowCard } from '@/components/up-now';
import { windNowAt } from '~/app/lib/wind-now.server';
import { WindNowCard } from '@/components/wind-now';
import { flownHere } from '~/lib/flown-days';
import {
  howSureExperiment,
  showsExperiments,
  terrainExperiment,
  windsExperiment,
} from '~/app/lib/experiments.server';
import { ExperimentsSection, FlownWindsCard } from '@/components/flown-winds';
import { HowSureCard } from '@/components/how-sure';
import { TerrainStudyCard } from '@/components/terrain-study';
import { FlownHereCard } from '@/components/flown-here';
import { flownByMonthToShow } from '~/lib/flown-days';
import { nogaFlightsAt } from '~/app/lib/noga.server';
import { XcFlightsCard } from '@/components/xc-flights';

/** Site shape used by the detail page — works for both local and pgsites-only sites. */
interface DetailSite {
  id: string;
  name: string;
  slug: string;
  countryCode: string | null;
  region: string | null;
  latitude: number;
  longitude: number;
  altitude: number | null;
  landingAltitude: number | null;
  landingLatitude: number | null;
  landingLongitude: number | null;
  windN: number;
  windNe: number;
  windE: number;
  windSe: number;
  windS: number;
  windSw: number;
  windW: number;
  windNw: number;
  isParagliding: boolean;
  isHanggliding: boolean;
  isThermal: boolean;
  isSoaring: boolean;
  isXc: boolean;
  isHike: boolean;
  maxWindSpeed: number | null;
  /** The ground within 20 km, as pgsites measured it; null until it has */
  terrainSlope: number | null;
  terrainRelief: number | null;
  description: string | null;
  landingDescription: string | null;
  pgeLink: string | null;
  /** Paragliding Earth, a busy launch found from tracked flights, or an OpenStreetMap takeoff */
  origin: SiteOrigin;
  /** An OpenStreetMap takeoff's page */
  sourceUrl: string | null;
  source: string;
  createdAt: string;
  updatedAt: string;
}

/** Where an unlisted launch's wind directions come from */
const WIND_SOURCE: Record<Exclude<SiteOrigin, 'pge'>, string> = {
  flown: 'These are the directions tracked pilots took off in.',
  osm: 'These are the directions mapped in OpenStreetMap.',
  pilot: 'These are the directions set by the pilot who shared it.',
};

/** Map a PgSite from the API to the DetailSite shape. */
function pgSiteToDetailSite(site: PgSite, slug: string): DetailSite {
  return {
    id: site.id,
    name: site.name,
    slug,
    countryCode: site.country_code || null,
    region: null,
    latitude: site.latitude,
    longitude: site.longitude,
    altitude: site.altitude,
    landingAltitude: site.landing_altitude,
    landingLatitude: site.landing_latitude,
    landingLongitude: site.landing_longitude,
    windN: site.wind_n,
    windNe: site.wind_ne,
    windE: site.wind_e,
    windSe: site.wind_se,
    windS: site.wind_s,
    windSw: site.wind_sw,
    windW: site.wind_w,
    windNw: site.wind_nw,
    isParagliding: !!site.is_paragliding,
    isHanggliding: !!site.is_hanggliding,
    isThermal: !!site.is_thermal,
    isSoaring: !!site.is_soaring,
    isXc: !!site.is_xc,
    isHike: !!site.is_hike,
    maxWindSpeed: null,
    terrainSlope: site.terrain_slope ?? null,
    terrainRelief: site.terrain_relief ?? null,
    description: site.description || null,
    landingDescription: null,
    pgeLink: site.pge_link || null,
    origin: siteOrigin(site.source),
    sourceUrl: site.source_url ?? null,
    source: 'pgsites',
    createdAt: site.created_at
      ? new Date(site.created_at * 1000).toISOString()
      : new Date().toISOString(),
    updatedAt: site.updated_at
      ? new Date(site.updated_at * 1000).toISOString()
      : new Date().toISOString(),
  };
}

/** Map a local LaunchSite DB row to the DetailSite shape. */
function localSiteToDetailSite(site: typeof launchSites.$inferSelect): DetailSite {
  return {
    id: site.id,
    name: site.name,
    slug: site.slug,
    countryCode: site.countryCode || null,
    region: site.region || null,
    latitude: site.latitude,
    longitude: site.longitude,
    altitude: site.altitude,
    landingAltitude: site.landingAltitude,
    landingLatitude: site.landingLatitude,
    landingLongitude: site.landingLongitude,
    windN: site.windN,
    windNe: site.windNe,
    windE: site.windE,
    windSe: site.windSe,
    windS: site.windS,
    windSw: site.windSw,
    windW: site.windW,
    windNw: site.windNw,
    isParagliding: site.isParagliding,
    isHanggliding: site.isHanggliding,
    isThermal: site.isThermal,
    isSoaring: site.isSoaring,
    isXc: site.isXc,
    isHike: site.isHike,
    maxWindSpeed: site.maxWindSpeed,
    terrainSlope: site.terrainSlope,
    terrainRelief: site.terrainRelief,
    description: site.description || null,
    landingDescription: site.landingDescription || null,
    pgeLink: site.pgeLink || null,
    origin: siteOrigin(site.origin),
    sourceUrl: site.sourceUrl ?? null,
    source: site.source,
    createdAt: site.createdAt ? new Date(site.createdAt).toISOString() : new Date().toISOString(),
    updatedAt: site.updatedAt ? new Date(site.updatedAt).toISOString() : new Date().toISOString(),
  };
}

export function meta({ data }: Route.MetaArgs) {
  if (!data?.site) return [{ title: 'Site Not Found | SoarCast' }];
  return [
    { title: `${data.site.name} | SoarCast` },
    {
      name: 'description',
      content: `${data.site.name} - ${data.site.region ? `${data.site.region}, ` : ''}${data.site.countryCode || 'Launch Site'}`,
    },
  ];
}

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env as Env;
  const db = getDb(env);
  const apiKey = getPgsitesApiKey(env);
  const ref = params.slug!;
  const { search } = new URL(request.url);
  /** A 301 to the site's one address, keeping the view in the query */
  const moved = (slug: string) => redirect(`/sites/${slug}${search}`, 301);
  const notFound = () => new Response('Site not found', { status: 404 });

  // 1. Kick off session + local DB lookup in parallel — neither depends on the other.
  const [stored, session] = await Promise.all([
    db.query.launchSites.findFirst({ where: eq(launchSites.slug, ref) }),
    getSession(request, env),
  ]);

  // 2. Any other address: an older form, a stale name or a site nobody follows yet
  let localSite: LaunchSite | null = stored ?? null;
  let pgSite: PgSite | null = null;
  if (!localSite) {
    const address = readSiteAddress(ref);
    if (!address) throw notFound();
    if (address.kind === 'uuid') {
      const [byId, byPgsitesId, custom] = await Promise.all([
        db.query.launchSites.findFirst({ where: eq(launchSites.id, address.id) }),
        db.query.launchSites.findFirst({ where: eq(launchSites.pgsitesId, address.id) }),
        db.query.customSites.findFirst({ where: eq(customSites.id, address.id) }),
      ]);
      if (custom) throw redirect(`/sites/custom/${custom.id}`, 301);
      localSite = byId ?? byPgsitesId ?? null;
      if (!localSite) pgSite = await getSiteById(apiKey, address.id);
    } else if (address.kind === 'legacy') {
      localSite =
        (await db.query.launchSites.findFirst({
          where: eq(launchSites.pgsitesId, address.pgsitesId),
        })) ?? null;
      if (!localSite) pgSite = await getSiteById(apiKey, address.pgsitesId);
    } else if (address.kind === 'slug') {
      // The 8 characters are the key: a range on the pgsites ID's unique index
      const rows = await db
        .select()
        .from(launchSites)
        .where(
          and(
            gte(launchSites.pgsitesId, `${address.id8}-`),
            lt(launchSites.pgsitesId, `${address.id8}.`),
          ),
        )
        .limit(20);
      localSite = pickLaunchSite(rows, address.slug);
      if (!localSite) {
        pgSite = await getSiteById(apiKey, address.slug).catch(() => null);
        // pgsites' staging copy may only find a site by its UUID: search its name
        if (!pgSite) {
          const results = await searchSites(apiKey, slugName(address.slug), 20).catch(() => []);
          pgSite = matchSlugInResults(results, address.id8);
        }
      }
    } else {
      const results = await searchSites(apiKey, address.name, 10).catch(() => []);
      pgSite = matchNameInResults(results, address.name);
    }
    if (!localSite && !pgSite) throw notFound();
  }

  let site: DetailSite;
  let localSiteId: string | null = null;
  if (localSite) {
    // A followed site's copy picks up pgsites changes, like what the site gives
    const [fresh] = await refreshLaunchSites(db, apiKey, [localSite]);
    const slug = launchSiteSlug(fresh);
    if (fresh.slug !== slug) {
      // A copy made before the shared slug: give it the slug alerts now link to
      await db
        .update(launchSites)
        .set({ slug })
        .where(eq(launchSites.id, fresh.id))
        .catch((error) => console.error(`Updating the slug of ${fresh.name} failed:`, error));
    }
    if (ref !== slug) throw moved(slug);
    site = localSiteToDetailSite({ ...fresh, slug });
    localSiteId = localSite.id;
  } else {
    const slug = pgSiteSlug(pgSite!);
    if (ref !== slug) throw moved(slug);
    site = pgSiteToDetailSite(pgSite!, slug);
  }

  // Whether the viewer keeps wider margins in big mountains (Settings)
  const marginsPromise = keepsMountainMargins(db, session?.user?.id);

  // 2. Resolve favorites (needs session + site identity resolved above)
  let favorite: UserFavoriteSite | undefined;

  if (session?.user?.id) {
    // Check favorites — by local ID if cached, or by pgsites ID
    if (!localSiteId) {
      // Check if this pgsites site was favorited (look up by pgsitesId)
      const cached = await db.query.launchSites.findFirst({
        where: eq(launchSites.pgsitesId, site.id),
      });
      localSiteId = cached?.id ?? null;
    }
    if (localSiteId) {
      favorite = await db.query.userFavoriteSites.findFirst({
        where: and(
          eq(userFavoriteSites.userId, session.user.id),
          eq(userFavoriteSites.siteId, localSiteId),
        ),
      });
    }
  }
  const customMaxWind = favorite?.customMaxWind ?? null;

  // What the engine rates: the listing, with the pilot's own limit, kind and goal
  const listedKind = siteKindFromTags({
    thermal: site.isThermal,
    soaring: site.isSoaring,
    xc: site.isXc,
  });
  const kind = favorite?.siteKind ?? listedKind;
  const ground = siteTerrain(favorite?.terrain, site.terrainSlope, site.terrainRelief);
  // Big mountains only change the rating for a pilot who keeps wider margins there
  const ratedTerrain = (await marginsPromise) ? ground : null;
  // The limit without the pilot's own: the listing's, or the usual one for the terrain
  const siteMaxWind = site.maxWindSpeed || defaultWindLimit(ratedTerrain, kind);
  const engineSite: Site = {
    id: localSiteId || site.id,
    name: site.name,
    latitude: site.latitude,
    longitude: site.longitude,
    elevation: site.altitude || 0,
    idealWindDirections: favorite?.customIdealDirections || getIdealWindDirections(site),
    okWindDirections: favorite?.customIdealDirections ? [] : getOkWindDirections(site),
    maxWindSpeed: customMaxWind || siteMaxWind,
    kind,
    goal: favorite?.goal ?? defaultGoal(kind, site.isHike),
    terrain: ratedTerrain,
    createdAt: site.createdAt,
    updatedAt: site.updatedAt,
  };

  // Comps held here, fetched while the forecast loads
  const compsPromise = compsAtSite(env, site.latitude, site.longitude);

  // Day verdicts for every site, local or pgsites-only
  let scores: DayScore[] | null = null;
  let today: string | null = null;
  let timeZone: string | null = null;
  let forecastError = false;
  try {
    setProfileDb(db);
    const { profile } = await getAtmosphericProfile(site.latitude, site.longitude, 7);
    scores = evaluateDays(profile, launchProfileFromSite(engineSite));
    today = profileToday(profile);
    timeZone = profile.timezone;
  } catch (e) {
    console.error(`Forecast for ${site.name} failed:`, e);
    forecastError = true;
  }
  // Without a forecast, comps and the season go by the UTC date
  const compsToday = today ?? new Date().toISOString().slice(0, 10);
  const pgsitesId = localSite?.pgsitesId ?? site.id;
  const seasonRef = seasonSiteRef('pgsites', pgsitesId);
  const [comps, seasonFull, xc, experiments] = await Promise.all([
    compsPromise,
    seasonWithDays(db, seasonRef, engineSite, compsToday),
    nogaFlightsAt(db, site.latitude, site.longitude),
    showsExperiments(db, session?.user?.id),
  ]);
  // Days pilots flew from here (Syncing Pilots): streamed in after the page
  const flownDays =
    today && timeZone
      ? flownDaysAt(
          env,
          db,
          { latitude: site.latitude, longitude: site.longitude, altitude: site.altitude },
          timeZone,
          today,
        ).catch(() => null)
      : Promise.resolve(null);
  const flown = flownDays.then((f) =>
    f ? flownHere(f, seasonFull?.days ?? null, engineSite.goal ?? 'soar') : null,
  );
  // Pilots up here now (Syncing Pilots): streamed in after the page
  const upNowSp = timeZone
    ? upNowAt(
        env,
        { latitude: site.latitude, longitude: site.longitude, altitude: site.altitude },
        timeZone,
      )
    : Promise.resolve(null);
  // Gliders and paragliders up here now (OGN), in the same card
  const upNow = Promise.all([
    upNowSp,
    ognNowAt({ latitude: site.latitude, longitude: site.longitude }),
  ]).then(([sp, ogn]) => ({ sp, ogn, timeZone }));
  // Wind at the nearest weather stations now (winds.mobi): streamed in too
  const windNow = windNowAt({ latitude: site.latitude, longitude: site.longitude });
  // Experiments, for pilots who switched them on in Settings
  const windsOnFlownDays = experiments
    ? windsExperiment(db, seasonRef, engineSite, flownDays)
    : null;
  const howSure = experiments ? howSureExperiment(db, seasonRef, engineSite) : null;
  const terrain = experiments
    ? terrainExperiment(db, { latitude: site.latitude, longitude: site.longitude }, today, timeZone)
    : null;

  return {
    site,
    engineSite,
    listedKind,
    ownKind: favorite?.siteKind ?? null,
    pgsitesId,
    isFavorited: !!favorite,
    goalTarget:
      favorite && localSiteId ? { siteId: localSiteId, source: 'launch' as const } : undefined,
    customMaxWind,
    siteMaxWind,
    ground,
    isAuthenticated: !!session?.user?.id,
    scores,
    today,
    forecastError,
    comps,
    compsToday,
    season: seasonFull?.summary ?? null,
    flown,
    upNow,
    windNow,
    xc,
    windsOnFlownDays,
    howSure,
    terrain,
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env as Env;
  const session = await getSession(request, env);

  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getDb(env);
  const apiKey = getPgsitesApiKey(env);
  const formData = await request.formData();
  const intent = formData.get('intent');
  const pgsitesId = formData.get('pgsitesId') as string;

  try {
    switch (intent) {
      case 'favorite': {
        // Check if site already exists locally
        let localSite = await db.query.launchSites.findFirst({
          where: eq(launchSites.pgsitesId, pgsitesId),
        });

        // If not, fetch from pgsites API and insert
        if (!localSite) {
          const pgSite = await getSiteById(apiKey, pgsitesId);
          if (!pgSite) {
            return Response.json({ error: 'Site not found' }, { status: 404 });
          }

          const id = crypto.randomUUID();

          await db.insert(launchSites).values({
            id,
            ...launchSiteValuesFromPgSite(pgSite),
            source: 'pgsites',
            pgsitesId: pgSite.id,
          });

          localSite = await db.query.launchSites.findFirst({
            where: eq(launchSites.id, id),
          });
        }

        if (localSite) {
          // onConflictDoNothing: re-favoriting an already-favorited site (e.g.
          // from stale optimistic UI) must not violate the unique(userId, siteId)
          // constraint and 500.
          await db
            .insert(userFavoriteSites)
            .values({
              userId: session.user.id,
              siteId: localSite.id,
              notify: false,
            })
            .onConflictDoNothing();
        }

        return { success: true };
      }

      case 'unfavorite': {
        const localSite = await db.query.launchSites.findFirst({
          where: eq(launchSites.pgsitesId, pgsitesId),
        });

        if (localSite) {
          await db
            .delete(userFavoriteSites)
            .where(
              and(
                eq(userFavoriteSites.userId, session.user.id),
                eq(userFavoriteSites.siteId, localSite.id),
              ),
            );
        }

        return { success: true };
      }

      default:
        return { error: 'Unknown action' };
    }
  } catch (e) {
    console.error('Site favorite action failed:', e);
    return { error: 'Could not update favorite. Please try again.' };
  }
}

function FavoriteButton({
  pgsitesId,
  initialIsFavorited,
  isAuthenticated,
}: {
  pgsitesId: string;
  initialIsFavorited: boolean;
  isAuthenticated: boolean;
}) {
  const fetcher = useFetcher();
  const optimisticFavorited = fetcher.formData
    ? fetcher.formData.get('intent') === 'favorite'
    : initialIsFavorited;
  const favoriteError = (fetcher.data as { error?: string } | undefined)?.error;

  if (!isAuthenticated) {
    return (
      <Link to="/login">
        <Button variant="outline" size="sm">
          <Heart className="mr-2 h-4 w-4" />
          Sign in to favorite
        </Button>
      </Link>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <fetcher.Form method="post">
        <input
          type="hidden"
          name="intent"
          value={optimisticFavorited ? 'unfavorite' : 'favorite'}
        />
        <input type="hidden" name="pgsitesId" value={pgsitesId} />
        <Button
          type="submit"
          variant={optimisticFavorited ? 'default' : 'outline'}
          size="sm"
          disabled={fetcher.state !== 'idle'}
        >
          <Heart className={`mr-2 h-4 w-4 ${optimisticFavorited ? 'fill-current' : ''}`} />
          {optimisticFavorited ? 'Favorited' : 'Add to Favorites'}
        </Button>
      </fetcher.Form>
      {favoriteError && <p className="text-xs text-red-500">{favoriteError}</p>}
    </div>
  );
}

export default function SiteDetailPage() {
  const {
    site,
    engineSite,
    listedKind,
    ownKind,
    pgsitesId,
    isFavorited,
    goalTarget,
    customMaxWind,
    siteMaxWind,
    ground,
    isAuthenticated,
    scores,
    today,
    forecastError,
    comps,
    compsToday,
    season,
    flown,
    upNow,
    windNow,
    xc,
    windsOnFlownDays,
    howSure,
    terrain,
  } = useLoaderData<typeof loader>();
  const seasonCard = (flownByMonth: Array<number | null> | null) => (
    <SeasonCard
      season={season}
      goal={engineSite.goal ?? 'soar'}
      today={compsToday}
      comps={comps}
      followed={isFavorited}
      flownByMonth={flownByMonth}
    />
  );

  return (
    <div className="space-y-6">
      <RecentSiteTracker site={{ id: site.id, name: site.name, slug: site.slug }} />

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <Link to="/sites/browse">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Browse
          </Button>
        </Link>
        <FavoriteButton
          pgsitesId={pgsitesId}
          initialIsFavorited={isFavorited}
          isAuthenticated={isAuthenticated}
        />
      </div>

      {/* Site name */}
      <div>
        <h1 className="text-3xl font-bold">{site.name}</h1>
        {(site.region || site.countryCode) && (
          <p className="text-lg text-muted-foreground mt-1">
            {site.region ? `${site.region}, ` : ''}
            {site.countryCode || ''}
          </p>
        )}
      </div>

      <Suspense fallback={null}>
        <Await resolve={upNow} errorElement={null}>
          {(u) => (
            <UpNowCard
              up={u.sp}
              ogn={u.ogn}
              launchAltitude={site.altitude ?? null}
              timeZone={u.timeZone}
            />
          )}
        </Await>
      </Suspense>

      <Suspense fallback={null}>
        <Await resolve={windNow} errorElement={null}>
          {(w) =>
            w ? (
              <WindNowCard
                stations={w.stations}
                checkedAt={w.checkedAt}
                launchAltitude={site.altitude ?? null}
              />
            ) : null
          }
        </Await>
      </Suspense>

      {/* Forecast section with windgram and scoring */}
      {forecastError || !scores || !today ? (
        <ForecastUnavailable />
      ) : (
        <SiteDetailClient
          site={engineSite}
          scores={scores}
          today={today}
          goalTarget={goalTarget}
          comps={comps}
          typicalWeek={season?.typicalWeek ?? null}
        />
      )}

      <Suspense fallback={seasonCard(null)}>
        <Await resolve={flown} errorElement={seasonCard(null)}>
          {(f) => (
            <>
              {seasonCard(flownByMonthToShow(f))}
              <FlownHereCard flown={f} goal={engineSite.goal ?? 'soar'} />
            </>
          )}
        </Await>
      </Suspense>

      {xc && <XcFlightsCard xc={xc} today={compsToday} />}

      <SiteCompsCard comps={comps} today={compsToday} />

      {/* Location & Details — always visible */}
      <Card className="p-4 sm:p-6">
        <h2 className="text-lg font-semibold mb-4">Location &amp; Details</h2>
        <div className="space-y-6">
          <div className="space-y-3 text-sm">
            {site.altitude && (
              <div>
                <ElevationDisplay elevationMeters={site.altitude} label="Takeoff" />
              </div>
            )}
            {site.landingAltitude && (
              <div>
                <ElevationDisplay elevationMeters={site.landingAltitude} label="Landing" />
              </div>
            )}
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
              <span className="font-medium">What it gives:</span>
              {goalTarget ? (
                <SiteKindSelect target={goalTarget} kind={ownKind} listedKind={listedKind} />
              ) : (
                <span className="text-muted-foreground">
                  {listedKind
                    ? `${SITE_KIND_LABEL[listedKind]}, as listed on Paragliding Earth`
                    : 'Not tagged on Paragliding Earth, so SoarCast goes by the weather'}
                </span>
              )}
            </div>
            {(site.isParagliding || site.isHanggliding) && (
              <div>
                <span className="font-medium">Flying Types:</span>{' '}
                <span className="text-muted-foreground">
                  {[site.isParagliding && 'paragliding', site.isHanggliding && 'hanggliding']
                    .filter(Boolean)
                    .join(', ')}
                </span>
              </div>
            )}
            {(() => {
              const orientations = getOrientations(site);
              return Object.values(orientations).some((r: number) => r >= 1) ? (
                <div>
                  <div className="font-medium mb-2">Orientations:</div>
                  <OrientationBadges orientations={orientations} />
                </div>
              ) : null;
            })()}
            {(() => {
              const idealDirs = getIdealWindDirections(site);
              return idealDirs.length > 0 ? (
                <div>
                  <div className="font-medium mb-2">Ideal Wind Directions:</div>
                  <WindDirectionBadges directions={idealDirs} />
                  {site.origin !== 'pge' && (
                    <p className="text-xs text-muted-foreground mt-2">
                      {WIND_SOURCE[site.origin]} Check them with local pilots.
                    </p>
                  )}
                </div>
              ) : null;
            })()}
            {ground && (
              <div>
                <span className="font-medium">Terrain:</span>{' '}
                <span className="text-muted-foreground">
                  {TERRAIN_LABEL[ground]}
                  <MountainMarginsNote
                    ground={ground}
                    rated={engineSite.terrain === 'mountains'}
                    ridge={engineSite.kind === 'ridge'}
                    signedIn={isAuthenticated}
                  />
                </span>
              </div>
            )}
            <div>
              <span className="font-medium">Max Wind Speed:</span>{' '}
              {customMaxWind ? (
                <span className="text-muted-foreground">
                  {customMaxWind} km/h <span className="text-xs">(set in Settings)</span>
                  <span className="text-xs ml-1 opacity-60">· usual here: {siteMaxWind} km/h</span>
                </span>
              ) : (
                <span className="text-muted-foreground">
                  {siteMaxWind} km/h
                  {!site.maxWindSpeed && <span className="text-xs"> (the usual limit here)</span>}
                </span>
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              Location: {site.latitude.toFixed(4)}°, {site.longitude.toFixed(4)}°
            </div>
          </div>

          {site.description && (
            <div>
              <h3 className="font-semibold mb-2">Site Description</h3>
              <SiteNotes text={site.description} className="text-sm text-muted-foreground" />
            </div>
          )}

          {site.landingLatitude && site.landingLongitude && site.landingDescription && (
            <div>
              <h3 className="font-semibold mb-2">Landing Information</h3>
              <SiteNotes text={site.landingDescription} className="text-sm text-muted-foreground" />
            </div>
          )}

          <div>
            <h3 className="text-sm font-medium mb-2">Location Map</h3>
            <MapDisplayWrapper latitude={site.latitude} longitude={site.longitude} />
          </div>

          <SiteSourceCredit
            pgeLink={site.pgeLink}
            origin={site.origin}
            sourceUrl={site.sourceUrl}
          />
        </div>
      </Card>

      {(howSure || windsOnFlownDays || terrain) && (
        <ExperimentsSection>
          {howSure && (
            <Suspense fallback={null}>
              <Await resolve={howSure} errorElement={null}>
                {(h) => <HowSureCard experiment={h} scores={scores} followed={isFavorited} />}
              </Await>
            </Suspense>
          )}
          {windsOnFlownDays && (
            <Suspense fallback={null}>
              <Await resolve={windsOnFlownDays} errorElement={null}>
                {(w) => <FlownWindsCard experiment={w} followed={isFavorited} />}
              </Await>
            </Suspense>
          )}
          {terrain && (
            <Suspense fallback={null}>
              <Await resolve={terrain} errorElement={null}>
                {(t) => (
                  <TerrainStudyCard
                    experiment={t}
                    ideal={engineSite.idealWindDirections}
                    ok={engineSite.okWindDirections ?? []}
                    listedAltitude={site.altitude ?? null}
                  />
                )}
              </Await>
            </Suspense>
          )}
        </ExperimentsSection>
      )}
    </div>
  );
}
