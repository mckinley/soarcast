import type { LoaderFunctionArgs } from 'react-router';
import { getDb } from '~/app/lib/db.server';
import { launchSites } from '~/db/schema';
import { eq } from 'drizzle-orm';
import { fetchAtmosphericProfile } from '~/lib/weather-profile';

export async function loader({ params, request, context }: LoaderFunctionArgs) {
  const env = context.cloudflare.env as Env;
  const db = getDb(env);
  const { slug } = params;

  try {
    const url = new URL(request.url);
    const daysParam = url.searchParams.get('days');
    const days = daysParam ? Math.min(Math.max(parseInt(daysParam, 10), 1), 7) : 2;

    const site = await db.query.launchSites.findFirst({
      where: eq(launchSites.slug, slug!),
    });

    if (!site) {
      return Response.json({ error: 'Launch site not found', status: 404 }, { status: 404 });
    }

    const lat = site.latitude;
    const lng = site.longitude;

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
