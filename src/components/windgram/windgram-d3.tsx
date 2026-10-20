'use client';

import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import * as d3 from 'd3';
import type { AtmosphericProfile } from '@/lib/weather-profile';
import { interpolateAtHeight } from '@/lib/forecast-engine/launch-conditions';
import { Skeleton } from '@/components/ui/skeleton';
import { LAPSE_BANDS, lapseMeaning } from './lapse-rate-utils';
import { compassPoint, windBarbPath, windSpeedToBarb } from './wind-barb-utils';
import {
  altitudeRange,
  daylightHours,
  lapseRateAt,
  levelValueAt,
  sampleGrid,
  windgramColumn,
  type AltitudeRange,
  type GridSpec,
  type WindgramColumn,
  type WindgramLevel,
} from './windgram-data';

interface WindgramD3Props {
  /** One day of the profile */
  data: AtmosphericProfile | null;
  loading?: boolean;
  className?: string;
  /** Launch altitude, meters MSL */
  launchElevation?: number;
  /** The site's wind limit (km/h); stronger barbs are drawn red */
  maxWindSpeed?: number;
  /** Altitudes to show, kept the same across the week; computed from `data` when absent */
  range?: AltitudeRange;
}

const FT_PER_M = 3.28084;
const ISOTHERM_STEP_C = 5;
const TERRAIN_COLOR = '#57534e';
const LIFT_COLOR = '#fde047';
const BARB_COLOR = '#ffffff';
const STRONG_BARB_COLOR = '#ff2e2e';
const BARB_HALO = 'rgba(20, 20, 50, 0.4)';

const ftLabel = (ft: number) => `${Math.round(ft).toLocaleString('en-US')}'`;

function hourLabel(hour: number): string {
  const h = hour % 12 || 12;
  return `${h}${hour < 12 ? 'a' : 'p'}`;
}

/** Tick values at the first step that leaves at least `minPx` between ticks. */
function niceTicks(lo: number, hi: number, pxPerUnit: number, steps: number[], minPx: number) {
  const step = steps.find((s) => s * pxPerUnit >= minPx) ?? steps[steps.length - 1];
  const ticks: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) ticks.push(v);
  return ticks;
}

/** d3.geoPath that maps contour grid coordinates onto the chart. */
function gridPath(spec: GridSpec, x: (hour: number) => number, y: (alt: number) => number) {
  const toHour = (gx: number) => (gx - 0.5 - spec.padX) / spec.sub;
  const toAlt = (gy: number) => spec.top - (gy - 0.5 - spec.padY) * spec.dy;
  return d3.geoPath(
    d3.geoTransform({
      point(gx, gy) {
        this.stream.point(x(toHour(gx)), y(toAlt(gy)));
      },
    }),
  );
}

/** Lowest altitude where an hour's temperature crosses `value`, or null */
function crossingAlt(levels: WindgramLevel[], value: number): number | null {
  for (let i = 0; i < levels.length - 1; i++) {
    const a = levels[i].temperature - value;
    const b = levels[i + 1].temperature - value;
    if (a === 0 || a * b < 0) {
      return levels[i].alt + (a / (a - b || 1)) * (levels[i + 1].alt - levels[i].alt);
    }
  }
  return null;
}

/** Puffy cumulus centered on (0,0), about 18 x 10 px */
const CUMULUS_PATH =
  'M-9 3a3.5 3.5 0 0 1 2-6.4a5 5 0 0 1 9.2-1.6a4 4 0 0 1 6.6 3.4a3 3 0 0 1 0.2 4.6Z';

