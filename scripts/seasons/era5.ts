// ERA5, ECMWF's record of past weather, read straight from Open-Meteo's open
// copy on Amazon (s3://openmeteo, CC BY 4.0, no account, no rate limit). Each
// variable is a set of files over a 0.25° global grid: one per year, then
// 21-day chunks for the latest hours. A point's series is a few small range
// requests per file. Some variables have gaps (boundary layer height has
// none from January to mid-June 2024): those hours are simply missing.

import { OmDataType, OmFileReader, OmHttpBackend } from '@openmeteo/file-reader';

const BUCKET = 'https://openmeteo.s3.amazonaws.com/data/copernicus_era5';
const CHUNK_HOURS = 504;
export const HOUR_MS = 3600_000;
const CONCURRENCY = 48;
/** Files the bucket didn't have, for the log. */
export const missing = new Set<string>();

export const ERA5_VARIABLES = [
  'temperature_2m',
  'dew_point_2m',
  'wind_u_component_10m',
  'wind_v_component_10m',
  'wind_u_component_100m',
  'wind_v_component_100m',
  'wind_gusts_10m',
  'cloud_cover',
  'cloud_cover_low',
  'precipitation',
  'boundary_layer_height',
  'shortwave_radiation',
] as const;
export type Era5Variable = (typeof ERA5_VARIABLES)[number];

/** Every hour from `start` (UTC ms), one array per variable, NaN where the bucket has nothing. */
export interface Era5Series {
  start: number;
  hours: number;
  values: Record<Era5Variable, Float32Array>;
  /** Height of the ERA5 cell's ground, m */
  elevation: number;
}

/** The ERA5 grid cell a point is in, as indexes and as a key. */
export function era5Cell(latitude: number, longitude: number) {
  const y = Math.round((latitude + 90) / 0.25);
  const x = Math.round(((((longitude + 180) % 360) + 360) % 360) / 0.25) % 1440;
  return { y, x, key: `${y}:${x}` };
}

interface FileSpan {
  name: string;
  startMs: number;
  endMs: number;
}

const listed = new Map<string, Promise<FileSpan[]>>();

/** A variable's files in the bucket, oldest first: year files, then the chunks after the last one. */
function listFiles(variable: string): Promise<FileSpan[]> {
  if (!listed.has(variable))
    listed.set(
      variable,
      (async () => {
        const res = await fetch(
          `${BUCKET.replace('/data/', '/?list-type=2&max-keys=1000&prefix=data/')}/${variable}/`,
        );
        if (!res.ok) throw new Error(`ERA5 listing ${variable}: ${res.status}`);
        const xml = await res.text();
        const names = [...xml.matchAll(/<Key>[^<]*\/([^/<]+)\.om<\/Key>/g)].map((m) => m[1]);
        const years = names
          .filter((n) => n.startsWith('year_'))
          .map((n) => Number(n.slice(5)))
          .sort((a, b) => a - b)
          .map((y) => ({
            name: `year_${y}`,
            startMs: Date.UTC(y, 0, 1),
            endMs: Date.UTC(y + 1, 0, 1),
          }));
        const afterYears = years.length > 0 ? years[years.length - 1].endMs : 0;
        const chunks = names
          .filter((n) => n.startsWith('chunk_'))
          .map((n) => Number(n.slice(6)))
          .sort((a, b) => a - b)
          .map((c) => ({
            name: `chunk_${c}`,
            startMs: c * CHUNK_HOURS * HOUR_MS,
            endMs: (c + 1) * CHUNK_HOURS * HOUR_MS,
          }))
          .filter((c) => c.endMs > afterYears);
        return [...years, ...chunks];
      })(),
    );
  return listed.get(variable)!;
}

async function readPoint(path: string, y: number, x: number): Promise<Float32Array | null> {
  for (let attempt = 0; ; attempt++) {
    try {
      const reader = await OmFileReader.create(new OmHttpBackend({ url: `${BUCKET}/${path}.om` }));
      const dims = reader.getDimensions();
      const ranges = [
        { start: y, end: y + 1 },
        { start: x, end: x + 1 },
        ...(dims.length > 2 ? [{ start: 0, end: dims[2] }] : []),
      ];
      return (await reader.read({ type: OmDataType.FloatArray, ranges })) as Float32Array;
    } catch (error) {
      if ((error as { statusCode?: number }).statusCode === 404) {
        missing.add(path);
        return null;
      }
      if (attempt >= 2) throw error;
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
    }
  }
}

async function pool(tasks: Array<() => Promise<void>>, size: number): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, tasks.length) }, async () => {
      while (next < tasks.length) await tasks[next++]();
    }),
  );
}

/** ERA5 at a point, every hour from `fromMs` to `toMs` (UTC, whole hours). */
export async function era5Series(
  latitude: number,
  longitude: number,
  fromMs: number,
  toMs: number,
): Promise<Era5Series> {
  const { y, x } = era5Cell(latitude, longitude);
  const hours = Math.floor((toMs - fromMs) / HOUR_MS) + 1;
  const values = Object.fromEntries(
    ERA5_VARIABLES.map((v) => [v, new Float32Array(hours).fill(NaN)]),
  ) as Record<Era5Variable, Float32Array>;
  const spans = await Promise.all(ERA5_VARIABLES.map((v) => listFiles(v)));
  const tasks = ERA5_VARIABLES.flatMap((variable, i) =>
    spans[i]
      .filter((span) => span.endMs > fromMs && span.startMs <= toMs)
      .map((span) => async () => {
        const read = await readPoint(`${variable}/${span.name}`, y, x);
        if (!read) return;
        const out = values[variable];
        const offset = Math.round((span.startMs - fromMs) / HOUR_MS);
        for (let i = 0; i < read.length; i++) {
          const at = offset + i;
          if (at >= 0 && at < hours) out[at] = read[i];
        }
      }),
  );
  const [ground] = await Promise.all([readPoint('static/HSURF', y, x), pool(tasks, CONCURRENCY)]);
  return { start: fromMs, hours, values, elevation: ground?.[0] ?? 0 };
}

/** A variable at an hour (UTC ms), or null where ERA5 has none. */
export function era5At(s: Era5Series, variable: Era5Variable, t: number): number | null {
  const i = Math.round((t - s.start) / HOUR_MS);
  if (i < 0 || i >= s.hours) return null;
  const v = s.values[variable][i];
  return Number.isFinite(v) ? v : null;
}

/** Wind speed (km/h) and the direction it comes from (degrees) from u and v in m/s. */
export function windFromUV(u: number, v: number): { speed: number; direction: number } {
  const speed = Math.sqrt(u * u + v * v) * 3.6;
  const direction = ((Math.atan2(-u, -v) * 180) / Math.PI + 360) % 360;
  return { speed: Math.round(speed * 10) / 10, direction: Math.round(direction) };
}
