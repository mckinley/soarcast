import type { LoaderFunctionArgs } from 'react-router';
import { getAtmosphericProfile, setProfileDb } from '~/lib/weather-profile';
import { getDb } from '~/app/lib/db.server';

export async function loader({ request, context }: LoaderFunctionArgs) {
  const env = context.cloudflare.env as Env;
  setProfileDb(getDb(env));

  try {
    const url = new URL(request.url);
    const latParam = url.searchParams.get('lat');
    const lngParam = url.searchParams.get('lng');
    const daysParam = url.searchParams.get('days');

    if (!latParam || !lngParam) {
      return Response.json(
        { error: 'Missing required parameters: lat and lng', status: 400 },
        { status: 400 },
      );
    }

    const latitude = parseFloat(latParam);
    const longitude = parseFloat(lngParam);
    const days = daysParam ? parseInt(daysParam, 10) : 2;

    if (isNaN(latitude) || latitude < -90 || latitude > 90) {
      return Response.json(
        { error: 'Invalid latitude: must be between -90 and 90', status: 400 },
        { status: 400 },
      );
    }

    if (isNaN(longitude) || longitude < -180 || longitude > 180) {
      return Response.json(
        { error: 'Invalid longitude: must be between -180 and 180', status: 400 },
        { status: 400 },
      );
    }

    if (isNaN(days) || days < 1 || days > 7) {
      return Response.json(
        { error: 'Invalid days: must be between 1 and 7', status: 400 },
        { status: 400 },
      );
    }

    const result = await getAtmosphericProfile(latitude, longitude, days);

    const headers: HeadersInit = {
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=1800',
    };

    if (result.isStale) {
      headers['X-Cache-Status'] = 'stale';
      headers['X-Cache-Age'] = String(result.cacheAgeHours);
    } else {
      headers['X-Cache-Status'] = 'fresh';
    }

    return Response.json(
      {
        ...result.profile,
        _meta: {
          isStale: result.isStale,
          cacheAgeHours: result.cacheAgeHours,
          error: result.error,
        },
      },
      { headers },
    );
  } catch (error) {
    console.error('Error fetching atmospheric profile:', error);
    return Response.json(
      { error: 'Failed to fetch atmospheric profile', status: 500 },
      { status: 500 },
    );
  }
}
