'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useTheme } from 'next-themes';
import type { AtmosphericProfile } from '@/lib/weather-profile';
import { Skeleton } from '@/components/ui/skeleton';
import {
  computeLapseRatesForHour,
  lapseRateToColor,
  bilinearInterpolate,
} from './lapse-rate-utils';
import { windSpeedToBarb, drawWindBarb, formatWindTooltip } from './wind-barb-utils';
import {
  drawThermalIndicator,
  collectLineData,
  drawSmoothLine,
  drawMoistureShading,
  drawLineLabel,
} from './thermal-cloud-utils';
import { WindgramDetailPanel } from './windgram-detail-panel';

interface WindgramChartProps {
  data: AtmosphericProfile | null;
  loading?: boolean;
  className?: string;
}

interface CrosshairPosition {
  x: number; // Canvas X coordinate
  y: number; // Canvas Y coordinate
  hourIndex: number; // Index in daylightHours array
  altitude: number; // Altitude in meters MSL
}

// Pressure levels in hPa (matching weather-profile.ts)
const PRESSURE_LEVELS = [1000, 950, 900, 850, 800, 700, 600, 500] as const;

// Constants for chart layout
const CHART_PADDING = {
  top: 50, // Increased for thermal indicators
  right: 120, // Increased for line labels
  bottom: 50,
  left: 100, // Increased for dual-line Y-axis labels (pressure + altitude)
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
  const [crosshair, setCrosshair] = useState<CrosshairPosition | null>(null);
  const [isPinned, setIsPinned] = useState(false);
  const [hoveredBarb, setHoveredBarb] = useState<{
    speedKmh: number;
    direction: number;
    altitude: { meters: number; feet: number };
    x: number;
    y: number;
  } | null>(null);
  const { resolvedTheme } = useTheme();
  const isDarkTheme = resolvedTheme === 'dark';

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

    // ========================================
    // DRAW LAPSE RATE BACKGROUND (US-002)
    // ========================================
    // Compute lapse rates for each hour at each layer
    const lapseRateGrid: (number | null)[][] = daylightHours.map((hour) =>
      computeLapseRatesForHour(hour),
    );

    // Render colored cells with smooth gradients
    const numLayers = PRESSURE_LEVELS.length - 1; // Number of layers between pressure levels

    for (let layerIdx = 0; layerIdx < numLayers; layerIdx++) {
      for (let timeIdx = 0; timeIdx < daylightHours.length; timeIdx++) {
        // Calculate cell boundaries
        const x1 = CHART_PADDING.left + (timeIdx / (daylightHours.length - 1)) * chartWidth;
        const x2 =
          timeIdx < daylightHours.length - 1
            ? CHART_PADDING.left + ((timeIdx + 1) / (daylightHours.length - 1)) * chartWidth
            : CHART_PADDING.left + chartWidth;
        const y1 = CHART_PADDING.top + (layerIdx / numLayers) * chartHeight;
        const y2 = CHART_PADDING.top + ((layerIdx + 1) / numLayers) * chartHeight;

        const cellWidth = x2 - x1;
        const cellHeight = y2 - y1;

        // For smooth gradients, use bilinear interpolation
        // Get neighboring lapse rates for gradient calculation
        const lapseRate_00 = lapseRateGrid[timeIdx]?.[layerIdx] ?? null;
        const lapseRate_10 =
          timeIdx < daylightHours.length - 1
            ? (lapseRateGrid[timeIdx + 1]?.[layerIdx] ?? null)
            : lapseRate_00;
        const lapseRate_01 =
          layerIdx < numLayers - 1
            ? (lapseRateGrid[timeIdx]?.[layerIdx + 1] ?? null)
            : lapseRate_00;
        const lapseRate_11 =
          timeIdx < daylightHours.length - 1 && layerIdx < numLayers - 1
            ? (lapseRateGrid[timeIdx + 1]?.[layerIdx + 1] ?? null)
            : lapseRate_00;

        // Create gradient within cell for smooth transition
        // Sample 4 sub-cells for better gradient quality
        const subSamples = 2;
        for (let sy = 0; sy < subSamples; sy++) {
          for (let sx = 0; sx < subSamples; sx++) {
            const subX1 = x1 + (sx / subSamples) * cellWidth;
            const subY1 = y1 + (sy / subSamples) * cellHeight;
            const subWidth = cellWidth / subSamples;
            const subHeight = cellHeight / subSamples;

            // Interpolate lapse rate at center of sub-cell
            const xFrac = (sx + 0.5) / subSamples;
            const yFrac = (sy + 0.5) / subSamples;
            const interpolatedRate = bilinearInterpolate(
              xFrac,
              yFrac,
              lapseRate_00,
              lapseRate_10,
              lapseRate_01,
              lapseRate_11,
            );

            const color = lapseRateToColor(interpolatedRate, isDarkTheme);
            ctx.fillStyle = color;
            ctx.fillRect(subX1, subY1, subWidth, subHeight);
          }
        }
      }
    }

    // Draw grid lines and labels
    ctx.strokeStyle = gridColorRgba;
    ctx.lineWidth = 1;
    ctx.fillStyle = textColorRgba;

    // Vertical grid lines (time axis)
    // Show labels every 2 hours for clean spacing (typically 6 AM, 8 AM, 10 AM, etc.)
    const isMobileView = dimensions.width < 640;
    const timeStep = isMobileView ? 3 : 2; // Mobile: every 3rd hour, Desktop: every 2nd hour

    daylightHours.forEach((hour, idx) => {
      const x = CHART_PADDING.left + (idx / (daylightHours.length - 1)) * chartWidth;

      // Draw grid line for every hour (subtle)
      ctx.strokeStyle = gridColorRgba;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(x, CHART_PADDING.top);
      ctx.lineTo(x, CHART_PADDING.top + chartHeight);
      ctx.stroke();

      // Only show time labels at regular intervals
      if (idx % timeStep === 0 || idx === daylightHours.length - 1) {
        // Time label
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.font = '11px system-ui, -apple-system, sans-serif';
        ctx.fillStyle = textColorRgba;
        const label = formatTimeLabel(hour.time);
        ctx.fillText(label, x, dimensions.height - CHART_PADDING.bottom + 10);
      }
    });

    // Horizontal grid lines (altitude/pressure axis)
    PRESSURE_LEVELS.forEach((pressure, idx) => {
      const { meters, feet } = pressureToAltitude(pressure);
      const y = CHART_PADDING.top + (idx / (PRESSURE_LEVELS.length - 1)) * chartHeight;

      // Grid line - subtle, thin lines
      ctx.strokeStyle = gridColorRgba;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(CHART_PADDING.left, y);
      ctx.lineTo(CHART_PADDING.left + chartWidth, y);
      ctx.stroke();

      // LEFT SIDE: Dual-line labels (pressure on top, altitude below)
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';

      // Pressure label (upper line, slightly dimmed)
      ctx.save();
      ctx.font = '10px system-ui, -apple-system, sans-serif';
      ctx.fillStyle = hslToRgba(textColor, 0.65);
      ctx.fillText(`${pressure} hPa`, CHART_PADDING.left - 10, y - 7);
      ctx.restore();

      // Altitude in meters label (lower line, primary)
      ctx.font = '12px system-ui, -apple-system, sans-serif';
      ctx.fillStyle = textColorRgba;
      ctx.fillText(`${Math.round(meters)} m`, CHART_PADDING.left - 10, y + 7);

      // RIGHT SIDE: Altitude in feet
      ctx.textAlign = 'left';
      ctx.font = '11px system-ui, -apple-system, sans-serif';
      ctx.fillStyle = hslToRgba(textColor, 0.75);
      ctx.fillText(
        `${Math.round(feet).toLocaleString()} ft`,
        CHART_PADDING.left + chartWidth + 10,
        y,
      );
    });

    // ========================================
    // DRAW MOISTURE/CLOUD SHADING (US-004)
    // ========================================
    // Draw subtle humidity hatching for areas with RH > 90%
    for (let layerIdx = 0; layerIdx < numLayers; layerIdx++) {
      for (let timeIdx = 0; timeIdx < daylightHours.length; timeIdx++) {
        const x1 = CHART_PADDING.left + (timeIdx / (daylightHours.length - 1)) * chartWidth;
        const x2 =
          timeIdx < daylightHours.length - 1
            ? CHART_PADDING.left + ((timeIdx + 1) / (daylightHours.length - 1)) * chartWidth
            : CHART_PADDING.left + chartWidth;
        const y1 = CHART_PADDING.top + (layerIdx / numLayers) * chartHeight;
        const y2 = CHART_PADDING.top + ((layerIdx + 1) / numLayers) * chartHeight;

        // Get humidity at this pressure level
        const hour = daylightHours[timeIdx];
        const pressureLevel = hour.pressureLevels[layerIdx];
        if (pressureLevel) {
          drawMoistureShading(ctx, x1, y1, x2, y2, pressureLevel.relativeHumidity, isDarkTheme);
        }
      }
    }

    // ========================================
    // DRAW ATMOSPHERIC LAYER LINES (US-004)
    // ========================================
    // Calculate altitude range for coordinate conversion
    const minPressure = PRESSURE_LEVELS[PRESSURE_LEVELS.length - 1]; // 500 hPa (highest altitude)
    const maxPressure = PRESSURE_LEVELS[0]; // 1000 hPa (lowest altitude)
    const minAltitude = pressureToAltitude(maxPressure).meters;
    const maxAltitude = pressureToAltitude(minPressure).meters;

    // Collect line data for all hours
    const lineData = collectLineData(
      daylightHours,
      CHART_PADDING.top,
      chartHeight,
      minAltitude,
      maxAltitude,
      data.elevation,
    );

    // Calculate X coordinates for each hour
    const xCoords = daylightHours.map(
      (_, idx) => CHART_PADDING.left + (idx / (daylightHours.length - 1)) * chartWidth,
    );

    // Draw cloud base line (dashed, cyan/blue)
    const cloudBaseColor = isDarkTheme ? '#22d3ee' : '#06b6d4'; // cyan-400 : cyan-600
    drawSmoothLine(ctx, xCoords, lineData.cloudBase, cloudBaseColor, 2, [8, 4]);

    // Draw top of lift line (dashed, green)
    const topOfLiftColor = isDarkTheme ? '#4ade80' : '#16a34a'; // green-400 : green-600
    drawSmoothLine(ctx, xCoords, lineData.topOfLift, topOfLiftColor, 2, [8, 4]);

    // Draw boundary layer height line (dashed, orange)
    const boundaryLayerColor = isDarkTheme ? '#fb923c' : '#ea580c'; // orange-400 : orange-600
    drawSmoothLine(ctx, xCoords, lineData.boundaryLayer, boundaryLayerColor, 2, [4, 4]);

    // Draw labels for the lines (at the right edge)
    const labelX = CHART_PADDING.left + chartWidth + 5;
    const labelBg = isDarkTheme ? 'rgba(0, 0, 0, 0.8)' : 'rgba(255, 255, 255, 0.9)';

    // Find last non-null Y for each line to place labels
    const lastCloudBase = lineData.cloudBase.filter((y) => y !== null).pop();
    const lastTopOfLift = lineData.topOfLift.filter((y) => y !== null).pop();
    const lastBoundaryLayer = lineData.boundaryLayer.filter((y) => y !== null).pop();

    if (lastCloudBase !== undefined) {
      drawLineLabel(ctx, 'Cloud Base', labelX, lastCloudBase, cloudBaseColor, labelBg);
    }
    if (lastTopOfLift !== undefined) {
      drawLineLabel(ctx, 'Top of Lift', labelX, lastTopOfLift, topOfLiftColor, labelBg);
    }
    if (lastBoundaryLayer !== undefined) {
      drawLineLabel(ctx, 'Boundary Layer', labelX, lastBoundaryLayer, boundaryLayerColor, labelBg);
    }

    // ========================================
    // DRAW WIND BARBS (US-003)
    // ========================================
    // Determine mobile vs desktop for barb density
    const isMobile = dimensions.width < 640;

    // On mobile: show every other level and every other hour to avoid clutter
    const levelStep = isMobile ? 2 : 1;
    const hourStep = isMobile ? 2 : 1;

    PRESSURE_LEVELS.forEach((pressure, levelIdx) => {
      // Skip levels on mobile for better readability
      if (levelIdx % levelStep !== 0) return;

      const y = CHART_PADDING.top + (levelIdx / (PRESSURE_LEVELS.length - 1)) * chartHeight;

      daylightHours.forEach((hour, hourIdx) => {
        // Skip hours on mobile for better readability
        if (hourIdx % hourStep !== 0) return;

        const x = CHART_PADDING.left + (hourIdx / (daylightHours.length - 1)) * chartWidth;

        // Get wind data for this pressure level
        const pressureLevel = hour.pressureLevels.find((pl) => pl.pressure === pressure);
        if (!pressureLevel) return;

        const { windSpeed, windDirection } = pressureLevel;

        // Convert to barb configuration
        const barbConfig = windSpeedToBarb(windSpeed, windDirection, isDarkTheme);

        // Scale barbs based on screen size
        const barbScale = isMobile ? 0.7 : 1.0;

        // Draw the wind barb
        drawWindBarb(ctx, x, y, barbConfig, barbScale);
      });
    });

    // ========================================
    // DRAW THERMAL INDICATORS (US-002)
    // ========================================
    // Draw "W*" label above thermal velocity indicators
    ctx.font = 'bold 11px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = textColorRgba;
    ctx.textAlign = 'left';
    ctx.fillText('W* (m/s)', CHART_PADDING.left, CHART_PADDING.top - 30);

    // Draw thermal velocity (W*) badges at the top of the chart
    const thermalY = CHART_PADDING.top - 15;
    daylightHours.forEach((hour, idx) => {
      if (idx % 2 !== 0 && isMobile) return; // Thin out on mobile

      const x = CHART_PADDING.left + (idx / (daylightHours.length - 1)) * chartWidth;
      drawThermalIndicator(ctx, x, thermalY, hour.surface.cape, isDarkTheme);
    });

    // ========================================
    // DRAW CROSSHAIR (US-005)
    // ========================================
    if (crosshair) {
      const { x, y } = crosshair;

      // Draw crosshair lines
      ctx.strokeStyle = isDarkTheme ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.6)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);

      // Vertical line
      ctx.beginPath();
      ctx.moveTo(x, CHART_PADDING.top);
      ctx.lineTo(x, CHART_PADDING.top + chartHeight);
      ctx.stroke();

      // Horizontal line
      ctx.beginPath();
      ctx.moveTo(CHART_PADDING.left, y);
      ctx.lineTo(CHART_PADDING.left + chartWidth, y);
      ctx.stroke();

      ctx.setLineDash([]); // Reset dash

      // Draw center circle
      ctx.fillStyle = isDarkTheme ? 'rgba(255, 255, 255, 0.8)' : 'rgba(0, 0, 0, 0.8)';
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();

      // If pinned, draw a pin icon
      if (isPinned) {
        ctx.fillStyle = isDarkTheme ? '#60a5fa' : '#2563eb'; // blue-400 : blue-600
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = isDarkTheme ? 'rgba(255, 255, 255, 0.9)' : 'rgba(255, 255, 255, 0.9)';
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Draw axis labels
    ctx.font = 'bold 12px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = hslToRgba(textColor, 0.7);

    // X-axis label (centered below chart)
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('Time (Local)', dimensions.width / 2, dimensions.height - 3);

    // Y-axis label (rotated, left side)
    ctx.save();
    ctx.translate(12, dimensions.height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Altitude', 0, 0);
    ctx.restore();
  }, [data, dimensions, isDarkTheme, crosshair, isPinned]);

  // Calculate crosshair position from pointer coordinates
  const calculateCrosshair = useCallback(
    (clientX: number, clientY: number): CrosshairPosition | null => {
      if (!data || !canvasRef.current) return null;

      const canvas = canvasRef.current;
      const rect = canvas.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;

      // Calculate chart area
      const chartWidth = dimensions.width - CHART_PADDING.left - CHART_PADDING.right;
      const chartHeight = dimensions.height - CHART_PADDING.top - CHART_PADDING.bottom;

      // Check if pointer is within chart bounds
      if (
        x < CHART_PADDING.left ||
        x > CHART_PADDING.left + chartWidth ||
        y < CHART_PADDING.top ||
        y > CHART_PADDING.top + chartHeight
      ) {
        return null;
      }

      // Filter to daylight hours
      const daylightHours = data.hours.filter((hour) => {
        const date = new Date(hour.time);
        const localHour = date.getHours();
        return localHour >= 6 && localHour <= 20;
      });

      if (daylightHours.length === 0) return null;

      // Calculate hour index (snap to nearest hour)
      const xFrac = (x - CHART_PADDING.left) / chartWidth;
      const hourIndex = Math.round(xFrac * (daylightHours.length - 1));

      // Calculate altitude (interpolate from y position)
      const yFrac = (y - CHART_PADDING.top) / chartHeight;
      const minPressure = PRESSURE_LEVELS[PRESSURE_LEVELS.length - 1]; // 500 hPa (highest altitude)
      const maxPressure = PRESSURE_LEVELS[0]; // 1000 hPa (lowest altitude)
      const minAltitude = pressureToAltitude(maxPressure).meters;
      const maxAltitude = pressureToAltitude(minPressure).meters;
      const altitude = minAltitude + yFrac * (maxAltitude - minAltitude);

      // Snap x to the hour position
      const snappedX = CHART_PADDING.left + (hourIndex / (daylightHours.length - 1)) * chartWidth;

      return {
        x: snappedX,
        y,
        hourIndex,
        altitude,
      };
    },
    [data, dimensions],
  );

  // Handle mouse/touch hover for crosshair and tooltip
  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!data || !canvasRef.current || isPinned) return; // Don't update if pinned

      const newCrosshair = calculateCrosshair(e.clientX, e.clientY);
      setCrosshair(newCrosshair);

      // Check if pointer is near any wind barb for tooltip
      const canvas = canvasRef.current;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const chartWidth = dimensions.width - CHART_PADDING.left - CHART_PADDING.right;
      const chartHeight = dimensions.height - CHART_PADDING.top - CHART_PADDING.bottom;

      const daylightHours = data.hours.filter((hour) => {
        const date = new Date(hour.time);
        const localHour = date.getHours();
        return localHour >= 6 && localHour <= 20;
      });

      if (daylightHours.length === 0) return;

      const isMobile = dimensions.width < 640;
      const levelStep = isMobile ? 2 : 1;
      const hourStep = isMobile ? 2 : 1;
      const hoverRadius = isMobile ? 20 : 15;
      let foundBarb: typeof hoveredBarb = null;

      for (let levelIdx = 0; levelIdx < PRESSURE_LEVELS.length; levelIdx++) {
        if (levelIdx % levelStep !== 0) continue;

        const pressure = PRESSURE_LEVELS[levelIdx];
        const altitude = pressureToAltitude(pressure);
        const barbY = CHART_PADDING.top + (levelIdx / (PRESSURE_LEVELS.length - 1)) * chartHeight;

        for (let hourIdx = 0; hourIdx < daylightHours.length; hourIdx++) {
          if (hourIdx % hourStep !== 0) continue;

          const barbX = CHART_PADDING.left + (hourIdx / (daylightHours.length - 1)) * chartWidth;

          const distance = Math.sqrt(Math.pow(x - barbX, 2) + Math.pow(y - barbY, 2));

          if (distance <= hoverRadius) {
            const hour = daylightHours[hourIdx];
            const pressureLevel = hour.pressureLevels.find((pl) => pl.pressure === pressure);

            if (pressureLevel) {
              foundBarb = {
                speedKmh: pressureLevel.windSpeed,
                direction: pressureLevel.windDirection,
                altitude,
                x: e.clientX,
                y: e.clientY,
              };
              break;
            }
          }
        }
        if (foundBarb) break;
      }

      setHoveredBarb(foundBarb);
    },
    [data, dimensions, isPinned, calculateCrosshair],
  );

  // Handle click/tap to pin crosshair
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!data) return;

      const newCrosshair = calculateCrosshair(e.clientX, e.clientY);
      if (newCrosshair) {
        if (isPinned) {
          // If already pinned, unpin
          setIsPinned(false);
          setCrosshair(null);
        } else {
          // Pin the crosshair
          setCrosshair(newCrosshair);
          setIsPinned(true);
        }
      }
    },
    [data, isPinned, calculateCrosshair],
  );

  const handlePointerLeave = useCallback(() => {
    if (!isPinned) {
      setCrosshair(null);
    }
    setHoveredBarb(null);
  }, [isPinned]);

  // Keyboard navigation for crosshair
  useEffect(() => {
    if (!data || !canvasRef.current) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!crosshair) {
        // If no crosshair, initialize one in the center
        if (e.key.startsWith('Arrow')) {
          const chartWidth = dimensions.width - CHART_PADDING.left - CHART_PADDING.right;
          const chartHeight = dimensions.height - CHART_PADDING.top - CHART_PADDING.bottom;

          const daylightHours = data.hours.filter((hour) => {
            const date = new Date(hour.time);
            const localHour = date.getHours();
            return localHour >= 6 && localHour <= 20;
          });

          if (daylightHours.length === 0) return;

          const centerX = CHART_PADDING.left + chartWidth / 2;
          const centerY = CHART_PADDING.top + chartHeight / 2;

          const newCrosshair = calculateCrosshair(
            centerX + canvasRef.current!.getBoundingClientRect().left,
            centerY + canvasRef.current!.getBoundingClientRect().top,
          );

          setCrosshair(newCrosshair);
          setIsPinned(true);
          e.preventDefault();
          return;
        }
        return;
      }

      const chartWidth = dimensions.width - CHART_PADDING.left - CHART_PADDING.right;
      const chartHeight = dimensions.height - CHART_PADDING.top - CHART_PADDING.bottom;

      const daylightHours = data.hours.filter((hour) => {
        const date = new Date(hour.time);
        const localHour = date.getHours();
        return localHour >= 6 && localHour <= 20;
      });

      if (daylightHours.length === 0) return;

      let newHourIndex = crosshair.hourIndex;
      let newY = crosshair.y;

      const altitudeStep = chartHeight / 20; // Move ~5% of chart height

      switch (e.key) {
        case 'ArrowLeft':
          newHourIndex = Math.max(0, crosshair.hourIndex - 1);
          e.preventDefault();
          break;
        case 'ArrowRight':
          newHourIndex = Math.min(daylightHours.length - 1, crosshair.hourIndex + 1);
          e.preventDefault();
          break;
        case 'ArrowUp':
          newY = Math.max(CHART_PADDING.top, crosshair.y - altitudeStep);
          e.preventDefault();
          break;
        case 'ArrowDown':
          newY = Math.min(CHART_PADDING.top + chartHeight, crosshair.y + altitudeStep);
          e.preventDefault();
          break;
        case 'Escape':
          setCrosshair(null);
          setIsPinned(false);
          e.preventDefault();
          return;
        default:
          return;
      }

      // Calculate new altitude from Y position
      const yFrac = (newY - CHART_PADDING.top) / chartHeight;
      const minPressure = PRESSURE_LEVELS[PRESSURE_LEVELS.length - 1];
      const maxPressure = PRESSURE_LEVELS[0];
      const minAltitude = pressureToAltitude(maxPressure).meters;
      const maxAltitude = pressureToAltitude(minPressure).meters;
      const newAltitude = minAltitude + yFrac * (maxAltitude - minAltitude);

      const newX = CHART_PADDING.left + (newHourIndex / (daylightHours.length - 1)) * chartWidth;

      setCrosshair({
        x: newX,
        y: newY,
        hourIndex: newHourIndex,
        altitude: newAltitude,
      });
      setIsPinned(true);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [data, dimensions, crosshair, calculateCrosshair]);

  // Loading skeleton
  if (loading || !data) {
    return (
      <div className={`w-full ${className}`} ref={containerRef}>
        <Skeleton className="w-full h-[400px] md:h-[500px] lg:h-[600px]" />
      </div>
    );
  }

  // Get current hour for detail panel
  const daylightHours = data.hours.filter((hour) => {
    const date = new Date(hour.time);
    const localHour = date.getHours();
    return localHour >= 6 && localHour <= 20;
  });

  const currentHour =
    crosshair && daylightHours[crosshair.hourIndex] ? daylightHours[crosshair.hourIndex] : null;

  return (
    <div className={`w-full relative ${className}`} ref={containerRef}>
      <div className="flex flex-col lg:flex-row gap-4">
        {/* Main chart */}
        <div className="flex-1">
          <canvas
            ref={canvasRef}
            className="w-full h-auto border border-border rounded-xl shadow-sm hover:shadow-md transition-shadow cursor-crosshair"
            aria-label="Windgram atmospheric profile chart"
            role="img"
            tabIndex={0}
            onPointerMove={handlePointerMove}
            onPointerLeave={handlePointerLeave}
            onClick={handleClick}
          />
          <p className="text-xs text-muted-foreground mt-2 text-center">
            {isPinned
              ? 'Click or press Escape to unpin • Use arrow keys to navigate'
              : 'Click to pin detail • Hover to explore • Use arrow keys to navigate'}
          </p>
        </div>

        {/* Detail panel - side on desktop, bottom on mobile */}
        {crosshair && currentHour && (
          <WindgramDetailPanel
            hour={currentHour}
            altitude={crosshair.altitude}
            isPinned={isPinned}
            onClose={() => {
              setCrosshair(null);
              setIsPinned(false);
            }}
            className="lg:w-80 lg:sticky lg:top-4 lg:self-start"
          />
        )}
      </div>

      {/* Tooltip for wind barbs (separate from detail panel) */}
      {hoveredBarb && !crosshair && (
        <div
          className="fixed z-50 px-3 py-2 text-sm font-medium text-white bg-gray-900 dark:bg-gray-700 rounded-lg shadow-lg pointer-events-none whitespace-pre-line"
          style={{
            left: `${hoveredBarb.x + 10}px`,
            top: `${hoveredBarb.y - 10}px`,
            transform: 'translateY(-100%)',
          }}
        >
          {formatWindTooltip(hoveredBarb.speedKmh, hoveredBarb.direction, hoveredBarb.altitude)}
        </div>
      )}
    </div>
  );
}
