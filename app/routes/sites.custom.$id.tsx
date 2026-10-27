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
import { SiteForecast, ForecastUnavailable } from '@/components/site-forecast';
import { FactRow, SiteHeader, SiteSection, heightText } from '@/components/site-page';
import { LiveNow } from '@/components/live-now';
import { ForecastTrackRecord } from '@/components/forecast-track-record';
import { SITE_KIND_LABEL } from '~/lib/site-goals';
import { MapDisplayWrapper } from '@/components/map-display-wrapper';
import { RecentSiteTracker } from '@/components/recent-site-tracker';
import { DirectionLegend, LaunchDirectionPicker } from '@/components/launch-direction-picker';
import { SiteKindSelect } from '@/components/site-goal-picker';
import { SiteCompsCard } from '@/components/site-comps';
import { compsAtSite } from '~/app/lib/comps.server';
import { seasonSiteRef, seasonWithDays } from '~/app/lib/seasons.server';
import { SeasonCard } from '@/components/season-card';
import { flownDaysAt } from '~/app/lib/flown-days.server';
import { upNowAt } from '~/app/lib/up-now.server';
import { ognNowAt } from '~/app/lib/ogn.server';
import { windNowAt } from '~/app/lib/wind-now.server';
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
import { Lock, Pencil } from 'lucide-react';
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
    <div className="space-y-8">
      <RecentSiteTracker site={{ id: site.id, name: site.name, slug: `custom/${site.id}` }} />

      <div className="space-y-5">
        <SiteHeader
          back={{ to: '/dashboard', label: 'Forecast' }}
          title={site.name}
          facts={[
            <span key="private" className="inline-flex items-center gap-1">
              <Lock className="size-3.5" />
              Private
            </span>,
            site.elevation > 0 ? `${site.elevation.toLocaleString('en-US')} m` : null,
            site.kind ? SITE_KIND_LABEL[site.kind] : null,
            `Wind limit ${site.maxWindSpeed} km/h`,
          ]}
          actions={
            <Button variant="outline" asChild>
              <Link to={`/sites/custom/${site.id}/edit`} aria-label="Edit this site">
                <Pencil className="size-4" />
                <span className="hidden sm:inline">Edit</span>
              </Link>
            </Button>
          }
        >
          <p className="text-sm text-muted-foreground">
            {sharedSlug ? (
              <>
                Other pilots can find it as a{' '}
                <Link to={`/sites/${sharedSlug}`} className="underline underline-offset-2">
                  shared launch
                </Link>
                . Notes, the wind limit and the goal stay private.
              </>
            ) : (
              'Only you can see it.'
            )}
          </p>
        </SiteHeader>

        {forecastError || !scores || !today ? (
          <ForecastUnavailable />
        ) : (
          <SiteForecast
            site={site}
            scores={scores}
            today={today}
            goalTarget={{ siteId: site.id, source: 'custom' }}
            comps={comps}
            typicalWeek={season?.typicalWeek ?? null}
          />
        )}
      </div>

      <LiveNow upNow={upNow} windNow={windNow} launchAltitude={site.elevation ?? null} />

      <SiteSection title="Over the year">
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
        {today && (
          <ForecastTrackRecord latitude={site.latitude} longitude={site.longitude} today={today} />
        )}
        {xc && <XcFlightsCard xc={xc} today={compsToday} />}
        <SiteCompsCard comps={comps} today={compsToday} />
      </SiteSection>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold tracking-tight">About this site</h2>
        <Card className="gap-0 p-5 md:p-7">
          <div className="grid gap-8 lg:grid-cols-2">
            <div className="space-y-6">
              <dl>
                {site.elevation > 0 && (
                  <FactRow label="Takeoff">{heightText(site.elevation)}</FactRow>
                )}
                <FactRow label="What it gives">
                  <SiteKindSelect
                    target={{ siteId: site.id, source: 'custom' }}
                    kind={site.kind ?? null}
                  />
                </FactRow>
                <FactRow label="Wind limit">
                  {site.maxWindSpeed} km/h
                  {usualWindLimit && (
                    <span className="text-muted-foreground"> (the usual limit)</span>
                  )}
                </FactRow>
                {ground && (
                  <FactRow label="Terrain">
                    {TERRAIN_LABEL[ground]}
                    <MountainMarginsNote
                      ground={ground}
                      rated={site.terrain === 'mountains'}
                      ridge={site.kind === 'ridge'}
                      signedIn
                    />
                  </FactRow>
                )}
                <FactRow label="Position">
                  <span className="tabular-nums">
                    {site.latitude.toFixed(4)}, {site.longitude.toFixed(4)}
                  </span>
                </FactRow>
              </dl>

              <div className="space-y-2">
                <h3 className="text-sm font-semibold">Launch directions</h3>
                {site.idealWindDirections.length > 0 || (site.okWindDirections ?? []).length > 0 ? (
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <LaunchDirectionPicker
                      ratings={Object.fromEntries([
                        ...(site.okWindDirections ?? []).map((d) => [d, 1 as const]),
                        ...site.idealWindDirections.map((d) => [d, 2 as const]),
                      ])}
                      className="h-36 w-36"
                    />
                    <DirectionLegend />
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    None set, so any wind direction counts as working.{' '}
                    <Link to={`/sites/custom/${site.id}/edit`} className="underline">
                      Set them
                    </Link>
                  </p>
                )}
              </div>

              {site.notes && (
                <div className="space-y-1.5">
                  <h3 className="text-sm font-semibold">Notes</h3>
                  <p className="text-sm whitespace-pre-line text-muted-foreground">{site.notes}</p>
                </div>
              )}
            </div>

            <MapDisplayWrapper latitude={site.latitude} longitude={site.longitude} />
          </div>
        </Card>
      </section>

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
