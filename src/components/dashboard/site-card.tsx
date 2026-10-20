import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router';
import type { Site, DayScore } from '@/types';
import type { AtmosphericProfile } from '@/lib/weather-profile';
import { WindgramThumbnail } from '@/components/windgram/windgram-thumbnail';
import { Skeleton } from '@/components/ui/skeleton';
import { addDays } from '@/lib/alert-schedule';
import { flightSummary } from '@/lib/forecast-engine';
import { GOAL_LABEL } from '@/lib/site-goals';
import { compDates, compsOn, type Comp } from '@/lib/comps';
import { Trophy } from 'lucide-react';
import {
  STATUS_BADGE,
  STATUS_DOT,
  STATUS_WORD,
  dayHeadline,
  dayName,
  dayStatus,
  shortDate,
  shortReason,
} from '@/lib/verdict-display';

interface SiteCardProps {
  site: Site;
  scores: DayScore[];
  /** Today's date where the site is (YYYY-MM-DD) */
  today: string;
  siteType: 'launch' | 'custom';
  slug?: string; // For launch sites
  error?: string;
  /** Comps held at the site this week */
  comps?: Comp[];
  className?: string;
}

/** Today's line on the card: the flight and when, or what stops it. */
function todayLine(day: DayScore): string {
  if (day.verdict === 'no') return `Today: ${day.limitingFactor ?? 'no flyable hours'}`;
  if (day.verdict === 'marginal') {
    return `Today: marginal ${day.flyableWindow ?? ''}, ${day.limitingFactor ?? ''}`;
  }
  return `Today: ${flightSummary(day) ?? `flyable ${day.flyableWindow}`}`;
}

/**
 * Dashboard card for a site: whether today is a go for the pilot's goal,
 * the flight it gives, a windgram thumbnail, and the week as a strip.
 */
export function SiteCard({
  site,
  scores,
  today,
  siteType,
  slug,
  error,
  comps = [],
  className = '',
}: SiteCardProps) {
  const [thumbnailData, setThumbnailData] = useState<AtmosphericProfile | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const todayScore = scores.find((s) => s.date === today);
  const week = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(today, i);
    return { date, score: scores.find((s) => s.date === date), comp: compsOn(comps, date)[0] };
  });
  const weekComp = week.find((d) => d.comp)?.comp;

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
    <Link to={siteUrl}>
      <div
        ref={cardRef}
        className={`border rounded-lg p-4 hover:shadow-lg transition-shadow bg-card ${className}`}
      >
        {/* Header: Site name and today's verdict */}
        <div className="flex items-start justify-between mb-1">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-lg truncate">{site.name}</h3>
            <div className="text-xs text-muted-foreground mt-0.5">
              {siteType === 'custom' && 'Private • '}
              {site.elevation}m • {site.maxWindSpeed}km/h max
              {site.goal && ` • ${GOAL_LABEL[site.goal]}`}
            </div>
          </div>
          {todayScore && (
            <div
              className={`px-2 py-1 rounded text-xs font-semibold ml-2 whitespace-nowrap ${STATUS_BADGE[dayStatus(todayScore)]}`}
            >
              {STATUS_WORD[dayStatus(todayScore)]}
            </div>
          )}
        </div>
        <p className={`${weekComp ? 'mb-1' : 'mb-3'} text-sm text-muted-foreground truncate`}>
          {error ? error : todayScore ? todayLine(todayScore) : 'No forecast for today'}
        </p>
        {weekComp && (
          <p className="mb-3 flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300">
            <Trophy className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              Comp {compDates(weekComp, { year: false })}: {weekComp.name}
            </span>
          </p>
        )}

        {/* Windgram Thumbnail */}
        <div className="mb-3">
          {isLoading ? (
            <Skeleton className="w-full h-20 rounded" />
          ) : thumbnailData ? (
            <WindgramThumbnail data={thumbnailData} className="w-full" />
          ) : (
            <div className="w-full h-20 bg-muted rounded flex items-center justify-center text-xs text-muted-foreground">
              Loading...
            </div>
          )}
        </div>

        {/* The week */}
        <div className="grid grid-cols-7 gap-1" aria-label="Next 7 days">
          {week.map(({ date, score, comp }, i) => (
            <div
              key={date}
              className="flex min-w-0 flex-col items-center gap-1"
              title={`${dayName(date, today)} ${shortDate(date)}: ${
                score
                  ? score.verdict === 'no'
                    ? (shortReason(score) ?? STATUS_WORD.no)
                    : dayHeadline(score)
                  : 'no forecast'
              }${comp ? `. Comp on: ${comp.name}` : ''}`}
            >
              <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                {comp && <Trophy className="h-2.5 w-2.5 text-amber-600 dark:text-amber-400" />}
                {i === 0
                  ? 'Today'
                  : new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', {
                      weekday: 'short',
                      timeZone: 'UTC',
                    })}
              </span>
              <span
                className={`h-2.5 w-full rounded-full ${score ? STATUS_DOT[dayStatus(score)] : 'bg-muted'}`}
              />
            </div>
          ))}
        </div>
      </div>
    </Link>
  );
}
