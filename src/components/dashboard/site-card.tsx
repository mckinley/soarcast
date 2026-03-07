'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import type { Site, DayScore } from '@/types';
import type { AtmosphericProfile } from '@/lib/weather-profile';
import { WindgramThumbnail } from '@/components/windgram/windgram-thumbnail';
import { SevenDayBar } from './seven-day-bar';
import { Skeleton } from '@/components/ui/skeleton';

interface SiteCardProps {
  site: Site;
  scores: DayScore[];
  siteType: 'launch' | 'custom';
  slug?: string; // For launch sites
  className?: string;
}

/**
 * Dashboard card for a site showing:
 * - Windgram thumbnail (today's lapse rate visualization)
 * - Flyability rating badge
 * - 7-day mini bar
 * - Site details
 */
export function SiteCard({ site, scores, siteType, slug, className = '' }: SiteCardProps) {
  const [thumbnailData, setThumbnailData] = useState<AtmosphericProfile | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  // Today's score for flyability badge
  const today = new Date().toISOString().split('T')[0];
  const todayScore = scores.find((s) => s.date === today);

  // Get badge color based on score label
  const getBadgeColor = (label: DayScore['label']): string => {
    switch (label) {
      case 'Epic':
        return 'bg-purple-500 text-white';
      case 'Great':
        return 'bg-green-500 text-white';
      case 'Good':
        return 'bg-blue-500 text-white';
      case 'Fair':
        return 'bg-yellow-500 text-gray-900';
      case 'Poor':
        return 'bg-gray-400 text-gray-900';
      default:
        return 'bg-gray-300 text-gray-900';
    }
  };

  // Lazy load thumbnail data when card becomes visible
  useEffect(() => {
    const element = cardRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !isVisible) {
            setIsVisible(true);
          }
        });
      },
      { rootMargin: '50px' },
    );

    observer.observe(element);

    return () => {
      observer.unobserve(element);
    };
  }, [isVisible]);

  // Fetch thumbnail data when visible
  useEffect(() => {
    if (!isVisible || thumbnailData || isLoading) return;

    const fetchThumbnail = async () => {
      setIsLoading(true);
      try {
        // Fetch only 1 day for performance (just today)
        const response = await fetch(
          `/api/weather/profile?lat=${site.latitude}&lng=${site.longitude}&days=1`,
        );
        if (response.ok) {
          const data: AtmosphericProfile = await response.json();
          setThumbnailData(data);
        }
      } catch (error) {
        console.error('Failed to fetch thumbnail data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchThumbnail();
  }, [isVisible, thumbnailData, isLoading, site.latitude, site.longitude]);

  // Generate site detail URL based on siteType
  // Launch sites link to /sites/[slug] (enriched detail page with ParaglidingEarth data)
  // Custom sites link to /sites/custom/[id] (simple custom site detail)
  const siteUrl = siteType === 'launch' && slug ? `/sites/${slug}` : `/sites/custom/${site.id}`;

  return (
    <Link href={siteUrl}>
      <div
        ref={cardRef}
        className={`border rounded-lg p-4 hover:shadow-lg transition-shadow bg-card ${className}`}
      >
        {/* Header: Site name and badge */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-lg truncate">{site.name}</h3>
            <div className="text-xs text-muted-foreground mt-0.5">
              {site.elevation}m • {site.maxWindSpeed}km/h max
            </div>
          </div>
          {todayScore && (
            <div
              className={`px-2 py-1 rounded text-xs font-semibold ml-2 whitespace-nowrap ${getBadgeColor(todayScore.label)}`}
            >
              {todayScore.label}
            </div>
          )}
        </div>

        {/* Windgram Thumbnail */}
        <div className="mb-3">
          {isLoading ? (
            <Skeleton className="w-full h-[60px] rounded" />
          ) : thumbnailData ? (
            <WindgramThumbnail data={thumbnailData} width={240} height={60} className="w-full" />
          ) : (
            <div className="w-full h-[60px] bg-muted rounded flex items-center justify-center text-xs text-muted-foreground">
              Loading...
            </div>
          )}
        </div>

        {/* 7-Day Bar */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">7-day outlook:</span>
          <SevenDayBar scores={scores} />
        </div>
      </div>
    </Link>
  );
}
