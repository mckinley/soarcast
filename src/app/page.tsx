import { getDashboardData, refreshAllForecasts } from './actions';
import { getSettings } from './settings/actions';
import { DashboardClient } from '@/components/dashboard-client';
import { auth } from '@/auth';

export default async function Home() {
  const [data, settings, session] = await Promise.all([
    getDashboardData(),
    getSettings(),
    auth(),
  ]);

  return (
    <DashboardClient
      data={data}
      settings={settings}
      refreshAction={refreshAllForecasts}
      isAuthenticated={!!session?.user?.id}
    />
  );
}
