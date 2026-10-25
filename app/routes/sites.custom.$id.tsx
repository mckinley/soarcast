import { Suspense } from 'react';
import { Await, useLoaderData, Link } from 'react-router';
import type { Route } from './+types/sites.custom.$id';
import { getDb } from '~/app/lib/db.server';
import { requireAuth } from '~/app/lib/auth.server';
import { fillCustomTerrain, findOwnedCustomSite } from '~/app/lib/custom-sites.server';
import { keepsMountainMargins } from '~/app/lib/mountain-margins.server';
import { MountainMarginsNote } from '@/components/mountain-margins-note';
import { customSiteToSite } from '~/lib/custom-sites';
import { pgsitesSlug } from '~/lib/pgsites-client';
import { defaultWindLimit, evaluateDays, launchProfileFromSite } from '~/lib/forecast-engine';
import { siteTerrain, TERRAIN_LABEL } from '~/lib/site-terrain';
import { getAtmosphericProfile, profileToday, setProfileDb } from '~/lib/weather-profile';
import { SiteDetailClient, ForecastUnavailable } from '@/components/site-detail-client';
import { MapDisplayWrapper } from '@/components/map-display-wrapper';
import { RecentSiteTracker } from '@/components/recent-site-tracker';
import { DirectionLegend, LaunchDirectionPicker } from '@/components/launch-direction-picker';
import { ElevationDisplay } from '@/components/elevation-display';
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
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ArrowLeft, Lock, Pencil } from 'lucide-react';
import type { DayScore } from '~/types';

