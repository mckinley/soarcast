'use client';

import { useMemo } from 'react';
import type { AtmosphericProfile } from '@/lib/weather-profile';
import { lapseBand } from './lapse-rate-utils';
import { altitudeRange, daylightHours, windgramColumn } from './windgram-data';

interface WindgramThumbnailProps {
  data: AtmosphericProfile | null;
  className?: string;
}

/**
 * SVG windgram thumbnail for dashboard cards: the first day's lapse-rate
 * bands from the model ground up, in the windgram's colors, without labels
 * or wind barbs.
 */
export function WindgramThumbnail({ data, className = '' }: WindgramThumbnailProps) {
  const cells = useMemo(() => {
    if (!data || data.hours.length === 0) return [];
    const date = data.hours[0].time.slice(0, 10);
    const day = data.hours.filter((h) => h.time.startsWith(date));
    const columns = daylightHours(day, data.sunriseByDay?.[date], data.sunsetByDay?.[date]).map(
      (h) => windgramColumn(h, data.elevation),
    );
    const { min, max } = altitudeRange(data);
    const toY = (alt: number) => ((max - Math.min(max, Math.max(min, alt))) / (max - min)) * 100;

    return columns.flatMap((column, t) =>
      column.layers
        .filter((layer) => layer.bottom < max)
        .map((layer) => ({
          x: (t / columns.length) * 100,
          w: 100 / columns.length + 0.3, // slight overlap to avoid gaps
          y: toY(layer.top),
          h: toY(layer.bottom) - toY(layer.top) + 0.3,
          color: lapseBand(layer.rate).color,
        })),
    );
  }, [data]);

  if (!data || cells.length === 0) {
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
