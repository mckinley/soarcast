'use client';

import { useState, useMemo } from 'react';
import type { AtmosphericProfile } from '@/lib/weather-profile';
import { WindgramChart } from './windgram-chart';
import { WindgramDaySelector } from './windgram-day-selector';

interface WindgramInteractiveProps {
  data: AtmosphericProfile | null;
  loading?: boolean;
  className?: string;
}

/**
 * Interactive windgram with day selection
 * Splits multi-day atmospheric profile data into daily charts
 */
export function WindgramInteractive({
  data,
  loading = false,
  className = '',
}: WindgramInteractiveProps) {
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);

  // Split hours into days
  const days = useMemo(() => {
    if (!data) return [];

    const dayMap = new Map<string, typeof data.hours>();

    for (const hour of data.hours) {
      const date = new Date(hour.time);
      const dayKey = date.toDateString();

      if (!dayMap.has(dayKey)) {
        dayMap.set(dayKey, []);
      }
      dayMap.get(dayKey)!.push(hour);
    }

    return Array.from(dayMap.entries()).map(([dayKey, hours]) => ({
      date: new Date(dayKey),
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

  if (loading || !data) {
    return <WindgramChart data={null} loading={true} className={className} />;
  }

  return (
    <div className={className}>
      {/* Day selector */}
      {days.length > 1 && (
        <WindgramDaySelector
          days={days.map((d) => d.date)}
          selectedDayIndex={selectedDayIndex}
          onDayChange={setSelectedDayIndex}
          className="mb-4"
        />
      )}

      {/* Chart with smooth transition */}
      <div
        key={selectedDayIndex}
        className="transition-opacity duration-300"
        style={{ animation: 'fadeIn 0.3s ease-in-out' }}
      >
        <WindgramChart data={selectedDayData} loading={false} />
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
