'use client';

import type { DayScore } from '@/types';
import {
  STATUS_DOT,
  cellDetail,
  cellLabel,
  dayHeadline,
  dayName,
  dayStatus,
  shortDate,
} from '@/lib/verdict-display';

interface WindgramDaySelectorProps {
  days: Array<{ date: string; score?: DayScore }>;
  /** Today's date where the site is (YYYY-MM-DD) */
  today: string;
  selectedDayIndex: number;
  onDayChange: (index: number) => void;
  className?: string;
}

/** The week as tabs: each day's name, flight and when, choosing the day the chart shows. */
export function WindgramDaySelector({
  days,
  today,
  selectedDayIndex,
  onDayChange,
  className = '',
}: WindgramDaySelectorProps) {
  if (days.length <= 1) return null;

  return (
    <div
      className={`-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 ${className}`}
      role="tablist"
      aria-label="Forecast days"
    >
      {days.map(({ date, score }, index) => {
        const isSelected = index === selectedDayIndex;
        const detail = score
          ? score.verdict === 'no'
            ? (cellDetail(score) ?? cellLabel(score))
            : `${cellLabel(score)} ${cellDetail(score) ?? ''}`.trim()
          : null;
        return (
          <button
            key={date}
            type="button"
            onClick={() => onDayChange(index)}
            role="tab"
            aria-selected={isSelected}
            aria-controls="windgram-chart"
            title={score ? dayHeadline(score) : undefined}
            className={`flex min-w-[76px] shrink-0 flex-col items-start rounded-md border px-2.5 py-1.5 text-left transition-colors ${
              isSelected
                ? 'border-primary bg-primary text-primary-foreground'
                : 'bg-background hover:bg-muted'
            }`}
          >
            <span className="text-sm font-semibold leading-tight">{dayName(date, today)}</span>
            <span className="text-[11px] leading-tight opacity-80">{shortDate(date)}</span>
            {score && (
              <span className="mt-1 flex items-center gap-1 text-[11px] leading-tight">
                <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[dayStatus(score)]}`} />
                <span className="truncate">{detail}</span>
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
