import { NextRequest, NextResponse } from 'next/server';
import { db, launchSites } from '@/db';
import { eq } from 'drizzle-orm';
import { fetchAtmosphericProfile } from '@/lib/weather-profile';

/**
 * GET /api/sites/[slug]/profile - Returns atmospheric profile for a specific launch site
 * Query params:
 *   - days: Number of days to fetch (default: 2, max: 7)
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const searchParams = request.nextUrl.searchParams;
    const daysParam = searchParams.get('days');
    const days = daysParam ? Math.min(Math.max(parseInt(daysParam, 10), 1), 7) : 2;

    // Fetch site by slug
    const site = await db.query.launchSites.findFirst({
      where: eq(launchSites.slug, slug),
    });

    if (!site) {
      return NextResponse.json(
        {
          error: 'Launch site not found',
          status: 404,
        },
        { status: 404 },
      );
    }

    // Fetch atmospheric profile
    const lat = parseFloat(site.latitude);
    const lng = parseFloat(site.longitude);

    if (isNaN(lat) || isNaN(lng)) {
      return NextResponse.json(
        {
          error: 'Invalid site coordinates',
          status: 400,
        },
        { status: 400 },
      );
    }

    const profile = await fetchAtmosphericProfile(lat, lng, days);

    return NextResponse.json(profile, {
      status: 200,
      headers: {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200',
      },
    });
  } catch (error) {
    console.error('Error fetching atmospheric profile:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to fetch atmospheric profile',
        status: 500,
      },
      { status: 500 },
    );
  }
}
