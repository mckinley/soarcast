import { NextRequest, NextResponse } from 'next/server';
import { db, launchSites } from '@/db';
import { eq } from 'drizzle-orm';

/**
 * GET /api/sites/[slug] - Returns a single launch site by slug
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;

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

    return NextResponse.json(site, {
      status: 200,
      headers: {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200',
      },
    });
  } catch (error) {
    console.error('Error fetching launch site:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to fetch launch site',
        status: 500,
      },
      { status: 500 },
    );
  }
}