export function WindgramD3({
  data,
  loading = false,
  className = '',
  launchElevation,
  maxWindSpeed,
  range: rangeProp,
}: WindgramD3Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const [pointer, setPointer] = useState<{ col: number; alt: number } | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(w);
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const compact = width < 560;
  const margin = compact
    ? { top: 30, right: 42, bottom: 22, left: 44 }
    : { top: 34, right: 46, bottom: 24, left: 54 };
  const plotW = Math.max(100, width - margin.left - margin.right);
  const plotH = Math.round(Math.max(300, Math.min(500, width * 0.55)));
  const height = margin.top + plotH + margin.bottom;

  const ground = data?.elevation ?? 0;
  const range = useMemo(
    () => rangeProp ?? (data ? altitudeRange(data, launchElevation) : { min: 0, max: 3000 }),
    [rangeProp, data, launchElevation],
  );

  const columns: WindgramColumn[] = useMemo(() => {
    if (!data || data.hours.length === 0) return [];
    const date = data.hours[0].time.slice(0, 10);
    return daylightHours(data.hours, data.sunriseByDay?.[date], data.sunsetByDay?.[date]).map((h) =>
      windgramColumn(h, data.elevation),
    );
  }, [data]);

  // A strip of ground under the lowest altitude, for the surface barbs to stand on
  const groundStrip = (range.max - range.min) * 0.04;
  const x = useMemo(
    () =>
      d3
        .scaleLinear()
        .domain([-0.5, Math.max(0, columns.length - 0.5)])
        .range([0, plotW]),
    [columns.length, plotW],
  );
  const y = useMemo(
    () =>
      d3
        .scaleLinear()
        .domain([range.min - groundStrip, range.max])
        .range([plotH, 0]),
    [range, groundStrip, plotH],
  );

  const lapsePaths = useMemo(() => {
    if (columns.length < 2) return [];
    const { spec, values } = sampleGrid(columns, range, (c, alt) => lapseRateAt(c.layers, alt));
    const path = gridPath(spec, x, y);
    const bands = d3
      .contours()
      .size([spec.nx, spec.ny])
      .thresholds(LAPSE_BANDS.slice(1).map((b) => b.min))(values);
    return bands.map((band, i) => ({ d: path(band) ?? '', color: LAPSE_BANDS[i + 1].color }));
  }, [columns, range, x, y]);

  const cloudPath = useMemo(() => {
    if (columns.length < 2) return null;
    const { spec, values } = sampleGrid(columns, range, (c, alt) =>
      levelValueAt(c.levels, alt, (l) => l.cloudCover),
    );
    const [cloud] = d3.contours().size([spec.nx, spec.ny]).thresholds([50])(values);
    return gridPath(spec, x, y)(cloud) || null;
  }, [columns, range, x, y]);

  const isotherms = useMemo(() => {
    if (columns.length < 2) return [];
    const { spec, values } = sampleGrid(columns, range, (c, alt) =>
      levelValueAt(c.levels, alt, (l) => l.temperature),
    );
    const finite = values.filter(Number.isFinite);
    const lo = Math.ceil(Math.min(...finite) / ISOTHERM_STEP_C) * ISOTHERM_STEP_C;
    const hi = Math.max(...finite);
    const thresholds = d3.range(lo, hi, ISOTHERM_STEP_C);
    const path = gridPath(spec, x, y);
    // Labels sit between two hours near the right, clear of the barb columns
    const labelCol = Math.min(columns.length - 2, Math.round((columns.length - 1) * 0.8) - 1);
    return d3
      .contours()
      .size([spec.nx, spec.ny])
      .thresholds(thresholds)(values)
      .map((iso) => {
        const crossings = [labelCol, labelCol + 1]
          .map((c) => crossingAlt(columns[c].levels, iso.value))
          .filter((a): a is number => a !== null);
        const labelAlt = crossings.length > 0 ? d3.mean(crossings)! : null;
        const inRange = labelAlt !== null && labelAlt > range.min + 50 && labelAlt < range.max - 50;
        return {
          value: iso.value,
          d: path(iso) ?? '',
          label: inRange ? { x: x(labelCol + 0.5), y: y(labelAlt!) } : null,
        };
      });
  }, [columns, range, x, y]);

  const colW = columns.length > 0 ? plotW / columns.length : plotW;
  const barbLength = Math.max(13, Math.min(22, colW * 0.62));
  const hourStep = colW < 17 ? 2 : 1;
  const windLimit = maxWindSpeed ?? Infinity;

  const barbs = useMemo(() => {
    const out: Array<{
      key: string;
      cx: number;
      cy: number;
      d: string;
      rotate: number;
      calm: boolean;
      strong: boolean;
    }> = [];
    const minGap = barbLength * 0.85;
    columns.forEach((column, i) => {
      if (i % hourStep !== 0) return;
      let lastY = Infinity;
      for (const level of column.levels) {
        if (level.alt > range.max) break;
        const cy = y(level.alt);
        if (lastY - cy < minGap) continue;
        lastY = cy;
        const barb = windSpeedToBarb(level.windSpeed, level.windDirection);
        out.push({
          key: `${i}-${level.alt}`,
          cx: x(i),
          cy,
          d: barb.calm ? '' : windBarbPath(barb, barbLength),
          rotate: barb.direction,
          calm: barb.calm,
          strong: level.windSpeed > windLimit,
        });
      }
    });
    return out;
  }, [columns, range.max, x, y, barbLength, hourStep, windLimit]);

  // Top of lift, drawn through each run of hours with climbable thermals
  const liftRuns = useMemo(() => {
    const runs: [number, number][][] = [];
    let run: [number, number][] = [];
    columns.forEach((c, i) => {
      if (c.topOfLift !== null && c.topOfLift > range.min) {
        run.push([x(i), y(Math.min(c.topOfLift, range.max))]);
      } else if (run.length > 0) {
        runs.push(run);
        run = [];
      }
    });
    if (run.length > 0) runs.push(run);
    const line = d3.line().curve(d3.curveMonotoneX);
    return runs.map((r) =>
      r.length === 1 ? `M${r[0][0] - colW * 0.35} ${r[0][1]}h${colW * 0.7}` : line(r)!,
    );
  }, [columns, range, x, y, colW]);

  if (loading || !data) {
    return (
      <div className={`w-full ${className}`} ref={containerRef}>
        <Skeleton className="w-full h-[380px] md:h-[500px]" />
      </div>
    );
  }

  const fontSize = compact ? 10 : 11;
  const ftTicks = niceTicks(
    range.min * FT_PER_M,
    range.max * FT_PER_M,
    plotH / ((range.max - range.min + groundStrip) * FT_PER_M),
    [500, 1000, 2000, 5000],
    compact ? 26 : 30,
  );
  const mTicks = niceTicks(
    range.min,
    range.max,
    plotH / (range.max - range.min + groundStrip),
    [100, 200, 250, 500, 1000],
    compact ? 26 : 30,
  );
  const labelEvery = colW < 34 ? 2 : 1;
  const groundY = y(ground);
  const launchY =
    launchElevation !== undefined && launchElevation >= range.min && launchElevation <= range.max
      ? y(launchElevation)
      : null;

  const onPointer = (e: PointerEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const col = Math.round(x.invert(e.clientX - rect.left));
    const alt = y.invert(e.clientY - rect.top);
    if (col < 0 || col >= columns.length) return;
    setPointer({ col, alt: Math.max(ground, Math.min(range.max, alt)) });
  };

  const readout =
    pointer && columns[pointer.col] ? describePoint(columns[pointer.col], pointer.alt) : null;
  const strongWinds = barbs.some((b) => b.strong);
  const clipId = 'windgram-plot-clip';
  const barbClipId = 'windgram-barb-clip';
  const hatchId = 'windgram-cloud-hatch';

  return (
    <div ref={containerRef} className={`w-full ${className}`}>
      <svg
        id="windgram-chart"
        width={width}
        height={height}
        role="img"
        aria-label="Windgram: wind, temperature and thermals from the ground up through the day"
        className="block select-none"
        style={{ touchAction: 'pan-y' }}
      >
        <defs>
          <clipPath id={clipId}>
            <rect x={0} y={0} width={plotW} height={plotH} />
          </clipPath>
          <clipPath id={barbClipId}>
            <rect x={0} y={-5} width={plotW} height={plotH + 5} />
          </clipPath>
          <pattern
            id={hatchId}
            width={6}
            height={6}
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <line x1={0} y1={0} x2={0} y2={6} stroke="rgba(25, 25, 40, 0.55)" strokeWidth={1.2} />
          </pattern>
        </defs>

        {/* Thermal strength (W*) per hour, above the chart */}
        <g transform={`translate(${margin.left},${margin.top - 24})`}>
          <text
            x={-6}
            y={9}
            textAnchor="end"
            dominantBaseline="central"
            fontSize={fontSize - 1}
            className="fill-muted-foreground"
          >
            Lift m/s
          </text>
          {columns.map((c, i) => {
            const w = c.wStar ?? 0;
            return (
              <g key={c.time}>
                <rect
                  x={x(i - 0.5) + 1}
                  y={0}
                  width={colW - 2}
                  height={18}
                  rx={3}
                  fill="rgb(234, 179, 8)"
                  fillOpacity={w >= 0.3 ? Math.min(1, 0.15 + w / 2.5) : 0.06}
                />
                {(i % labelEvery === 0 || !compact) && (
                  <text
                    x={x(i)}
                    y={9}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={fontSize - 1}
                    fontWeight={600}
                    className={w >= 1.2 ? 'fill-black' : 'fill-foreground'}
                  >
                    {w >= 0.05 ? w.toFixed(1) : '0'}
                  </text>
                )}
              </g>
            );
          })}
        </g>

        <g transform={`translate(${margin.left},${margin.top})`}>
          <g clipPath={`url(#${clipId})`}>
            {/* Lapse rate bands, RASP colors */}
            <rect width={plotW} height={plotH} fill={LAPSE_BANDS[0].color} />
            {lapsePaths.map((p, i) => (
              <path key={i} d={p.d} fill={p.color} />
            ))}

            {/* Model cloud */}
            {cloudPath && <path d={cloudPath} fill={`url(#${hatchId})`} />}

            {/* Altitude grid */}
            {ftTicks.map((ft) => (
              <line
                key={ft}
                x1={0}
                x2={plotW}
                y1={y(ft / FT_PER_M)}
                y2={y(ft / FT_PER_M)}
                stroke="rgba(255,255,255,0.35)"
              />
            ))}

            {/* Isotherms every 5 °C; 0 °C is the freezing level */}
            {isotherms.map((iso) => (
              <path
                key={iso.value}
                d={iso.d}
                fill="none"
                stroke={iso.value === 0 ? '#1d4ed8' : 'rgba(30, 30, 120, 0.55)'}
                strokeWidth={iso.value === 0 ? 1.6 : 1}
                strokeDasharray={iso.value === 0 ? '5 3' : undefined}
              />
            ))}
            {isotherms.map(
              (iso) =>
                iso.label && (
                  <text
                    key={`l${iso.value}`}
                    x={iso.label.x}
                    y={iso.label.y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={fontSize - 1}
                    fontWeight={600}
                    fill="rgb(30, 30, 120)"
                    stroke="rgba(255,255,255,0.8)"
                    strokeWidth={3}
                    paintOrder="stroke"
                  >
                    {iso.value}°
                  </text>
                ),
            )}

            {/* Top of lift */}
            {liftRuns.map((d, i) => (
              <g key={i}>
                <path
                  d={d}
                  fill="none"
                  stroke="rgba(0,0,0,0.6)"
                  strokeWidth={5}
                  strokeLinecap="round"
                />
                <path
                  d={d}
                  fill="none"
                  stroke={LIFT_COLOR}
                  strokeWidth={2.5}
                  strokeLinecap="round"
                />
              </g>
            ))}

            {/* Cumulus where thermals reach cloud base */}
            {columns.map(
              (c, i) =>
                c.cumulusBase !== null &&
                c.cumulusBase <= range.max && (
                  <path
                    key={`cu${i}`}
                    d={CUMULUS_PATH}
                    transform={`translate(${x(i)},${y(c.cumulusBase) - 6}) scale(${compact ? 0.8 : 1})`}
                    fill="#ffffff"
                    stroke="rgba(60,60,80,0.8)"
                    strokeWidth={1}
                  />
                ),
            )}

            {/* Ground below the model's terrain height */}
            <rect x={0} y={groundY} width={plotW} height={plotH - groundY} fill={TERRAIN_COLOR} />

            {/* Hovered hour and height */}
            {pointer && (
              <g pointerEvents="none">
                <rect
                  x={x(pointer.col - 0.5)}
                  width={colW}
                  height={plotH}
                  fill="rgba(255,255,255,0.18)"
                />
                <line
                  x1={0}
                  x2={plotW}
                  y1={y(pointer.alt)}
                  y2={y(pointer.alt)}
                  stroke="rgba(0,0,0,0.6)"
                  strokeDasharray="2 3"
                />
              </g>
            )}
          </g>

          {/* Wind barbs, km/h, clipped at the sides so edge barbs don't run into the axes */}
          <g pointerEvents="none" clipPath={`url(#${barbClipId})`}>
            {barbs.map((b) =>
              b.calm ? (
                <circle
                  key={b.key}
                  cx={b.cx}
                  cy={b.cy}
                  r={3}
                  fill="none"
                  stroke={BARB_COLOR}
                  strokeWidth={1.4}
                />
              ) : (
                <g key={b.key} transform={`translate(${b.cx},${b.cy}) rotate(${b.rotate})`}>
                  <path
                    d={b.d}
                    fill={BARB_HALO}
                    stroke={BARB_HALO}
                    strokeWidth={2.8}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d={b.d}
                    fill={b.strong ? STRONG_BARB_COLOR : BARB_COLOR}
                    stroke={b.strong ? STRONG_BARB_COLOR : BARB_COLOR}
                    strokeWidth={b.strong ? 1.7 : 1.2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </g>
              ),
            )}
          </g>

          {/* Launch */}
          {launchY !== null && (
            <g pointerEvents="none">
              <line
                x1={0}
                x2={plotW}
                y1={launchY}
                y2={launchY}
                stroke="rgba(0,0,0,0.85)"
                strokeWidth={1.5}
                strokeDasharray="7 4"
              />
              <rect
                x={4}
                y={launchY - fontSize - 7}
                width={fontSize * 0.6 * (8 + ftLabel(launchElevation! * FT_PER_M).length) + 8}
                height={fontSize + 5}
                rx={3}
                fill="rgba(255,255,255,0.88)"
              />
              <text x={8} y={launchY - 6} fontSize={fontSize} fontWeight={600} fill="#000">
                Launch {ftLabel(launchElevation! * FT_PER_M)}
              </text>
            </g>
          )}

          <text
            x={plotW - 4}
            y={plotH - 3}
            textAnchor="end"
            fontSize={fontSize - 2}
            fill="rgba(255,255,255,0.85)"
            pointerEvents="none"
          >
            Model ground {ftLabel(ground * FT_PER_M)}
          </text>

          {/* Axes: feet left, meters right, local hours below */}
          {ftTicks.map((ft) => (
            <text
              key={ft}
              x={-6}
              y={y(ft / FT_PER_M)}
              textAnchor="end"
              dominantBaseline="central"
              fontSize={fontSize}
              className="fill-foreground"
            >
              {ftLabel(ft)}
            </text>
          ))}
          {mTicks.map((m) => (
            <text
              key={m}
              x={plotW + 5}
              y={y(m)}
              dominantBaseline="central"
              fontSize={fontSize - 1}
              className="fill-muted-foreground"
            >
              {m}m
            </text>
          ))}
          {columns.map(
            (c, i) =>
              i % labelEvery === 0 && (
                <text
                  key={c.time}
                  x={x(i)}
                  y={plotH + 15}
                  textAnchor="middle"
                  fontSize={fontSize}
                  className="fill-foreground"
                >
                  {hourLabel(c.hour)}
                </text>
              ),
          )}
          <rect width={plotW} height={plotH} fill="none" stroke="rgba(0,0,0,0.35)" />

          <rect
            width={plotW}
            height={plotH}
            fill="transparent"
            onPointerMove={onPointer}
            onPointerDown={onPointer}
            onPointerLeave={(e) => e.pointerType === 'mouse' && setPointer(null)}
          />
        </g>
      </svg>

      <p className="mt-2 min-h-[2.5rem] text-xs text-muted-foreground" aria-live="polite">
        {readout ?? (
          <>
            Hover or tap the chart for exact numbers at any height.
            {strongWinds && maxWindSpeed !== undefined && (
              <> Red barbs are stronger than this site&apos;s {maxWindSpeed} km/h limit.</>
            )}
          </>
        )}
      </p>
    </div>
  );
}

/** One line of numbers for an hour and height under the pointer */
function describePoint(column: WindgramColumn, alt: number): string {
  const wind = interpolateAtHeight(
    column.levels.map((l) => ({
      height: l.alt,
      speed: l.windSpeed,
      direction: l.windDirection,
      temperature: l.temperature,
    })),
    alt,
  );
  const rate = lapseRateAt(column.layers, alt);
  const cloud = levelValueAt(column.levels, alt, (l) => l.cloudCover) ?? 0;
  const parts = [
    `${hourLabel(column.hour)} at ${ftLabel(alt * FT_PER_M)} (${Math.round(alt)} m)`,
    `wind ${compassPoint(wind.direction)} ${Math.round(wind.speed)} km/h`,
    `${Math.round(wind.temperature)}°C`,
  ];
  if (rate !== null) parts.push(`cooling ${rate.toFixed(1)}°C/1000 ft, ${lapseMeaning(rate)}`);
  if (cloud >= 50) parts.push('in cloud');
  return parts.join(' · ');
}
