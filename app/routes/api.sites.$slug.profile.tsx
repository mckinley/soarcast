import type { LoaderFunctionArgs } from 'react-router';
import { getDb } from '~/app/lib/db.server';
import { launchSites } from '~/db/schema';
import { eq } from 'drizzle-orm';
import { fetchAtmosphericProfile } from '~/lib/weather-profile';
import { searchSites, getSiteById, getPgsitesApiKey } from '~/lib/pgsites-client';

export async function loader({ params, request, context }: LoaderFunctionArgs) {
  const env = context.cloudflare.env as Env;
  const db = getDb(env);
  const { slug } = params;

  try {
    const url = new URL(request.url);
    const daysParam = url.searchParams.get('days');
    const days = daysParam ? Math.min(Math.max(parseInt(daysParam, 10), 1), 7) : 2;

    // 1. Try local launch_sites first (fast path)
    const localSite = await db.query.launchSites.findFirst({
      where: eq(launchSites.slug, slug!),
    });

    let lat: number;
    let lng: number;

    if (localSite) {
      lat = localSite.latitude;
      lng = localSite.longitude;
    } else {
      // 2. Fallback: parse slug and look up via pgsites API
      const apiKey = getPgsitesApiKey(env);
      const lastHyphen = slug!.lastIndexOf('-');
      const uuidPrefix = lastHyphen !== -1 ? slug!.slice(lastHyphen + 1) : '';
      const nameSlug = lastHyphen !== -1 ? slug!.slice(0, lastHyphen) : slug!;
      const nameQuery = nameSlug.replace(/-/g, ' ');

      let pgSite = null;
      if (uuidPrefix.length >= 8) {
        const results = await searchSites(apiKey, nameQuery, 50);
        pgSite = results.find((s) => s.id.startsWith(uuidPrefix)) ?? null;
        if (!pgSite) {
          pgSite = await getSiteById(apiKey, uuidPrefix);
        }
      }

      if (!pgSite) {
        return Response.json({ error: 'Launch site not found', status: 404 }, { status: 404 });
      }

      lat = pgSite.latitude;
      lng = pgSite.longitude;
    }

    const profile = await fetchAtmosphericProfile(lat, lng, days);

    return Response.json(profile, {
      headers: {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200',
      },
    });
  } catch (error) {
    console.error('Error fetching atmospheric profile:', error);
    return Response.json(
      {
        error: error instanceof Error ? error.message : 'Failed to fetch atmospheric profile',
        status: 500,
      },
      { status: 500 },
    );
  }
}
