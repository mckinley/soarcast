import type { LoaderFunctionArgs } from 'react-router';
import { desc, eq } from 'drizzle-orm';
import { getDb } from '~/app/lib/db.server';
import { flownDaysAt } from '~/app/lib/flown-days.server';
import { seasonSiteRef } from '~/app/lib/seasons.server';
import { siteSeasons } from '~/db/schema';
import { checkAgainstFlown, flownShareByMonth } from '~/lib/flown-days';
import { getPgsitesApiKey, getSiteById } from '~/lib/pgsites-client';
import { decodeSeasonDays } from '~/lib/seasons';
import { defaultGoal, siteKindFromTags } from '~/lib/site-goals';
import { getAtmosphericProfile, profileToday, setProfileDb } from '~/lib/weather-profile';
import type { SiteGoal } from '~/types';

// Resource route: the days pilots flew from a listed site (Syncing Pilots'
// trackers) against how SoarCast's season rated them, for each goal. Site
// pages show the same through their loader; this is for checking the engine
// across many sites. ?site=<pgsites id>

const GOALS: SiteGoal[] = ['launch', 'soar', 'great'];

export async function loader({ request, context }: LoaderFunctionArgs) {
  const env = context.cloudflare.env as Env;
  const id = new URL(request.url).searchParams.get('site') ?? '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return Response.json({ error: 'site must be a pgsites id' }, { status: 400 });
  }
  const db = getDb(env);
  const site = await getSiteById(getPgsitesApiKey(env), id);
  if (!site) return Response.json({ error: 'Site not found' }, { status: 404 });

  try {
    setProfileDb(db);
    const { profile } = await getAtmosphericProfile(site.latitude, site.longitude, 7);
    const today = profileToday(profile);
    const flown = await flownDaysAt(
      env,
      db,
      { latitude: site.latitude, longitude: site.longitude, altitude: site.altitude },
      profile.timezone,
      today,
    );
    if (!flown) return Response.json({ error: 'Flown days unavailable' }, { status: 502 });

    // The newest season row: the way the season build rated it last
    const [row] = await db
      .select()
      .from(siteSeasons)
      .where(eq(siteSeasons.siteRef, seasonSiteRef('pgsites', id)))
      .orderBy(desc(siteSeasons.builtAt))
      .limit(1);
    const season = row ? decodeSeasonDays(row.days) : null;
    const kind = siteKindFromTags({ thermal: site.is_thermal, soaring: site.is_soaring, xc: site.is_xc });

    return Response.json({
      site: { id, name: site.name, countryCode: site.country_code, kind, goal: defaultGoal(kind, !!site.is_hike) },
      timeZone: profile.timezone,
      fromDate: flown.fromDate,
      toDate: flown.toDate,
      days: flown.days,
      // The days rated one by one, which the checks use
      season:
        season && season.length > 0
          ? { fromDate: season[0].date, toDate: season[season.length - 1].date, source: row.source }
          : null,
      checks: season
        ? Object.fromEntries(GOALS.map((goal) => [goal, checkAgainstFlown(season, flown.days, goal)]))
        : null,
      byMonth: season ? flownShareByMonth(season, flown.days) : null,
    });
  } catch (error) {
    console.error('Flown days check failed:', error);
    return Response.json({ error: 'Flown days unavailable' }, { status: 502 });
  }
}
