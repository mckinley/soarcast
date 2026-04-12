import type { LoaderFunctionArgs } from 'react-router';
import { getDb } from '~/app/lib/db.server';
import { launchSites } from '~/db/schema';
import { asc } from 'drizzle-orm';

// Resource route — no default export (no UI), just data endpoints.
// Pattern: API routes in RR7 are just loader/action exports without a component.

export async function loader({ context }: LoaderFunctionArgs) {
  const env = context.cloudflare.env as Env;
  const db = getDb(env);

  const sites = await db
    .select({
      id: launchSites.id,
      name: launchSites.name,
      slug: launchSites.slug,
      latitude: launchSites.latitude,
      longitude: launchSites.longitude,
      elevation: launchSites.altitude,
      region: launchSites.region,
      countryCode: launchSites.countryCode,
    })
    .from(launchSites)
    .orderBy(asc(launchSites.name));

  return Response.json({ sites });
}
