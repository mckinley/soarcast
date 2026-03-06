'use client';

import { useEffect, useRef, useState } from 'react';
import type { AtmosphericProfile } from '@/lib/weather-profile';
import { Skeleton } from '@/components/ui/skeleton';

interface WindgramChartProps {
  data: AtmosphericProfile | null;
  loading?: boolean;
  className?: string;
}

// Pressure levels in hPa (matching weather-profile.ts)
const PRESSURE_LEVELS = [1000, 950, 900, 850, 800, 700, 600, 500] as const;

// Constants for chart layout
const CHART_PADDING = {
  top: 40,
  right: 60,
  bottom: 50,
  left: 80,
};

/**
 * Converts pressure level (hPa) to approximate altitude
 * Using barometric formula approximation
 */
function pressureToAltitude(pressure: number): { meters: number; feet: number } {
  // Standard atmosphere: P = P0 * (1 - L*h/T0)^(g*M/R*L)
  // Simplified: h ≈ 44330 * (1 - (P/P0)^0.1903)
  const P0 = 1013.25; // Sea level pressure
  const meters = 44330 * (1 - Math.pow(pressure / P0, 0.1903));
  const feet = meters * 3.28084;
  return { meters, feet };
}

/**
 * Formats time for display (e.g., "6 AM", "2 PM")
 */
