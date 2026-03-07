'use client';

import { useEffect, useRef, useState } from 'react';
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
 * Optimized for small size and fast rendering with proper high-DPI support.
 */
export function WindgramThumbnail({ data, width, height, className = '' }: WindgramThumbnailProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: width || 300, height: height || 80 });

  // Measure container size on mount and resize
  useEffect(() => {
    if (!containerRef.current) return;

    const updateSize = () => {
      if (!containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      // Use provided dimensions or measure from container
      const newWidth = width || Math.floor(rect.width);
      const newHeight = height || 80; // Default height

      setDimensions({ width: newWidth, height: newHeight });
    };

    updateSize();

    // Re-measure on window resize
    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, [width, height]);

  // Render canvas when data or dimensions change
  useEffect(() => {
    if (!canvasRef.current || !data) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width: canvasWidth, height: canvasHeight } = dimensions;

    // High-DPI support - render at 2x resolution for sharp display
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = canvasWidth * dpr;
    canvas.height = canvasHeight * dpr;
    canvas.style.width = `${canvasWidth}px`;
    canvas.style.height = `${canvasHeight}px`;
    ctx.scale(dpr, dpr);

    // Clear canvas
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    // Filter to daylight hours (6 AM - 8 PM)
    const daylightHours = data.hours.filter((hour) => {
      const localTime = new Date(hour.time);
      const hourOfDay = localTime.getHours();
      return hourOfDay >= 6 && hourOfDay <= 20;
    });

    if (daylightHours.length === 0) {
      // Draw gray background if no data
      ctx.fillStyle = '#888888';
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);
      return;
    }

    // Calculate grid dimensions
    const numHours = daylightHours.length;
    // Number of layers is one less than number of pressure levels
    // (layers exist BETWEEN pressure levels)
    const firstHour = daylightHours[0];
    if (!firstHour) return;

    const numLayers = firstHour.pressureLevels.length - 1;
    const cellWidth = canvasWidth / numHours;
    const cellHeight = canvasHeight / numLayers;

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
    ctx.strokeRect(0, 0, canvasWidth, canvasHeight);
  }, [data, dimensions]);

  return (
    <div ref={containerRef} className={`${className}`}>
      {!data ? (
        <div
          className="bg-muted rounded flex items-center justify-center"
          style={{ height: `${dimensions.height}px` }}
        >
          <span className="text-xs text-muted-foreground">No data</span>
        </div>
      ) : (
        <canvas
          ref={canvasRef}
          className="rounded w-full"
          role="img"
          aria-label="Windgram thumbnail showing atmospheric stability"
        />
      )}
    </div>
  );
}
