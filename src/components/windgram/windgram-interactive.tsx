'use client';

import { lazy, Suspense, useState, useMemo, useRef, useCallback, type ComponentProps } from 'react';
import type { AtmosphericProfile } from '@/lib/weather-profile';
import type { DayScore } from '@/types';
import { Skeleton } from '@/components/ui/skeleton';
import { WindgramDaySelector } from './windgram-day-selector';
import { FlyabilitySummary } from './flyability-summary';
import { XcSnapshotPanel } from '@/components/xc-snapshot-panel';
import { LapseRateLegend } from './lapse-rate-legend';
import { useAttachTouchGestures } from '@/hooks/use-touch-gestures';

// d3 takes long to initialize, and Cloudflare caps the Worker's startup CPU,
// so the chart's module loads on first render instead of at startup.
const WindgramD3 = lazy(() => import('./windgram-d3').then((m) => ({ default: m.WindgramD3 })));

function LazyWindgramD3(props: ComponentProps<typeof WindgramD3>) {
  return (
    <Suspense
      fallback={
        <div className={`w-full ${props.className ?? ''}`}>
          <Skeleton className="w-full h-[400px] md:h-[500px] lg:h-[580px]" />
        </div>
      }
    >
      <WindgramD3 {...props} />
    </Suspense>
  );
}

interface WindgramInteractiveProps {
  data: AtmosphericProfile | null;
  /**
   * Optional daily scores for flyability summaries.
   * Array should match the days in the atmospheric profile data.
   */
  dayScores?: DayScore[];
  /** Today's date where the site is (YYYY-MM-DD); the chart opens on it */
  today?: string;
  loading?: boolean;
  className?: string;
  /**
   * Optional launch elevation in meters MSL.
   * When provided, draws a horizontal line at this altitude on the windgram.
   */
  launchElevation?: number;
}

/**
 * Interactive windgram with day selection
 * Splits multi-day atmospheric profile data into daily charts
 */
export function WindgramInteractive({
  data,
  dayScores = [],
  today,
  loading = false,
  className = '',
  launchElevation,
}: WindgramInteractiveProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Split hours into days
  const days = useMemo(() => {
    if (!data) return [];

    // Hour times are local to the site, so their date part is the site's day
    const dayMap = new Map<string, typeof data.hours>();
    for (const hour of data.hours) {
      const date = hour.time.slice(0, 10);
      if (!dayMap.has(date)) dayMap.set(date, []);
      dayMap.get(date)!.push(hour);
    }
    return Array.from(dayMap.entries()).map(([dateString, hours]) => ({ dateString, hours }));
  }, [data]);

  // Open on the site's today when the profile has it, else its first day
  const defaultDayIndex = useMemo(() => {
    const todayIndex = today ? days.findIndex((day) => day.dateString === today) : -1;
    return todayIndex >= 0 ? todayIndex : 0;
  }, [days, today]);

  const [selectedDayIndex, setSelectedDayIndex] = useState(defaultDayIndex);

  // Get data for selected day
  const selectedDayData: AtmosphericProfile | null = useMemo(() => {
    if (!data || !days[selectedDayIndex]) return null;

    return {
      ...data,
      hours: days[selectedDayIndex].hours,
    };
  }, [data, days, selectedDayIndex]);

  // Get score for selected day
  const selectedDayScore: DayScore | undefined = useMemo(() => {
    if (!days[selectedDayIndex]) return undefined;
    const dateString = days[selectedDayIndex].dateString;
    return dayScores.find((score) => score.date === dateString);
  }, [days, selectedDayIndex, dayScores]);

  // Handle swipe gestures for day navigation
  const handleSwipeLeft = useCallback(() => {
    if (selectedDayIndex < days.length - 1) {
      setSelectedDayIndex(selectedDayIndex + 1);
    }
  }, [selectedDayIndex, days.length]);

  const handleSwipeRight = useCallback(() => {
    if (selectedDayIndex > 0) {
      setSelectedDayIndex(selectedDayIndex - 1);
    }
  }, [selectedDayIndex]);

  // Attach touch gesture handlers to container
  useAttachTouchGestures(containerRef, {
    onSwipeLeft: handleSwipeLeft,
    onSwipeRight: handleSwipeRight,
  });

  if (loading || !data) {
    return (
      <LazyWindgramD3
        data={null}
        loading={true}
        className={className}
        launchElevation={launchElevation}
      />
    );
  }

  return (
    <div ref={containerRef} className={className}>
      {/* Day selector */}
      {days.length > 1 && (
        <WindgramDaySelector
          days={days.map((d) => ({
            date: d.dateString,
            score: dayScores.find((score) => score.date === d.dateString),
          }))}
          today={today ?? days[0].dateString}
          selectedDayIndex={selectedDayIndex}
          onDayChange={setSelectedDayIndex}
          className="mb-4"
        />
      )}

      {/* Flyability summary (if score data available) */}
      {selectedDayScore && selectedDayData && (
        <div className="mb-4">
          <FlyabilitySummary
            dayScore={selectedDayScore}
            atmosphericData={selectedDayData}
            date={days[selectedDayIndex].dateString}
            launchElevation={launchElevation}
          />
        </div>
      )}

      {/* XC Snapshot Panel above the chart */}
      {selectedDayScore && selectedDayData && data && (
        <div className="mb-4">
          <XcSnapshotPanel
            dayScore={selectedDayScore}
            profile={selectedDayData}
            dateString={days[selectedDayIndex].dateString}
          />
        </div>
      )}

      {/* Chart with smooth transition and swipe hint */}
      <div
        key={selectedDayIndex}
        className="transition-opacity duration-300 relative"
        style={{ animation: 'fadeIn 0.3s ease-in-out' }}
      >
        <LazyWindgramD3 data={selectedDayData} loading={false} launchElevation={launchElevation} />
        {days.length > 1 && (
          <p className="text-xs text-muted-foreground text-center mt-2 md:hidden">
            👈 Swipe to change days 👉
          </p>
        )}
      </div>

      {/* Lapse rate color legend */}
      <div className="mt-4 flex justify-center">
        <LapseRateLegend />
      </div>

      <style>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}
