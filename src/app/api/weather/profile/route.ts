// GET /api/weather/profile - Atmospheric profile data for windgram visualizations
import { NextRequest, NextResponse } from 'next/server';
import { getAtmosphericProfile } from '@/lib/weather-profile';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Parse and validate query parameters
    const latParam = searchParams.get('lat');
    const lngParam = searchParams.get('lng');
    const daysParam = searchParams.get('days');

    if (!latParam || !lngParam) {
      return NextResponse.json(
        { error: 'Missing required parameters: lat and lng', status: 400 },
        { status: 400 },
      );
    }

    const latitude = parseFloat(latParam);
    const longitude = parseFloat(lngParam);
    const days = daysParam ? parseInt(daysParam, 10) : 2;

    // Validate latitude/longitude ranges
    if (isNaN(latitude) || latitude < -90 || latitude > 90) {
      return NextResponse.json(
        { error: 'Invalid latitude: must be between -90 and 90', status: 400 },
        { status: 400 },
      );
    }

    if (isNaN(longitude) || longitude < -180 || longitude > 180) {
      return NextResponse.json(
        { error: 'Invalid longitude: must be between -180 and 180', status: 400 },
        { status: 400 },
      );
    }

    if (isNaN(days) || days < 1 || days > 7) {
      return NextResponse.json(
        { error: 'Invalid days: must be between 1 and 7', status: 400 },
        { status: 400 },
      );
    }

    // Fetch atmospheric profile (cached or fresh)
    const result = await getAtmosphericProfile(latitude, longitude, days);

    // Add cache metadata to response headers for debugging
    const headers: HeadersInit = {
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=1800',
    };

    if (result.isStale) {
      headers['X-Cache-Status'] = 'stale';
      headers['X-Cache-Age'] = String(result.cacheAgeHours);
    } else {
      headers['X-Cache-Status'] = 'fresh';
    }

    // Return profile data with metadata
    return NextResponse.json(
      {
        ...result.profile,
        _meta: {
          isStale: result.isStale,
          cacheAgeHours: result.cacheAgeHours,
          error: result.error,
        },
      },
      {
        status: 200,
        headers,
      },
    );
  } catch (error) {
    console.error('Error fetching atmospheric profile:', error);

    return NextResponse.json(
      {
        error: 'Failed to fetch atmospheric profile',
        status: 500,
      },
      { status: 500 },
    );
  }
}
