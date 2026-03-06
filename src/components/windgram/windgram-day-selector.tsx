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

  return (
    <div className={`flex flex-wrap gap-2 ${className}`} role="tablist" aria-label="Forecast days">
      {days.map((day, index) => {
        const isSelected = index === selectedDayIndex;
        const isToday = new Date().toDateString() === day.toDateString();

        // Format day label
        let dayLabel: string;
        if (isToday) {
          dayLabel = 'Today';
        } else {
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          if (tomorrow.toDateString() === day.toDateString()) {
            dayLabel = 'Tomorrow';
          } else {
            dayLabel = day.toLocaleDateString('en-US', { weekday: 'short' });
          }
        }

        const dateLabel = day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

        return (
          <Button
            key={index}
            variant={isSelected ? 'default' : 'outline'}
            size="sm"
            onClick={() => onDayChange(index)}
            role="tab"
            aria-selected={isSelected}
            aria-controls="windgram-chart"
            className="flex flex-col items-start h-auto py-2 px-3 min-w-[80px]"
          >
            <span className="font-semibold text-sm">{dayLabel}</span>
            <span className="text-xs opacity-80">{dateLabel}</span>
          </Button>
        );
      })}
    </div>
  );
}
