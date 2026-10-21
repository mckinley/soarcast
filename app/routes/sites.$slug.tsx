import { Suspense } from 'react';
import { Await, useLoaderData, useFetcher, Link, redirect } from 'react-router';
import type { Route } from './+types/sites.$slug';
import type { DayScore, Site } from '~/types';
import { getDb } from '~/app/lib/db.server';
import { getSession } from '~/app/lib/auth.server';
import { customSites, launchSites, userFavoriteSites, type UserFavoriteSite } from '~/db/schema';
import { eq, and } from 'drizzle-orm';
import { getIdealWindDirections, getOkWindDirections, getOrientations } from '~/lib/site-utils';
import { evaluateDays, launchProfileFromSite, DEFAULT_MAX_WIND_KMH } from '~/lib/forecast-engine';
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
import { searchSites, getSiteById, getPgsitesApiKey, type PgSite } from '~/lib/pgsites-client';
import { launchSiteValuesFromPgSite } from '~/lib/launch-sites';
import { refreshLaunchSites } from '~/app/lib/launch-sites.server';
import { defaultGoal, siteKindFromTags, SITE_KIND_LABEL } from '~/lib/site-goals';
import { SiteKindSelect } from '@/components/site-goal-picker';
import { SiteCompsCard } from '@/components/site-comps';
import { compsAtSite } from '~/app/lib/comps.server';
import { seasonSiteRef, seasonWithDays } from '~/app/lib/seasons.server';
import { SeasonCard } from '@/components/season-card';
import { flownHereFor } from '~/app/lib/flown-days.server';
import { FlownHereCard } from '@/components/flown-here';
import { flownByMonthToShow } from '~/lib/flown-days';

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
  description: string | null;
  landingDescription: string | null;
  pgeLink: string | null;
  source: string;
  createdAt: string;
  updatedAt: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Extract the pgsites UUID from a slug. Supports both formats:
 *  - New: "site-name--uuid-here" (double-dash separator)
 *  - Legacy local: slugs from local launch_sites table */
function extractPgsitesId(slug: string): string | null {
  const doubleDash = slug.indexOf('--');
  if (doubleDash !== -1) {
    return slug.slice(doubleDash + 2);
  }
  return null;
}

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
    description: site.description || null,
    landingDescription: null,
    pgeLink: site.pge_link || null,
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
    description: site.description || null,
    landingDescription: site.landingDescription || null,
    pgeLink: site.pgeLink || null,
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
  const { slug } = params;

  // 1. Kick off session + local DB lookup in parallel — neither depends on the other.
  const [localSite, session] = await Promise.all([
    db.query.launchSites.findFirst({ where: eq(launchSites.slug, slug!) }),
    getSession(request, env),
  ]);

  let site: DetailSite;
  let localSiteId: string | null = null;

  if (localSite) {
    // A followed site's copy picks up pgsites changes, like what the site gives
    const [fresh] = await refreshLaunchSites(db, apiKey, [localSite]);
    site = localSiteToDetailSite(fresh);
    localSiteId = localSite.id;
  } else {
    // Alerts sent before they linked by slug point at /sites/<id>
    if (UUID.test(slug!)) {
      const [byId, custom] = await Promise.all([
        db.query.launchSites.findFirst({ where: eq(launchSites.id, slug!) }),
        db.query.customSites.findFirst({ where: eq(customSites.id, slug!) }),
      ]);
      if (byId) throw redirect(`/sites/${byId.slug}`);
      if (custom) throw redirect(`/sites/custom/${custom.id}`);
    }

    // 2. Not found locally — extract pgsites UUID from slug and do direct API lookup
    const pgsitesId = extractPgsitesId(slug!);
    let pgSite: PgSite | null = null;

    if (pgsitesId) {
      pgSite = await getSiteById(apiKey, pgsitesId);
    }

    // Fallback: search by the name portion of the slug
    if (!pgSite) {
      const nameQuery = slug!.split('--')[0].replace(/-/g, ' ');
      if (nameQuery) {
        try {
          const results = await searchSites(apiKey, nameQuery, 5);
          if (results.length > 0) pgSite = results[0];
        } catch {
          // search failed
        }
      }
    }

    if (!pgSite) {
      throw new Response('Site not found', { status: 404 });
    }

    site = pgSiteToDetailSite(pgSite, slug!);
  }

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
  const engineSite: Site = {
    id: localSiteId || site.id,
    name: site.name,
    latitude: site.latitude,
    longitude: site.longitude,
    elevation: site.altitude || 0,
    idealWindDirections: favorite?.customIdealDirections || getIdealWindDirections(site),
    okWindDirections: favorite?.customIdealDirections ? [] : getOkWindDirections(site),
    maxWindSpeed: customMaxWind || site.maxWindSpeed || DEFAULT_MAX_WIND_KMH,
    kind,
    goal: favorite?.goal ?? defaultGoal(kind, site.isHike),
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
  const [comps, seasonFull] = await Promise.all([
    compsPromise,
    seasonWithDays(db, seasonSiteRef('pgsites', pgsitesId), engineSite, compsToday),
  ]);
  // Days pilots flew from here (Syncing Pilots): streamed in after the page
  const flown =
    today && timeZone
      ? flownHereFor(
          env,
          db,
          { latitude: site.latitude, longitude: site.longitude, altitude: site.altitude },
          timeZone,
          today,
          seasonFull?.days ?? null,
          engineSite.goal ?? 'soar',
        ).catch(() => null)
      : Promise.resolve(null);

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
    isAuthenticated: !!session?.user?.id,
    scores,
    today,
    forecastError,
    comps,
    compsToday,
    season: seasonFull?.summary ?? null,
    flown,
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
      <Link to="/auth/signin">
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
    isAuthenticated,
    scores,
    today,
    forecastError,
    comps,
    compsToday,
    season,
    flown,
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
                </div>
              ) : null;
            })()}
            <div>
              <span className="font-medium">Max Wind Speed:</span>{' '}
              {customMaxWind ? (
                <span className="text-muted-foreground">
                  {customMaxWind} km/h <span className="text-xs">(your limit)</span>
                  {site.maxWindSpeed && (
                    <span className="text-xs ml-1 opacity-60">
                      · site default: {site.maxWindSpeed} km/h
                    </span>
                  )}
                </span>
              ) : (
                <span className="text-muted-foreground">
                  {site.maxWindSpeed
                    ? `${site.maxWindSpeed} km/h`
                    : `${DEFAULT_MAX_WIND_KMH} km/h (default)`}
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

          <SiteSourceCredit pgeLink={site.pgeLink} />
        </div>
      </Card>
    </div>
  );
}
