import type { Route } from './+types/sitemap[.]xml';
import { getDb } from '~/app/lib/db.server';
import { guidePages } from '~/app/lib/guide.server';
import { launchSites } from '~/db/schema';
import { launchSiteSlug } from '~/lib/site-address';

/**
 * /sitemap.xml (pjmgmt's canonical-urls standard): the public pages, every
 * Guide page and the listed sites pilots follow. Other listed sites are left
 * out: each page fetches a forecast, and pgsites' own sitemap lists them all.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env as Env;
  const origin = new URL(request.url).origin;
  const sites = await getDb(env)
    .select({ slug: launchSites.slug, name: launchSites.name, pgsitesId: launchSites.pgsitesId })
    .from(launchSites);
  const paths = [
    '/',
    '/planning',
    '/sites/browse',
    '/guide',
    ...guidePages().map((page) => `/guide/${page.slug}`),
    ...sites.map((site) => `/sites/${launchSiteSlug(site)}`).sort(),
  ];
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...paths.map((path) => `  <url><loc>${escapeXml(origin + path)}</loc></url>`),
    '</urlset>',
    '',
  ].join('\n');
  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}

function escapeXml(text: string): string {
  return text.replace(/[<>&'"]/g, (c) => `&#${c.charCodeAt(0)};`);
}
