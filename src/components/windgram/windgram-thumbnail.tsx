'use client';

import { useEffect, useRef } from 'react';
import type { AtmosphericProfile } from '@/lib/weather-profile';
import { computeLapseRatesForHour, lapseRateToColor } from './lapse-rate-utils';

interface WindgramThumbnailProps {
  data: AtmosphericProfile | null;
  width?: number;
  height?: number;
  className?: string;
}

/**
 * Simplified windgram thumbnail showing only lapse rate background colors.
 * Designed for dashboard cards - no interactivity, labels, or wind barbs.
 * Optimized for small size and fast rendering.
 */
export function WindgramThumbnail({
  data,
  width = 120,
  height = 60,
  className = '',
}: WindgramThumbnailProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current || !data) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // High-DPI support
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Filter to daylight hours (6 AM - 8 PM)
    const daylightHours = data.hours.filter((hour) => {
      const localTime = new Date(hour.time);
      const hourOfDay = localTime.getHours();
      return hourOfDay >= 6 && hourOfDay <= 20;
    });

    if (daylightHours.length === 0) {
      // Draw gray background if no data
      ctx.fillStyle = '#888888';
      ctx.fillRect(0, 0, width, height);
      return;
    }

    // Calculate grid dimensions
    const numHours = daylightHours.length;
    // Number of layers is one less than number of pressure levels
    // (layers exist BETWEEN pressure levels)
    const firstHour = daylightHours[0];
    if (!firstHour) return;

    const numLayers = firstHour.pressureLevels.length - 1;
    const cellWidth = width / numHours;
    const cellHeight = height / numLayers;

    // Get theme colors (determine light/dark mode)
    const computedStyle = getComputedStyle(document.documentElement);
    const bgValue = computedStyle.getPropertyValue('--background').trim();
    const isDark = bgValue ? parseInt(bgValue.split(' ')[2] || '100') < 50 : false;

    // Render lapse rate background
    for (let hourIdx = 0; hourIdx < numHours; hourIdx++) {
      const hour = daylightHours[hourIdx];
      if (!hour) continue;

      // Compute lapse rates for this hour (returns array of lapse rates between levels)
      const lapseRates = computeLapseRatesForHour(hour);

      for (let layerIdx = 0; layerIdx < numLayers; layerIdx++) {
        const lapseRate = lapseRates[layerIdx];
        if (lapseRate === null || lapseRate === undefined) continue;

        // Map lapse rate to color
        const color = lapseRateToColor(lapseRate, isDark);

        // Fill cell
        const x = hourIdx * cellWidth;
        const y = layerIdx * cellHeight;

        ctx.fillStyle = color;
        ctx.fillRect(x, y, cellWidth + 0.5, cellHeight + 0.5); // +0.5 to avoid gaps
      }
    }

    // Add subtle border
    ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, width, height);
  }, [data, width, height]);

  if (!data) {
    return (
      <div
        className={`bg-muted rounded ${className}`}
        style={{ width: `${width}px`, height: `${height}px` }}
      />
    );
  }

  return (
    <canvas
      ref={canvasRef}
      className={`rounded ${className}`}
      role="img"
      aria-label="Windgram thumbnail showing atmospheric stability"
    />
  );
}
