'use client';

import { useState, useEffect } from 'react';
import { WindgramInteractive } from './windgram';
import { Card } from './ui/card';
import { Skeleton } from './ui/skeleton';
import type { AtmosphericProfile } from '@/lib/weather-profile';
import type { DayScore } from '@/types';

interface WindgramSectionProps {
  latitude: number;
  longitude: number;
  scores: DayScore[];
  days?: number;
}

/**
 * Client component that fetches and displays windgram with flyability summary
 * Uses client-side fetching to avoid blocking the server render
 */
export function WindgramSection({ latitude, longitude, scores, days = 7 }: WindgramSectionProps) {
  const [profile, setProfile] = useState<AtmosphericProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function fetchProfile() {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(
          `/api/weather/profile?lat=${latitude}&lng=${longitude}&days=${days}`,
        );

        if (!response.ok) {
          throw new Error(`Failed to fetch atmospheric profile: ${response.statusText}`);
        }

        const data: AtmosphericProfile = await response.json();

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

      <WindgramInteractive data={profile} dayScores={scores} />
    </div>
  );
}