function formatTimeLabel(isoTime: string): string {
  const date = new Date(isoTime);
  const hour = date.getHours();
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour} ${ampm}`;
}

/**
 * Core windgram chart component
 * Renders a time × altitude grid showing atmospheric conditions
 */
export function WindgramChart({ data, loading = false, className = '' }: WindgramChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  // Handle responsive sizing
  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width } = entry.contentRect;
        // Maintain aspect ratio: wider screens get shorter charts
        const height = Math.max(400, Math.min(600, width * 0.6));
        setDimensions({ width, height });
      }
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Render chart when data or dimensions change
  useEffect(() => {
    if (!data || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas resolution for sharp rendering on high-DPI screens
    const dpr = window.devicePixelRatio || 1;
    canvas.width = dimensions.width * dpr;
    canvas.height = dimensions.height * dpr;
    canvas.style.width = `${dimensions.width}px`;
    canvas.style.height = `${dimensions.height}px`;
    ctx.scale(dpr, dpr);

    // Clear canvas
    ctx.clearRect(0, 0, dimensions.width, dimensions.height);

    // Calculate chart area
    const chartWidth = dimensions.width - CHART_PADDING.left - CHART_PADDING.right;
    const chartHeight = dimensions.height - CHART_PADDING.top - CHART_PADDING.bottom;

    // Filter to daylight hours (6 AM - 8 PM local time)
    const daylightHours = data.hours.filter((hour) => {
      const date = new Date(hour.time);
      const localHour = date.getHours();
      return localHour >= 6 && localHour <= 20;
    });

    if (daylightHours.length === 0) return;

    // Get theme colors from CSS variables
    const computedStyle = getComputedStyle(canvas);
    const textColor = computedStyle.getPropertyValue('--foreground').trim() || '0 0% 9%';
    const gridColor = computedStyle.getPropertyValue('--border').trim() || '0 0% 89.8%';

    // Convert HSL color values to rgba
    const hslToRgba = (hsl: string, alpha: number = 1): string => {
      // Parse "h s% l%" format
      const parts = hsl.match(/[\d.]+/g);
      if (!parts || parts.length < 3) return `rgba(0, 0, 0, ${alpha})`;
      const h = parseFloat(parts[0]);
      const s = parseFloat(parts[1]) / 100;
      const l = parseFloat(parts[2]) / 100;

      const c = (1 - Math.abs(2 * l - 1)) * s;
      const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
      const m = l - c / 2;

      let r = 0,
        g = 0,
        b = 0;
      if (h >= 0 && h < 60) {
        r = c;
        g = x;
        b = 0;
      } else if (h >= 60 && h < 120) {
        r = x;
        g = c;
        b = 0;
      } else if (h >= 120 && h < 180) {
        r = 0;
        g = c;
        b = x;
      } else if (h >= 180 && h < 240) {
        r = 0;
        g = x;
        b = c;
      } else if (h >= 240 && h < 300) {
        r = x;
        g = 0;
        b = c;
      } else if (h >= 300 && h < 360) {
        r = c;
        g = 0;
        b = x;
      }

      return `rgba(${Math.round((r + m) * 255)}, ${Math.round((g + m) * 255)}, ${Math.round((b + m) * 255)}, ${alpha})`;
    };

    const textColorRgba = hslToRgba(textColor);
    const gridColorRgba = hslToRgba(gridColor, 0.5);

    // Set font
    ctx.font = '12px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Draw grid lines and labels
    ctx.strokeStyle = gridColorRgba;
    ctx.lineWidth = 1;
    ctx.fillStyle = textColorRgba;

    // Vertical grid lines (time axis)
    const timeStep = Math.ceil(daylightHours.length / 12); // Show ~12 time labels
    daylightHours.forEach((hour, idx) => {
      if (idx % timeStep !== 0) return;

      const x = CHART_PADDING.left + (idx / (daylightHours.length - 1)) * chartWidth;

      // Grid line
      ctx.beginPath();
      ctx.moveTo(x, CHART_PADDING.top);
      ctx.lineTo(x, CHART_PADDING.top + chartHeight);
      ctx.stroke();

      // Time label
      const label = formatTimeLabel(hour.time);
      ctx.fillText(label, x, dimensions.height - CHART_PADDING.bottom / 2);
    });

    // Horizontal grid lines (altitude/pressure axis)
    PRESSURE_LEVELS.forEach((pressure, idx) => {
      const { meters, feet } = pressureToAltitude(pressure);
      const y = CHART_PADDING.top + (idx / (PRESSURE_LEVELS.length - 1)) * chartHeight;

      // Grid line
      ctx.beginPath();
      ctx.moveTo(CHART_PADDING.left, y);
      ctx.lineTo(CHART_PADDING.left + chartWidth, y);
      ctx.stroke();

      // Left label (meters)
      ctx.textAlign = 'right';
      ctx.fillText(`${Math.round(meters)}m`, CHART_PADDING.left - 10, y);

      // Right label (feet)
      ctx.textAlign = 'left';
      ctx.fillText(`${Math.round(feet)}ft`, CHART_PADDING.left + chartWidth + 10, y);

      // Pressure label (left side, smaller)
      ctx.save();
      ctx.font = '10px system-ui, -apple-system, sans-serif';
      ctx.fillStyle = hslToRgba(textColor, 0.6);
      ctx.textAlign = 'right';
      ctx.fillText(`${pressure}hPa`, CHART_PADDING.left - 35, y);
      ctx.restore();
    });

    // Draw axis labels
    ctx.font = 'bold 14px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = textColorRgba;

    // X-axis label
    ctx.textAlign = 'center';
    ctx.fillText('Time (Local)', dimensions.width / 2, dimensions.height - 10);

    // Y-axis label (rotated)
    ctx.save();
    ctx.translate(15, dimensions.height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('Altitude', 0, 0);
    ctx.restore();
  }, [data, dimensions]);

  // Loading skeleton
  if (loading || !data) {
    return (
      <div className={`w-full ${className}`} ref={containerRef}>
        <Skeleton className="w-full h-[400px] md:h-[500px] lg:h-[600px]" />
      </div>
    );
  }

  return (
    <div className={`w-full ${className}`} ref={containerRef}>
      <canvas
        ref={canvasRef}
        className="w-full h-auto border border-border rounded-lg"
        aria-label="Windgram atmospheric profile chart"
      />
    </div>
  );
}
