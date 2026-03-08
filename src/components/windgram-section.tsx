'use client';

import { useState, useEffect } from 'react';
import { WindgramInteractive } from './windgram';
import { Card } from './ui/card';
import { Skeleton } from './ui/skeleton';
import type { AtmosphericProfile } from '@/lib/weather-profile';
import type { DayScore } from '@/types';

// Browser-side in-memory cache (keyed by "lat,lng,days")
// Prevents redundant API calls when switching between pages within 5 minutes
const BROWSER_CACHE_TTL_MS = 5 * 60 * 1000;
const profileCache = new Map<string, { data: AtmosphericProfile; cachedAt: number }>();

interface WindgramSectionProps {
  latitude: number;
  longitude: number;
  scores: DayScore[];
  days?: number;
  /**
   * Optional launch elevation in meters MSL.
   * When provided, draws a horizontal line at this altitude on the windgram.
   */
  launchElevation?: number;
}

/**
 * Client component that fetches and displays windgram with flyability summary
 * Uses client-side fetching to avoid blocking the server render
 */
export function WindgramSection({
  latitude,
  longitude,
  scores,
  days = 7,
  launchElevation,
}: WindgramSectionProps) {
  const [profile, setProfile] = useState<AtmosphericProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function fetchProfile() {
      try {
        setLoading(true);
        setError(null);

        const cacheKey = `${latitude.toFixed(3)},${longitude.toFixed(3)},${days}`;
        const cached = profileCache.get(cacheKey);
        if (cached && Date.now() - cached.cachedAt < BROWSER_CACHE_TTL_MS) {
          if (mounted) setProfile(cached.data);
          return;
        }

        const response = await fetch(
          `/api/weather/profile?lat=${latitude}&lng=${longitude}&days=${days}`,
        );

        if (!response.ok) {
          throw new Error(`Failed to fetch atmospheric profile: ${response.statusText}`);
        }

        const data: AtmosphericProfile = await response.json();
        profileCache.set(cacheKey, { data, cachedAt: Date.now() });

        if (mounted) {
          setProfile(data);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Failed to load atmospheric profile');
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    fetchProfile();

    return () => {
      mounted = false;
    };
  }, [latitude, longitude, days]);

  if (loading) {
    return (
      <Card className="p-6">
        <div className="space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-[400px] w-full" />
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-4 text-red-700 dark:text-red-400">
        <p className="font-medium">Error loading windgram</p>
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <p className="text-muted-foreground">No atmospheric profile data available</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold mb-2">Atmospheric Profile</h2>
        <p className="text-sm text-muted-foreground">
          Interactive windgram showing conditions at different altitudes over time
        </p>
      </div>

      <WindgramInteractive
        key={profile?.fetchedAt}
        data={profile}
        dayScores={scores}
        launchElevation={launchElevation}
      />
    </div>
  );
}
