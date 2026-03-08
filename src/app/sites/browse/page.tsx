import type { Metadata } from 'next';
import { getLaunchSites, getFilterOptions, getSiteScoresForBrowse } from './actions';
import { SitesBrowseClient } from './browse-client';

export const metadata: Metadata = {
  title: 'Browse Launch Sites',
  description:
    'Browse paragliding and hang gliding launch sites from ParaglidingEarth. Find new flying locations and add them to your favorites.',
};

export default async function BrowseSitesPage({
  searchParams,
}: {
  searchParams: Promise<{
    search?: string;
    region?: string;
    country?: string;
    siteType?: string;
    orientations?: string;
    sort?: string;
    minScore?: string;
  }>;
}) {
  const params = await searchParams;

  // Parse orientations from comma-separated string
  const orientations = params.orientations
    ? params.orientations.split(',').filter(Boolean)
    : undefined;

  const sites = await getLaunchSites({
    search: params.search,
    region: params.region,
    country: params.country,
    siteType: params.siteType,
    orientations,
  });

  const [filterOptions, siteScores] = await Promise.all([
    getFilterOptions(),
    getSiteScoresForBrowse(sites),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Browse Launch Sites</h1>
        <p className="text-muted-foreground mt-2">
          Discover paragliding launch sites imported from ParaglidingEarth
        </p>
      </div>

      <SitesBrowseClient initialSites={sites} filterOptions={filterOptions} searchParams={params} siteScores={siteScores} />
    </div>
  );
}
