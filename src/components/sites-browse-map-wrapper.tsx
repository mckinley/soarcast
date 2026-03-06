'use client';

import dynamic from 'next/dynamic';
import type { LaunchSite } from '@/db/schema';

const SitesBrowseMap = dynamic(
  () => import('@/components/sites-browse-map').then((mod) => mod.SitesBrowseMap),
  {
    ssr: false,
    loading: () => (
      <div className="h-[500px] rounded-md border bg-muted animate-pulse flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading map...</p>
      </div>
    ),
  },
);

export function SitesBrowseMapWrapper({ sites }: { sites: LaunchSite[] }) {
  return <SitesBrowseMap sites={sites} />;
}
