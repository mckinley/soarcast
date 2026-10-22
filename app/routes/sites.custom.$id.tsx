import { Suspense } from 'react';
import { Await, useLoaderData, Link } from 'react-router';
import type { Route } from './+types/sites.custom.$id';
import { getDb } from '~/app/lib/db.server';
import { requireAuth } from '~/app/lib/auth.server';
import { findOwnedCustomSite } from '~/app/lib/custom-sites.server';
import { customSiteToSite } from '~/lib/custom-sites';
import { pgsitesSlug } from '~/lib/pgsites-client';
import { evaluateDays, launchProfileFromSite } from '~/lib/forecast-engine';
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
import { flownHere } from '~/lib/flown-days';
import {
  howSureExperiment,
  showsExperiments,
  windsExperiment,
} from '~/app/lib/experiments.server';
import { ExperimentsSection, FlownWindsCard } from '@/components/flown-winds';
import { HowSureCard } from '@/components/how-sure';
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
  const site = customSiteToSite(customSite);

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
  // Experiments, for pilots who switched them on in Settings
  const windsOnFlownDays = experiments ? windsExperiment(db, seasonRef, site, flownDays) : null;
  const howSure = experiments ? howSureExperiment(db, seasonRef, site) : null;
  return {
    site,
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
    xc,
    windsOnFlownDays,
    howSure,
  };
}

export default function CustomSiteDetailPage() {
  const {
    site,
    sharedSlug,
    scores,
    today,
    forecastError,
    comps,
    compsToday,
    season,
    flown,
    xc,
    windsOnFlownDays,
    howSure,
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
          <div>
            <span className="font-medium">Max Wind Speed:</span>{' '}
            <span className="text-muted-foreground">{site.maxWindSpeed} km/h</span>
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

      {(howSure || windsOnFlownDays) && (
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
        </ExperimentsSection>
      )}
    </div>
  );
}