export function meta({ data }: Route.MetaArgs) {
  if (!data?.site) return [{ title: 'Site Not Found | SoarCast' }];
  return [
    { title: `${data.site.name} | SoarCast` },
    { name: 'description', content: `7-day flying forecast for ${data.site.name}.` },
    // A private site is its owner's alone
    { name: 'robots', content: 'noindex' },
  ];
}

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env as Env;
  const session = await requireAuth(request, env);
  const db = getDb(env);
  const { id } = params;

  const customSite = await findOwnedCustomSite(db, id!, session.user.id);
  if (!customSite) {
    throw new Response('Site not found', { status: 404 });
  }
  // A site saved before its terrain was measured gets it now
  const [margins] = await Promise.all([
    keepsMountainMargins(db, session.user.id),
    fillCustomTerrain(db, [customSite]),
  ]);
  const site = customSiteToSite(customSite, margins);
  const ground = siteTerrain(customSite.terrain, customSite.terrainSlope, customSite.terrainRelief);

  // Comps held here, fetched while the forecast loads
  const compsPromise = compsAtSite(env, site.latitude, site.longitude);

  let scores: DayScore[] | null = null;
  let today: string | null = null;
  let timeZone: string | null = null;
  let forecastError = false;
  try {
    setProfileDb(db);
    const { profile } = await getAtmosphericProfile(site.latitude, site.longitude, 7);
    scores = evaluateDays(profile, launchProfileFromSite(site));
    today = profileToday(profile);
    timeZone = profile.timezone;
  } catch (e) {
    console.error(`Forecast for ${site.name} failed:`, e);
    forecastError = true;
  }

  // Without a forecast, comps and the season go by the UTC date
  const compsToday = today ?? new Date().toISOString().slice(0, 10);
  const seasonRef = seasonSiteRef('custom', site.id);
  const [comps, seasonFull, xc, experiments] = await Promise.all([
    compsPromise,
    seasonWithDays(db, seasonRef, site, compsToday),
    nogaFlightsAt(db, site.latitude, site.longitude),
    showsExperiments(db, session.user.id),
  ]);
  // Days pilots flew from here (Syncing Pilots): streamed in after the page
  const flownDays =
    today && timeZone
      ? flownDaysAt(
          env,
          db,
          { latitude: site.latitude, longitude: site.longitude, altitude: site.elevation },
          timeZone,
          today,
        ).catch(() => null)
      : Promise.resolve(null);
  const flown = flownDays.then((f) =>
    f ? flownHere(f, seasonFull?.days ?? null, site.goal ?? 'launch') : null,
  );
  // Pilots up here now (Syncing Pilots): streamed in after the page
  const upNowSp = timeZone
    ? upNowAt(
        env,
        { latitude: site.latitude, longitude: site.longitude, altitude: site.elevation },
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
  const windsOnFlownDays = experiments ? windsExperiment(db, seasonRef, site, flownDays) : null;
  const howSure = experiments ? howSureExperiment(db, seasonRef, site) : null;
  const terrain = experiments
    ? terrainExperiment(db, { latitude: site.latitude, longitude: site.longitude }, today, timeZone)
    : null;
  return {
    site,
    ground,
    // The limit is the usual one for the terrain unless the pilot set one
    usualWindLimit: customSite.maxWindSpeed > 0 ? null : defaultWindLimit(site.terrain, site.kind),
    // Its listed copy, when its pilot shared it
    sharedSlug: customSite.sharedSiteId
      ? pgsitesSlug(customSite.name, customSite.sharedSiteId)
      : null,
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

export default function CustomSiteDetailPage() {
  const {
    site,
    ground,
    usualWindLimit,
    sharedSlug,
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
      goal={site.goal ?? 'launch'}
      today={compsToday}
      comps={comps}
      followed
      flownByMonth={flownByMonth}
    />
  );

  return (
    <div className="space-y-6">
      <RecentSiteTracker site={{ id: site.id, name: site.name, slug: `custom/${site.id}` }} />

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <Link to="/dashboard">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Dashboard
          </Button>
        </Link>
        <Button variant="outline" size="sm" asChild>
          <Link to={`/sites/custom/${site.id}/edit`}>
            <Pencil className="mr-2 h-4 w-4" />
            Edit
          </Link>
        </Button>
      </div>

      {/* Site name */}
      <div>
        <h1 className="text-3xl font-bold">{site.name}</h1>
        <p className="text-muted-foreground mt-1 inline-flex items-center gap-1.5">
          <Lock className="h-4 w-4" />
          {sharedSlug ? (
            <span>
              Private site. Other pilots can find it as a{' '}
              <Link to={`/sites/${sharedSlug}`} className="underline underline-offset-2">
                shared launch
              </Link>
              . Notes, the wind limit and the goal stay private.
            </span>
          ) : (
            'Private site. Only you can see it.'
          )}
        </p>
      </div>

      <Suspense fallback={null}>
        <Await resolve={upNow} errorElement={null}>
          {(u) => (
            <UpNowCard
              up={u.sp}
              ogn={u.ogn}
              launchAltitude={site.elevation ?? null}
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
                launchAltitude={site.elevation ?? null}
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
          site={site}
          scores={scores}
          today={today}
          goalTarget={{ siteId: site.id, source: 'custom' }}
          comps={comps}
          typicalWeek={season?.typicalWeek ?? null}
        />
      )}

      <Suspense fallback={seasonCard(null)}>
        <Await resolve={flown} errorElement={seasonCard(null)}>
          {(f) => (
            <>
              {seasonCard(flownByMonthToShow(f))}
              <FlownHereCard flown={f} goal={site.goal ?? 'launch'} />
            </>
          )}
        </Await>
      </Suspense>

      {xc && <XcFlightsCard xc={xc} today={compsToday} />}

      <SiteCompsCard comps={comps} today={compsToday} />

      {/* Location & Details — always visible */}
      <Card className="p-4 sm:p-6">
        <h2 className="text-lg font-semibold mb-4">Location &amp; Details</h2>
        <div className="space-y-3 text-sm">
          {site.elevation > 0 && (
            <div>
              <ElevationDisplay elevationMeters={site.elevation} label="Takeoff" />
            </div>
          )}
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
            <span className="font-medium">What it gives:</span>
            <SiteKindSelect
              target={{ siteId: site.id, source: 'custom' }}
              kind={site.kind ?? null}
            />
          </div>
          <div>
            <div className="font-medium mb-2">Launch directions:</div>
            {site.idealWindDirections.length > 0 || (site.okWindDirections ?? []).length > 0 ? (
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <LaunchDirectionPicker
                  ratings={Object.fromEntries([
                    ...(site.okWindDirections ?? []).map((d) => [d, 1 as const]),
                    ...site.idealWindDirections.map((d) => [d, 2 as const]),
                  ])}
                  className="w-36 h-36"
                />
                <DirectionLegend />
              </div>
            ) : (
              <p className="text-muted-foreground">
                None set, so any wind direction counts as working.{' '}
                <Link to={`/sites/custom/${site.id}/edit`} className="underline">
                  Set them
                </Link>
              </p>
            )}
          </div>
          {site.notes && (
            <div>
              <div className="font-medium mb-1">Notes:</div>
              <p className="text-muted-foreground whitespace-pre-line">{site.notes}</p>
            </div>
          )}
          {ground && (
            <div>
              <span className="font-medium">Terrain:</span>{' '}
              <span className="text-muted-foreground">
                {TERRAIN_LABEL[ground]}
                <MountainMarginsNote
                  ground={ground}
                  rated={site.terrain === 'mountains'}
                  ridge={site.kind === 'ridge'}
                  signedIn
                />
              </span>
            </div>
          )}
          <div>
            <span className="font-medium">Max Wind Speed:</span>{' '}
            <span className="text-muted-foreground">
              {site.maxWindSpeed} km/h
              {usualWindLimit && <span className="text-xs"> (the usual limit here)</span>}
            </span>
          </div>
          <div className="text-xs text-muted-foreground">
            Location: {site.latitude.toFixed(4)}°, {site.longitude.toFixed(4)}°
          </div>
          <div>
            <h3 className="text-sm font-medium mb-2">Location Map</h3>
            <MapDisplayWrapper latitude={site.latitude} longitude={site.longitude} />
          </div>
        </div>
      </Card>

      {(howSure || windsOnFlownDays || terrain) && (
        <ExperimentsSection>
          {howSure && (
            <Suspense fallback={null}>
              <Await resolve={howSure} errorElement={null}>
                {(h) => <HowSureCard experiment={h} scores={scores} followed />}
              </Await>
            </Suspense>
          )}
          {windsOnFlownDays && (
            <Suspense fallback={null}>
              <Await resolve={windsOnFlownDays} errorElement={null}>
                {(w) => <FlownWindsCard experiment={w} followed />}
              </Await>
            </Suspense>
          )}
          {terrain && (
            <Suspense fallback={null}>
              <Await resolve={terrain} errorElement={null}>
                {(t) => (
                  <TerrainStudyCard
                    experiment={t}
                    ideal={site.idealWindDirections}
                    ok={site.okWindDirections ?? []}
                    listedAltitude={null}
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
