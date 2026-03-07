'use client';

import { useState, useMemo, useRef, useCallback } from 'react';
import type { AtmosphericProfile } from '@/lib/weather-profile';
import type { DayScore } from '@/types';
import { WindgramChart } from './windgram-chart';
import { WindgramDaySelector } from './windgram-day-selector';
import { FlyabilitySummary } from './flyability-summary';
import { LapseRateLegend } from './lapse-rate-legend';
import { useAttachTouchGestures } from '@/hooks/use-touch-gestures';

interface WindgramInteractiveProps {
  data: AtmosphericProfile | null;
  /**
   * Optional daily scores for flyability summaries.
   * Array should match the days in the atmospheric profile data.
   */
  dayScores?: DayScore[];
  loading?: boolean;
  className?: string;
}

/**
 * Interactive windgram with day selection
 * Splits multi-day atmospheric profile data into daily charts
 */
export function WindgramInteractive({
  data,
  dayScores = [],
  loading = false,
  className = '',
}: WindgramInteractiveProps) {
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Split hours into days
  const days = useMemo(() => {
    if (!data) return [];

    const dayMap = new Map<string, { date: string; hours: typeof data.hours }>();

    for (const hour of data.hours) {
      const date = hour.time.split('T')[0]; // YYYY-MM-DD format to match DayScore.date
      const dayKey = new Date(hour.time).toDateString();

      if (!dayMap.has(dayKey)) {
        dayMap.set(dayKey, { date, hours: [] });
      }
      dayMap.get(dayKey)!.hours.push(hour);
    }

    return Array.from(dayMap.entries()).map(([dayKey, { date, hours }]) => ({
      date: new Date(dayKey),
      dateString: date, // YYYY-MM-DD for matching with DayScore
      hours,
    }));
  }, [data]);

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
    return <WindgramChart data={null} loading={true} className={className} />;
  }

  return (
    <div ref={containerRef} className={className}>
      {/* Day selector */}
      {days.length > 1 && (
        <WindgramDaySelector
          days={days.map((d) => d.date)}
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
          />
        </div>
      )}

      {/* Chart with smooth transition and swipe hint */}
      <div
        key={selectedDayIndex}
        className="transition-opacity duration-300 relative"
        style={{ animation: 'fadeIn 0.3s ease-in-out' }}
      >
        <WindgramChart data={selectedDayData} loading={false} />
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

      <style jsx>{`
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
