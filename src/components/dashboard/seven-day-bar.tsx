'use client';

import type { DayScore } from '@/types';

interface SevenDayBarProps {
  scores: DayScore[];
  className?: string;
}

/**
 * Compact 7-day flyability overview bar showing color-coded ratings.
 * Each day is represented as a colored dot or small bar.
 */
export function SevenDayBar({ scores, className = '' }: SevenDayBarProps) {
  // Ensure we have exactly 7 days
  const displayScores = scores.slice(0, 7);

  // Map score label to color
  const getLabelColor = (label: DayScore['label']): string => {
    switch (label) {
      case 'Epic':
        return 'bg-purple-500';
      case 'Great':
        return 'bg-green-500';
      case 'Good':
        return 'bg-blue-500';
      case 'Fair':
        return 'bg-yellow-500';
      case 'Poor':
        return 'bg-gray-400';
      default:
        return 'bg-gray-300';
    }
  };

  // Format date for tooltip
  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr + 'T12:00:00');
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const todayStr = today.toISOString().split('T')[0];
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    if (dateStr === todayStr) return 'Today';
    if (dateStr === tomorrowStr) return 'Tomorrow';

    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {/* 7-day dots */}
      <div className="flex items-center gap-1.5">
        {displayScores.map((score) => (
          <div
            key={score.date}
            className={`h-3 w-3 rounded-full ${getLabelColor(score.label)}`}
            title={`${formatDate(score.date)}: ${score.label} (${score.overallScore}/100)`}
          />
        ))}
        {/* Fill remaining days with gray if less than 7 */}
        {displayScores.length < 7 &&
          Array.from({ length: 7 - displayScores.length }).map((_, idx) => (
            <div
              key={`empty-${idx}`}
              className="h-3 w-3 rounded-full bg-gray-300 opacity-30"
              title="No forecast data"
            />
          ))}
      </div>

      {/* Inline legend */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <div className="h-2 w-2 rounded-full bg-purple-500" />
          <span>Epic</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-2 w-2 rounded-full bg-green-500" />
          <span>Great</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-2 w-2 rounded-full bg-blue-500" />
          <span>Good</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-2 w-2 rounded-full bg-yellow-500" />
          <span>Fair</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-2 w-2 rounded-full bg-gray-400" />
          <span>Poor</span>
        </div>
      </div>
    </div>
  );
}
