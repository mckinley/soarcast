import type { LoaderFunctionArgs } from 'react-router';
import { getDb } from '~/app/lib/db.server';
import { launchSites } from '~/db/schema';
import { eq } from 'drizzle-orm';

export async function loader({ params, context }: LoaderFunctionArgs) {
  const env = context.cloudflare.env as Env;
  const db = getDb(env);
  const { slug } = params;

  try {
    const site = await db.query.launchSites.findFirst({
      where: eq(launchSites.slug, slug!),
    });

    if (!site) {
      return Response.json({ error: 'Launch site not found', status: 404 }, { status: 404 });
    }

    return Response.json(site, {
      headers: {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200',
      },
    });
  } catch (error) {
    console.error('Error fetching launch site:', error);
    return Response.json(
      {
        error: error instanceof Error ? error.message : 'Failed to fetch launch site',
        status: 500,
      },
      { status: 500 },
    );
  }
}
