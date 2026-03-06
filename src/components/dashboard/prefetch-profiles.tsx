'use client';

import { useEffect } from 'react';
import type { Site } from '@/types';

interface PrefetchProfilesProps {
  sites: Array<Pick<Site, 'id' | 'latitude' | 'longitude'>>;
}

/**
 * Background component that prefetches atmospheric profile data for all sites
 * This allows subsequent visits to site detail pages to load faster
 * Uses requestIdleCallback for non-blocking prefetch
 */
export function PrefetchProfiles({ sites }: PrefetchProfilesProps) {
  useEffect(() => {
    // Don't prefetch if there are no sites
    if (sites.length === 0) return;

    // Use requestIdleCallback if available, otherwise setTimeout
    const scheduleWork =
      typeof window !== 'undefined' && 'requestIdleCallback' in window
        ? window.requestIdleCallback
        : (cb: () => void) => setTimeout(cb, 1);

    const prefetchSite = (site: Pick<Site, 'id' | 'latitude' | 'longitude'>) => {
      scheduleWork(() => {
        // Prefetch atmospheric profile data (already has 1hr cache)
        fetch(`/api/weather/profile?lat=${site.latitude}&lng=${site.longitude}&days=7`, {
          priority: 'low',
        } as RequestInit).catch(() => {
          // Silently fail - this is just a prefetch optimization
        });
      });
    };

    // Prefetch first 3 sites immediately (most likely to be viewed)
    sites.slice(0, 3).forEach(prefetchSite);

    // Prefetch remaining sites with delay
    if (sites.length > 3) {
      const timeoutId = setTimeout(() => {
        sites.slice(3).forEach(prefetchSite);
      }, 2000);

      return () => clearTimeout(timeoutId);
    }
  }, [sites]);

  // This component doesn't render anything
  return null;
}
