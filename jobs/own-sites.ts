// The sites pilots keep: every followed site and every private site, as the
// jobs that rate them (the season build, the ensembles). Launches followed
// by several pilots with the same settings are one job.

import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import * as schema from '../src/db/schema';
import { customSites, launchSites, userFavoriteSites } from '../src/db/schema';
import { launchSiteToSite } from '../src/lib/launch-sites';
import { customSiteToSite } from '../src/lib/custom-sites';
import { jobFor, type Job } from '../src/lib/season-build/core';
import type { JobsEnv } from './env';

export async function ownJobs(env: JobsEnv): Promise<Job[]> {
  const db = drizzle(env.DB, { schema });
  const [followed, customs] = await Promise.all([
    db
      .select({ favorite: userFavoriteSites, site: launchSites })
      .from(userFavoriteSites)
      .innerJoin(launchSites, eq(launchSites.id, userFavoriteSites.siteId)),
    db.select().from(customSites),
  ]);
  const jobs = [
    ...followed.map((f) =>
      jobFor(`pg:${f.site.pgsitesId}`, launchSiteToSite(f.site, f.favorite), {
        label: 'followed site',
        name: f.site.name,
        countryCode: f.site.countryCode?.toLowerCase() ?? null,
        destination: null,
      }),
    ),
    ...customs.map((c) =>
      jobFor(`custom:${c.id}`, customSiteToSite(c), {
        label: 'your own site',
        name: null,
        countryCode: null,
        destination: null,
      }),
    ),
  ];
  return [...new Map(jobs.map((j) => [j.key, j])).values()];
}
