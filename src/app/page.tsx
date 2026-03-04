import { getDashboardData, refreshAllForecasts } from './actions';
import { DashboardClient } from '@/components/dashboard-client';

export default async function Home() {
  const data = await getDashboardData();

  return <DashboardClient data={data} refreshAction={refreshAllForecasts} />;
}
