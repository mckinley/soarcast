import { getDashboardData, refreshAllForecasts } from './actions';
import { getSettings } from './settings/actions';
import { DashboardClient } from '@/components/dashboard-client';

export default async function Home() {
  const [data, settings] = await Promise.all([getDashboardData(), getSettings()]);

  return <DashboardClient data={data} settings={settings} refreshAction={refreshAllForecasts} />;
}
