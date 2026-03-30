'use client';

import { useMemo } from 'react';
import { useTheme } from 'next-themes';
import type { AtmosphericProfile } from '@/lib/weather-profile';
import { computeLapseRatesForHour, lapseRateToColor } from './lapse-rate-utils';

interface WindgramThumbnailProps {
  data: AtmosphericProfile | null;
  width?: number;
  height?: number;
  className?: string;
}

// Altitude range for display (meters)
const MIN_ALT_M = 0;
const MAX_ALT_M = 5500;

/**
 * SVG windgram thumbnail: lapse-rate heatmap with proportional altitude scaling.
 * No labels, no wind barbs — pure color background for dashboard cards.
 * SVG scales perfectly at any resolution with no canvas DPI tricks needed.
 */
export function WindgramThumbnail({ data, className = '' }: WindgramThumbnailProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  // Filter to daylight hours (6 AM – 8 PM) of the first available day
  const daylightHours = useMemo(() => {
    if (!data) return [];

    // Get the first day's date string
    const firstDayDate = data.hours[0]?.time.split('T')[0];
    if (!firstDayDate) return [];

    return data.hours.filter((h) => {
      const d = new Date(h.time);
      const sameDay = h.time.startsWith(firstDayDate);
      const hour = d.getHours();
      return sameDay && hour >= 6 && hour <= 20;
    });
  }, [data]);

  // Build SVG rect descriptors
  const cells = useMemo(() => {
    if (daylightHours.length === 0) return [];

    const numHours = daylightHours.length;
    const altRange = MAX_ALT_M - MIN_ALT_M;
    const rects: Array<{ x: number; y: number; w: number; h: number; color: string }> = [];

    for (let t = 0; t < numHours; t++) {
      const hour = daylightHours[t];
      const lapseRates = computeLapseRatesForHour(hour);
      const levels = hour.pressureLevels;

      // X: uniform columns
      const x = (t / numHours) * 100; // percent of viewBox width
      const w = 100 / numHours + 0.3; // slight overlap to avoid gaps

      for (let l = 0; l < levels.length - 1; l++) {
        const lowerAlt = levels[l].geopotentialHeight;
        const upperAlt = levels[l + 1].geopotentialHeight;

        const clampedLower = Math.max(MIN_ALT_M, Math.min(MAX_ALT_M, lowerAlt));
        const clampedUpper = Math.max(MIN_ALT_M, Math.min(MAX_ALT_M, upperAlt));
        if (clampedLower >= clampedUpper) continue;

        // Y: proportional — top of SVG = MAX_ALT, bottom = MIN_ALT (Y inverted)
        const yTop = ((MAX_ALT_M - clampedUpper) / altRange) * 100;
        const yBottom = ((MAX_ALT_M - clampedLower) / altRange) * 100;
        const h = yBottom - yTop + 0.3; // slight overlap

        const color = lapseRateToColor(lapseRates[l] ?? null, isDark);
        rects.push({ x, y: yTop, w, h, color });
      }
    }

    return rects;
  }, [daylightHours, isDark]);

  if (!data || daylightHours.length === 0) {
    return (
      <div className={`bg-muted rounded flex items-center justify-center h-20 ${className}`}>
        <span className="text-xs text-muted-foreground">No data</span>
      </div>
    );
  }

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className={`w-full h-20 rounded ${className}`}
      role="img"
      aria-label="Windgram thumbnail showing atmospheric stability"
    >
      {cells.map((cell, i) => (
        <rect key={i} x={cell.x} y={cell.y} width={cell.w} height={cell.h} fill={cell.color} />
      ))}
    </svg>
  );
}
