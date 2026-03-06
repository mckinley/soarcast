import { getDashboardData, refreshAllForecasts } from './actions';
import { getSettings, getOnboardingStatus } from '@/app/settings/actions';
import { DashboardClient } from '@/components/dashboard-client';
import { OnboardingFlow } from '@/components/onboarding-flow';
import { PrefetchProfiles } from '@/components/dashboard/prefetch-profiles';
import { auth } from '@/auth';
import { db } from '@/db';
import { launchSites } from '@/db/schema';
import { asc } from 'drizzle-orm';

export default async function DashboardPage() {
  const [data, settings, session, onboardingCompleted] = await Promise.all([
    getDashboardData(),
    getSettings(),
    auth(),
    getOnboardingStatus(),
  ]);

  // Get some popular sites for onboarding (first-time users)
  let nearbySites: Array<{
    id: string;
    name: string;
    slug: string;
    region: string | null;
    elevation: number | null;
  }> = [];

  if (!onboardingCompleted && session?.user?.id) {
    // Get popular high-elevation sites for new users
    nearbySites = await db
      .select({
        id: launchSites.id,
        name: launchSites.name,
        slug: launchSites.slug,
        region: launchSites.region,
        elevation: launchSites.elevation,
      })
      .from(launchSites)
      .orderBy(asc(launchSites.name))
      .limit(5);
  }

  // Extract sites for prefetching
  const sitesToPrefetch = data.map((d) => ({
    id: d.site.id,
    latitude: d.site.latitude,
    longitude: d.site.longitude,
  }));

  return (
    <>
      {!onboardingCompleted && session?.user?.id && <OnboardingFlow nearbySites={nearbySites} />}
      <DashboardClient
        data={data}
        settings={settings}
        refreshAction={refreshAllForecasts}
        isAuthenticated={!!session?.user?.id}
      />
      {/* Prefetch atmospheric profile data in the background */}
      <PrefetchProfiles sites={sitesToPrefetch} />
    </>
  );
}
