import { NextRequest, NextResponse } from 'next/server';
import { db, launchSites } from '@/db';
import { like, or, and } from 'drizzle-orm';

/**
 * GET /api/sites - Returns filtered launch sites
 * Query params:
 *   - region: Filter by region (e.g., "washington")
 *   - type: Filter by flying type (e.g., "paragliding", "hanggliding")
 *   - search: Search in name or region
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const region = searchParams.get('region');
    const flyingType = searchParams.get('type');
    const search = searchParams.get('search');

    // Build where conditions
    const conditions = [];

    if (region) {
      conditions.push(like(launchSites.region, `%${region}%`));
    }

    if (search) {
      conditions.push(
        or(like(launchSites.name, `%${search}%`), like(launchSites.region, `%${search}%`)),
      );
    }

    // Fetch sites with filters
    const sites = await db.query.launchSites.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      orderBy: (launchSites, { asc }) => [asc(launchSites.name)],
    });

    // Filter by flying type if specified (requires JSON parsing)
    let filteredSites = sites;
    if (flyingType) {
      filteredSites = sites.filter(
        (site) =>
          site.flyingTypes &&
          Array.isArray(site.flyingTypes) &&
          site.flyingTypes.includes(flyingType.toLowerCase()),
      );
    }

    return NextResponse.json(
      {
        count: filteredSites.length,
        sites: filteredSites,
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200',
        },
      },
    );
  } catch (error) {
    console.error('Error fetching launch sites:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to fetch launch sites',
        status: 500,
      },
      { status: 500 },
    );
  }
}
