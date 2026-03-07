'use client';

import { Button } from '@/components/ui/button';

interface WindgramDaySelectorProps {
  days: Date[];
  selectedDayIndex: number;
  onDayChange: (index: number) => void;
  className?: string;
}

/**
 * Day selector tabs for switching between forecast days
 */
export function WindgramDaySelector({
  days,
  selectedDayIndex,
  onDayChange,
  className = '',
}: WindgramDaySelectorProps) {
  if (days.length <= 1) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0); // Normalize to start of day for comparison

  return (
    <div className={`flex flex-wrap gap-2 ${className}`} role="tablist" aria-label="Forecast days">
      {days.map((day, index) => {
        const normalizedDay = new Date(day);
        normalizedDay.setHours(0, 0, 0, 0);

        const isSelected = index === selectedDayIndex;
        const isToday = normalizedDay.getTime() === today.getTime();

        // Check if day is in the past
        const isPast = normalizedDay < today;

        // Format day label
        let dayLabel: string;
        if (isToday) {
          dayLabel = 'Today';
        } else if (isPast) {
          // Calculate how many days ago
          const daysAgo = Math.floor(
            (today.getTime() - normalizedDay.getTime()) / (1000 * 60 * 60 * 24),
          );
          if (daysAgo === 1) {
            dayLabel = 'Yesterday';
          } else {
            dayLabel = `${daysAgo} days ago`;
          }
        } else {
          const tomorrow = new Date(today);
          tomorrow.setDate(tomorrow.getDate() + 1);
          if (tomorrow.getTime() === normalizedDay.getTime()) {
            dayLabel = 'Tomorrow';
          } else {
            dayLabel = normalizedDay.toLocaleDateString('en-US', { weekday: 'short' });
          }
        }

        const dateLabel = normalizedDay.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        });

        return (
          <Button
            key={index}
            variant={isSelected ? 'default' : 'outline'}
            size="sm"
            onClick={() => onDayChange(index)}
            disabled={isPast}
            role="tab"
            aria-selected={isSelected}
            aria-controls="windgram-chart"
            className={`flex flex-col items-start h-auto py-2 px-3 min-w-[80px] ${
              isPast ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            <span className="font-semibold text-sm">{dayLabel}</span>
            <span className="text-xs opacity-80">{dateLabel}</span>
          </Button>
        );
      })}
    </div>
  );
}
