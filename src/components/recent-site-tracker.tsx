'use client';

import { useEffect } from 'react';
import { addRecentSite } from '@/lib/recent-searches';

interface RecentSiteTrackerProps {
  site: {
    id: string;
    name: string;
    slug: string;
  };
}

/**
 * Client component that tracks site views in localStorage
 * Include this component on site detail pages to track recently viewed sites
 */
export function RecentSiteTracker({ site }: RecentSiteTrackerProps) {
  useEffect(() => {
    addRecentSite({
      id: site.id,
      name: site.name,
      slug: site.slug,
    });
  }, [site.id, site.name, site.slug]);

  return null; // This component renders nothing
}
