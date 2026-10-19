'use client';

import { useTheme } from 'next-themes';
import { getLapseRateLegend } from './lapse-rate-utils';

interface LapseRateLegendProps {
  className?: string;
}

/**
 * Color legend for lapse rate visualization
 * Shows the mapping from atmospheric stability to colors
 */
export function LapseRateLegend({ className = '' }: LapseRateLegendProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const legend = getLapseRateLegend(isDark);

  return (
    <div
      className={`flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm ${className}`}
    >
      <span className="font-medium text-muted-foreground">Stability:</span>
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
        {legend.map((entry) => (
          <div key={entry.label} className="flex items-center gap-1.5">
            <div
              className="h-4 w-4 rounded border border-border"
              style={{ backgroundColor: entry.color }}
              aria-label={`${entry.label} (${entry.lapseRate}°C/1000ft)`}
            />
            <span className="text-xs">{entry.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
