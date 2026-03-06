import type { Metadata } from 'next';
import { getLaunchSites } from './actions';
import { SitesBrowseMapWrapper } from '@/components/sites-browse-map-wrapper';
import { SitesBrowseClient } from './browse-client';

export const metadata: Metadata = {
  title: 'Browse Launch Sites',
  description:
    'Browse paragliding and hang gliding launch sites from ParaglidingEarth. Find new flying locations and add them to your favorites.',
};

export default async function BrowseSitesPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; region?: string }>;
}) {
  const params = await searchParams;
  const sites = await getLaunchSites({
    search: params.search,
    region: params.region,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Browse Launch Sites</h1>
        <p className="text-muted-foreground mt-2">
          Discover paragliding launch sites imported from ParaglidingEarth
        </p>
      </div>

      <SitesBrowseClient initialSites={sites} />

      <div className="mt-6">
        <SitesBrowseMapWrapper sites={sites} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sites.length === 0 ? (
          <div className="col-span-full text-center py-12 border-2 border-dashed rounded-lg">
            <p className="text-muted-foreground">No sites found matching your criteria</p>
          </div>
        ) : (
          sites.map((site) => (
            <div
              key={site.id}
              className="border rounded-lg p-4 hover:border-primary/50 transition-colors"
            >
              <h3 className="font-semibold text-lg mb-2">{site.name}</h3>
              <div className="text-sm text-muted-foreground space-y-1">
                {site.region && <p>Region: {site.region}</p>}
                {site.elevation && <p>Elevation: {site.elevation}m</p>}
                {site.flyingTypes && site.flyingTypes.length > 0 && (
                  <p>Flying: {site.flyingTypes.join(', ')}</p>
                )}
                {site.orientations && (
                  <p>
                    Orientations:{' '}
                    {Object.entries(site.orientations)
                      .filter(([, rating]) => rating >= 1)
                      .map(([dir]) => dir)
                      .join(', ')}
                  </p>
                )}
              </div>
              <div className="mt-4 flex gap-2">
                <a
                  href={`/sites/${site.slug}`}
                  className="text-sm text-blue-600 hover:underline dark:text-blue-400"
                >
                  View Details →
                </a>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
