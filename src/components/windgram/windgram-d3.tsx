'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { useTheme } from 'next-themes';
import * as d3 from 'd3';
import type { AtmosphericProfile } from '@/lib/weather-profile';
import { Skeleton } from '@/components/ui/skeleton';
import { computeLapseRatesForHour, lapseRateToColor } from './lapse-rate-utils';
import { windSpeedToBarb } from './wind-barb-utils';

interface WindgramD3Props {
  data: AtmosphericProfile | null;
  loading?: boolean;
  className?: string;
  launchElevation?: number;
}

const PADDING = { top: 72, right: 60, bottom: 50, left: 60 };
const MIN_ALT_M = 0;
const MAX_ALT_M = 5500;

// Altitude labels in feet
const ALT_TICKS_FT = [1000, 2000, 3000, 4000, 5000, 6000, 8000, 10000, 12000, 14000, 16000];

function ftToM(ft: number) {
  return ft / 3.28084;
}

function mToFt(m: number) {
  return m * 3.28084;
}

function formatTimeLabel(isoTime: string): string {
  const date = new Date(isoTime);
  const hour = date.getHours();
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour} ${ampm}`;
}

/**
 * Generates SVG path data for a wind barb centered at (0,0) pointing up
 * Apply a rotation transform to orient correctly.
 */
function windBarbPath(flags: number, fullBarbs: number, halfBarbs: number): string {
  const shaftLen = 22;
  const barbLen = 10;
  const halfBarbLen = 5;
  const spacing = 4;
  const angle = Math.PI / 4; // 45° barb angle relative to shaft

  const parts: string[] = [];
  // Shaft: from (0,0) pointing up = negative Y
  parts.push(`M 0 0 L 0 ${-shaftLen}`);

  // Barbs drawn from tip of shaft downward along shaft
  let pos = shaftLen; // distance from center along shaft

  // Flags (triangles, 50 kt each)
  for (let i = 0; i < flags; i++) {
    const y0 = -pos;
    const y1 = -(pos - spacing * 2);
    // barb tip at angle from shaft
    const tipX = Math.sin(angle) * barbLen;
    const tipY = -pos + Math.cos(angle) * barbLen;
    parts.push(`M 0 ${y0} L ${tipX} ${tipY} L 0 ${y1} Z`);
    pos -= spacing * 2 + spacing * 0.5;
  }

  // Full barbs (10 kt each)
  for (let i = 0; i < fullBarbs; i++) {
    const y0 = -pos;
    const tipX = Math.sin(angle) * barbLen;
    const tipY = -pos + Math.cos(angle) * barbLen;
    parts.push(`M 0 ${y0} L ${tipX} ${tipY}`);
    pos -= spacing;
  }

  // Half barb (5 kt)
  if (halfBarbs > 0) {
    const y0 = -pos;
    const tipX = Math.sin(angle) * halfBarbLen;
    const tipY = -pos + Math.cos(angle) * halfBarbLen;
    parts.push(`M 0 ${y0} L ${tipX} ${tipY}`);
  }

  return parts.join(' ');
}

/** Vertically interpolate a lapse rate at a given altitude within a column of data points */
function interpolateColumn(
  column: { alt: number; rate: number | null }[],
  altM: number,
): number | null {
  if (column.length === 0) return null;

  // Below lowest point
  if (altM <= column[0].alt) return column[0].rate;
  // Above highest point
  if (altM >= column[column.length - 1].alt) return column[column.length - 1].rate;

  // Find bracketing points
  for (let i = 0; i < column.length - 1; i++) {
    if (altM >= column[i].alt && altM <= column[i + 1].alt) {
      const r0 = column[i].rate;
      const r1 = column[i + 1].rate;
      if (r0 === null && r1 === null) return null;
      if (r0 === null) return r1;
      if (r1 === null) return r0;
      const t = (altM - column[i].alt) / (column[i + 1].alt - column[i].alt);
      return r0 * (1 - t) + r1 * t;
    }
  }
  return null;
}

export function WindgramD3({
  data,
  loading = false,
  className = '',
  launchElevation,
}: WindgramD3Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  // Responsive width via ResizeObserver
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(w);
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Derived chart dimensions
  const height = useMemo(() => Math.max(380, Math.min(580, width * 0.58)), [width]);
  const chartW = width - PADDING.left - PADDING.right;
  const chartH = height - PADDING.top - PADDING.bottom;

  // Filter to daylight hours (6 AM – 8 PM local time)
  const daylightHours = useMemo(() => {
    if (!data) return [];
    return data.hours.filter((h) => {
      const hour = new Date(h.time).getHours();
      return hour >= 6 && hour <= 20;
    });
  }, [data]);

  // D3 scales
  const xScale = useMemo(() => {
    if (daylightHours.length === 0) return null;
    return d3
      .scaleLinear()
      .domain([0, daylightHours.length - 1])
      .range([0, chartW]);
  }, [daylightHours.length, chartW]);

  const yScale = useMemo(
    () => d3.scaleLinear().domain([MIN_ALT_M, MAX_ALT_M]).range([chartH, 0]),
    [chartH],
  );

  // Smooth heatmap: build a grid of lapse rates, then render via canvas with bilinear interpolation
  const heatmapDataUrl = useMemo(() => {
    if (!xScale || daylightHours.length === 0 || chartW <= 0 || chartH <= 0) return null;

    // Build lapse rate grid: [timeIndex][altIndex] where altIndex maps to midpoint altitude of each layer
    const timeCount = daylightHours.length;
    const grid: { alt: number; rate: number | null }[][] = [];

    for (let t = 0; t < timeCount; t++) {
      const hour = daylightHours[t];
      const lapseRates = computeLapseRatesForHour(hour);
      const levels = hour.pressureLevels;
      const column: { alt: number; rate: number | null }[] = [];

      for (let l = 0; l < levels.length - 1; l++) {
        const midAlt = (levels[l].geopotentialHeight + levels[l + 1].geopotentialHeight) / 2;
        column.push({ alt: midAlt, rate: lapseRates[l] });
      }
      grid.push(column);
    }

    // Render to canvas with pixel-level interpolation
    const canvasW = Math.round(chartW);
    const canvasH = Math.round(chartH);
    const canvas = document.createElement('canvas');
    canvas.width = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const imageData = ctx.createImageData(canvasW, canvasH);
    const pixels = imageData.data;

    // For each pixel, find the interpolated lapse rate and map to color
    for (let py = 0; py < canvasH; py++) {
      const altM = MIN_ALT_M + (MAX_ALT_M - MIN_ALT_M) * (1 - py / (canvasH - 1));

      for (let px = 0; px < canvasW; px++) {
        // Map pixel x back to fractional time index
        const tFrac = xScale.invert(px);

        // Find surrounding time columns
        const t0 = Math.max(0, Math.min(timeCount - 1, Math.floor(tFrac)));
        const t1 = Math.min(timeCount - 1, t0 + 1);
        const tx = t0 === t1 ? 0 : (tFrac - t0) / (t1 - t0);

        // Find lapse rate at this altitude for each time column via vertical interpolation
        const rateAtT0 = interpolateColumn(grid[t0], altM);
        const rateAtT1 = interpolateColumn(grid[t1], altM);

        // Horizontal interpolation between time columns
        let rate: number | null;
        if (rateAtT0 === null && rateAtT1 === null) {
          rate = null;
        } else if (rateAtT0 === null) {
          rate = rateAtT1;
        } else if (rateAtT1 === null) {
          rate = rateAtT0;
        } else {
          rate = rateAtT0 * (1 - tx) + rateAtT1 * tx;
        }

        const colorStr = lapseRateToColor(rate, isDark);
        // Parse rgb(r, g, b)
        const match = colorStr.match(/(\d+)/g);
        const idx = (py * canvasW + px) * 4;
        if (match) {
          pixels[idx] = parseInt(match[0]);
          pixels[idx + 1] = parseInt(match[1]);
          pixels[idx + 2] = parseInt(match[2]);
          pixels[idx + 3] = 255;
        }
      }
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL();
  }, [daylightHours, xScale, chartW, chartH, isDark]);

  // Wind barbs
  const windBarbs = useMemo(() => {
    if (!xScale || daylightHours.length === 0) return [];

    const barbs: Array<{
      cx: number;
      cy: number;
      rotation: number;
      path: string;
      color: string;
      isCalm: boolean;
      calmR: number;
    }> = [];

    const isMobile = width < 640;
    const hourStep = isMobile ? 2 : 1;
    const levelStep = isMobile ? 2 : 1;

    for (let t = 0; t < daylightHours.length; t++) {
      if (t % hourStep !== 0) continue;
      const hour = daylightHours[t];
      const cx = xScale(t);

      for (let l = 0; l < hour.pressureLevels.length; l++) {
        if (l % levelStep !== 0) continue;
        const pl = hour.pressureLevels[l];
        const altM = pl.geopotentialHeight;
        if (altM < MIN_ALT_M || altM > MAX_ALT_M) continue;

        const cy = yScale(altM);
        const config = windSpeedToBarb(pl.windSpeed, pl.windDirection, isDark);

        if (config.speedKnots === 0) {
          barbs.push({
            cx,
            cy,
            rotation: 0,
            path: '',
            color: config.color,
            isCalm: true,
            calmR: 5,
          });
        } else {
          const path = windBarbPath(config.flags, config.fullBarbs, config.halfBarbs);
          barbs.push({
            cx,
            cy,
            rotation: config.direction,
            path,
            color: config.color,
            isCalm: false,
            calmR: 0,
          });
        }
      }
    }
    return barbs;
  }, [daylightHours, xScale, yScale, isDark, width]);

  // Smooth curve generator
  const curveGenerator = useMemo(
    () =>
      d3
        .line<[number, number]>()
        .x((d) => d[0])
        .y((d) => d[1])
        .curve(d3.curveCatmullRom.alpha(0.5)),
    [],
  );

  // Cloud base smooth curve path
  const cloudBaseLine = useMemo(() => {
    if (!xScale || daylightHours.length === 0) return null;

    const points = daylightHours
      .map((hour, i) => {
        const cloudBaseAGL = hour.derived.estimatedCloudBase;
        if (cloudBaseAGL === null) return null;
        const cloudBaseMSL = cloudBaseAGL + data!.elevation;
        if (cloudBaseMSL < MIN_ALT_M || cloudBaseMSL > MAX_ALT_M) return null;
        return [xScale(i), yScale(cloudBaseMSL)] as [number, number];
      })
      .filter((p): p is [number, number] => p !== null);

    if (points.length < 2) return null;
    return curveGenerator(points);
  }, [daylightHours, xScale, yScale, data, curveGenerator]);

  // Altitude tick marks (within visible range)
  const altTicks = useMemo(
    () =>
      ALT_TICKS_FT.filter((ft) => {
        const m = ftToM(ft);
        return m >= MIN_ALT_M && m <= MAX_ALT_M;
      }),
    [],
  );

  // Time labels (every 2 hours on desktop, every 3 on mobile)
  const timeLabels = useMemo(() => {
    if (!xScale || daylightHours.length === 0) return [];
    const step = width < 640 ? 3 : 2;
    return daylightHours
      .map((hour, i) => ({ i, label: formatTimeLabel(hour.time), x: xScale(i) }))
      .filter(({ i }) => i % step === 0 || i === daylightHours.length - 1);
  }, [daylightHours, xScale, width]);

  // W* strip data
  const wStarStrip = useMemo(() => {
    if (!xScale || daylightHours.length === 0) return [];
    const isMobile = width < 640;
    return daylightHours.map((hour, i) => {
      const ws = hour.derived.wStar;
      let color: string;
      if (ws === null || ws < 0.5) color = '#9ca3af';
      else if (ws < 1) color = '#60a5fa';
      else if (ws < 2) color = '#34d399';
      else if (ws < 3) color = '#fb923c';
      else color = '#ef4444';

      const x0 = i === 0 ? 0 : xScale(i - 0.5);
      const x1 = i === daylightHours.length - 1 ? chartW : xScale(i + 0.5);

      return {
        x: x0,
        w: x1 - x0,
        color,
        label: ws !== null ? ws.toFixed(1) : '—',
        show: !isMobile || i % 2 === 0,
      };
    });
  }, [daylightHours, xScale, chartW, width]);

  // Freezing level smooth curve path
  const freezingLevelLine = useMemo(() => {
    if (!xScale || daylightHours.length === 0) return null;
    const points = daylightHours
      .map((hour, i) => {
        const fl = hour.derived.freezingLevel;
        if (fl === null || fl < MIN_ALT_M || fl > MAX_ALT_M) return null;
        return [xScale(i), yScale(fl)] as [number, number];
      })
      .filter((p): p is [number, number] => p !== null);
    if (points.length < 2) return null;
    return curveGenerator(points);
  }, [daylightHours, xScale, yScale, curveGenerator]);

  // Wind shear zone bands
  const shearBands = useMemo(() => {
    if (!xScale || daylightHours.length === 0) return [];
    const bands: Array<{ x: number; y: number; w: number; h: number }> = [];

    for (let t = 0; t < daylightHours.length; t++) {
      const hour = daylightHours[t];
      const levels = hour.pressureLevels;
      const x0 = t === 0 ? 0 : xScale(t - 0.5);
      const x1 = t === daylightHours.length - 1 ? chartW : xScale(t + 0.5);

      for (let l = 0; l < levels.length - 1; l++) {
        const delta = Math.abs(levels[l].windSpeed - levels[l + 1].windSpeed);
        if (delta > 20) {
          const lowerAlt = Math.max(MIN_ALT_M, levels[l].geopotentialHeight);
          const upperAlt = Math.min(MAX_ALT_M, levels[l + 1].geopotentialHeight);
          if (lowerAlt >= upperAlt) continue;
          bands.push({
            x: x0,
            y: yScale(upperAlt),
            w: x1 - x0,
            h: yScale(lowerAlt) - yScale(upperAlt),
          });
        }
      }
    }
    return bands;
  }, [daylightHours, xScale, yScale, chartW]);

  // Soaring ceiling (top of lift) smooth curve path
  const ceilingLine = useMemo(() => {
    if (!xScale || daylightHours.length === 0) return null;
    const points = daylightHours
      .map((hour, i) => {
        const tol = hour.derived.estimatedTopOfLift;
        if (tol === null || tol < MIN_ALT_M || tol > MAX_ALT_M) return null;
        return [xScale(i), yScale(tol)] as [number, number];
      })
      .filter((p): p is [number, number] => p !== null);
    if (points.length < 2) return null;
    return curveGenerator(points);
  }, [daylightHours, xScale, yScale, curveGenerator]);

  if (loading || !data) {
    return (
      <div className={`w-full ${className}`} ref={containerRef}>
        <Skeleton className="w-full h-[400px] md:h-[500px] lg:h-[580px]" />
      </div>
    );
  }

  const gridColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)';
  const textColor = isDark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.75)';
  const dimTextColor = isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.4)';
  const cloudBaseColor = isDark ? '#22d3ee' : '#0891b2';
  const launchLineColor = isDark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.6)';
  const dimmingColor = isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.12)';

  const launchY =
    launchElevation !== undefined && launchElevation > MIN_ALT_M && launchElevation < MAX_ALT_M
      ? yScale(launchElevation)
      : null;

  return (
    <div
      ref={containerRef}
      className={`w-full border border-border rounded-xl shadow-sm overflow-hidden ${className}`}
    >
      <svg
        width={width}
        height={height}
        aria-label="Windgram atmospheric profile chart"
        role="img"
        className="block"
      >
        {/* Chart area clip path */}
        <defs>
          <clipPath id="chart-clip">
            <rect x={0} y={0} width={chartW} height={chartH} />
          </clipPath>
          <marker id="none" markerWidth="0" markerHeight="0" refX="0" refY="0" orient="auto" />
        </defs>

        {/* ── W* strip above chart ── */}
        <g transform={`translate(${PADDING.left},${PADDING.top - 32})`}>
          {wStarStrip.map((cell, i) => (
            <g key={i}>
              <rect x={cell.x} y={0} width={cell.w} height={20} fill={cell.color} rx={2} />
              {cell.show && (
                <text
                  x={cell.x + cell.w / 2}
                  y={10}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill={isDark ? '#000' : '#fff'}
                  fontSize={9}
                  fontWeight="bold"
                  fontFamily="inherit"
                >
                  {cell.label}
                </text>
              )}
            </g>
          ))}
          {/* W* label on left margin */}
          <text
            x={-6}
            y={10}
            textAnchor="end"
            dominantBaseline="central"
            fill={textColor}
            fontSize={10}
            fontFamily="inherit"
          >
            W* m/s
          </text>
        </g>

        <g transform={`translate(${PADDING.left},${PADDING.top})`}>
          {/* ── Lapse rate background (smooth interpolated heatmap) ── */}
          {heatmapDataUrl && (
            <image
              href={heatmapDataUrl}
              x={0}
              y={0}
              width={chartW}
              height={chartH}
              clipPath="url(#chart-clip)"
              preserveAspectRatio="none"
            />
          )}

          {/* ── Wind shear zone bands ── */}
          <g clipPath="url(#chart-clip)">
            {shearBands.map((band, i) => (
              <rect
                key={i}
                x={band.x}
                y={band.y}
                width={band.w}
                height={band.h}
                fill="rgba(251,146,60,0.25)"
              />
            ))}
          </g>

          {/* ── Horizontal grid lines at altitude ticks ── */}
          {altTicks.map((ft) => {
            const m = ftToM(ft);
            const y = yScale(m);
            return (
              <line
                key={ft}
                x1={0}
                y1={y}
                x2={chartW}
                y2={y}
                stroke={gridColor}
                strokeWidth={0.8}
              />
            );
          })}

          {/* ── Vertical grid lines at time labels ── */}
          {timeLabels.map(({ i, x }) => (
            <line key={i} x1={x} y1={0} x2={x} y2={chartH} stroke={gridColor} strokeWidth={0.6} />
          ))}

          {/* ── Launch elevation dimming overlay (below launch line) ── */}
          {launchY !== null && (
            <rect
              x={0}
              y={launchY}
              width={chartW}
              height={chartH - launchY}
              fill={dimmingColor}
              clipPath="url(#chart-clip)"
            />
          )}

          {/* ── Wind barbs ── */}
          <g clipPath="url(#chart-clip)">
            {windBarbs.map((barb, i) => (
              <g key={i} transform={`translate(${barb.cx},${barb.cy})`}>
                {barb.isCalm ? (
                  <circle r={barb.calmR} fill="none" stroke={barb.color} strokeWidth={1.5} />
                ) : (
                  <g transform={`rotate(${barb.rotation})`}>
                    <path
                      d={barb.path}
                      fill={barb.color}
                      stroke={barb.color}
                      strokeWidth={1.5}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </g>
                )}
              </g>
            ))}
          </g>

          {/* ── Cloud base line (dashed cyan, smooth curve) ── */}
          {cloudBaseLine && (
            <path
              d={cloudBaseLine}
              fill="none"
              stroke={cloudBaseColor}
              strokeWidth={2}
              strokeDasharray="8 4"
              clipPath="url(#chart-clip)"
            />
          )}

          {/* Cloud base label at right edge */}
          {cloudBaseLine &&
            daylightHours.length > 0 &&
            (() => {
              const lastHour = daylightHours[daylightHours.length - 1];
              const cloudBaseAGL = lastHour.derived.estimatedCloudBase;
              if (cloudBaseAGL === null) return null;
              const cloudBaseMSL = cloudBaseAGL + data.elevation;
              if (cloudBaseMSL < MIN_ALT_M || cloudBaseMSL > MAX_ALT_M) return null;
              const y = yScale(cloudBaseMSL);
              return (
                <text
                  x={chartW + 4}
                  y={y}
                  fill={cloudBaseColor}
                  fontSize={10}
                  dominantBaseline="middle"
                  fontFamily="inherit"
                >
                  Cloud Base
                </text>
              );
            })()}

          {/* ── Freezing level line (dashed icy-blue, smooth curve) ── */}
          {freezingLevelLine && (
            <path
              d={freezingLevelLine}
              fill="none"
              stroke="#93c5fd"
              strokeWidth={2}
              strokeDasharray="6 4"
              clipPath="url(#chart-clip)"
            />
          )}
          {/* Freezing level label at right edge */}
          {freezingLevelLine &&
            daylightHours.length > 0 &&
            (() => {
              const lastHour = daylightHours[daylightHours.length - 1];
              const fl = lastHour.derived.freezingLevel;
              if (fl === null || fl < MIN_ALT_M || fl > MAX_ALT_M) return null;
              const y = yScale(fl);
              return (
                <text
                  x={chartW + 4}
                  y={y}
                  fill="#93c5fd"
                  fontSize={10}
                  dominantBaseline="middle"
                  fontFamily="inherit"
                >
                  0°C
                </text>
              );
            })()}

          {/* ── Soaring ceiling line (gold, thick, smooth curve) ── */}
          {ceilingLine && (
            <path
              d={ceilingLine}
              fill="none"
              stroke="#fbbf24"
              strokeWidth={3}
              strokeDasharray="10 5"
              clipPath="url(#chart-clip)"
            />
          )}
          {/* Ceiling label at right edge */}
          {ceilingLine &&
            daylightHours.length > 0 &&
            (() => {
              const lastHour = daylightHours[daylightHours.length - 1];
              const tol = lastHour.derived.estimatedTopOfLift;
              if (tol === null || tol < MIN_ALT_M || tol > MAX_ALT_M) return null;
              const y = yScale(tol);
              return (
                <text
                  x={chartW + 4}
                  y={y}
                  fill="#fbbf24"
                  fontSize={10}
                  dominantBaseline="middle"
                  fontWeight="bold"
                  fontFamily="inherit"
                >
                  Ceiling
                </text>
              );
            })()}

          {/* ── Launch elevation line ── */}
          {launchY !== null && (
            <>
              <line
                x1={0}
                y1={launchY}
                x2={chartW}
                y2={launchY}
                stroke={launchLineColor}
                strokeWidth={2}
              />
              <text x={4} y={launchY - 4} fill={launchLineColor} fontSize={10} fontFamily="inherit">
                Launch: {Math.round(launchElevation!)}m /{' '}
                {Math.round(mToFt(launchElevation!)).toLocaleString()}ft
              </text>
            </>
          )}

          {/* ── Y axis (altitude) labels — LEFT side ── */}
          {altTicks.map((ft) => {
            const m = ftToM(ft);
            const y = yScale(m);
            return (
              <g key={ft}>
                {/* Feet label (primary) */}
                <text
                  x={-6}
                  y={y}
                  textAnchor="end"
                  dominantBaseline="middle"
                  fill={textColor}
                  fontSize={11}
                  fontFamily="inherit"
                >
                  {ft >= 1000 ? `${ft / 1000}k ft` : `${ft} ft`}
                </text>
                {/* Meters label (secondary, smaller) */}
                <text
                  x={-6}
                  y={y + 11}
                  textAnchor="end"
                  dominantBaseline="middle"
                  fill={dimTextColor}
                  fontSize={9}
                  fontFamily="inherit"
                >
                  {Math.round(m)}m
                </text>
              </g>
            );
          })}

          {/* ── X axis (time) labels — BOTTOM ── */}
          {timeLabels.map(({ label, x }) => (
            <text
              key={x}
              x={x}
              y={chartH + 16}
              textAnchor="middle"
              fill={textColor}
              fontSize={11}
              fontFamily="inherit"
            >
              {label}
            </text>
          ))}

          {/* Chart border */}
          <rect
            x={0}
            y={0}
            width={chartW}
            height={chartH}
            fill="none"
            stroke={gridColor}
            strokeWidth={1}
          />
        </g>
      </svg>
    </div>
  );
}
