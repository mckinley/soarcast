import { eq } from 'drizzle-orm';
import type { Db } from '~/app/lib/db.server';
import { forecastTrackRecords, trackRecordLocations } from '~/db/schema';
import {
  parseMetarCsv,
  scoreTrackRecord,
  STATION_RADIUS_KM,
  totalRecord,
  TRACK_RECORD_DAYS,
  TRACK_RECORD_MAX_AGE_DAYS,
  type HourlyForecast,
  type TrackRecord,
  type TrackRecordStation,
} from '~/lib/track-record';
import { calculateDistance } from '~/lib/site-utils';
import { profileLocationKey } from '~/lib/weather-profile';

// Builds and keeps a forecast's track record at the airport nearest a place:
// the day-before forecast (Open-Meteo Previous Runs, the same model choice
// the app uses) against the airport's METARs (Iowa Environmental Mesonet's
// archive, which has airports worldwide). Recomputed once a month.

const MAX_AGE_MS = TRACK_RECORD_MAX_AGE_DAYS * 24 * 3600 * 1000;
/** An airport with fewer scored days than this reports too little; try the next one. */
const MIN_DAYS = 60;
const USER_AGENT = 'SoarCast (https://soarcast.mckinleyaviation.com)';

export interface TrackRecordResult {
  record: TrackRecord | null;
  distanceKm: number | null;
}

interface NearbyStation extends TrackRecordStation {
  distanceKm: number;
}

/** Airports near a place, nearest first, from aviationweather.gov's station list. */
async function stationsNear(latitude: number, longitude: number): Promise<NearbyStation[]> {
  const dLat = STATION_RADIUS_KM / 111;
  const dLng = dLat / Math.max(0.2, Math.cos((latitude * Math.PI) / 180));
  const bbox = [latitude - dLat, longitude - dLng, latitude + dLat, longitude + dLng]
    .map((v) => v.toFixed(3))
    .join(',');
  const response = await fetch(
    `https://aviationweather.gov/api/data/stationinfo?bbox=${bbox}&format=json`,
    { headers: { 'User-Agent': USER_AGENT } },
  );
  if (!response.ok) throw new Error(`Station lookup failed: ${response.status}`);
  const stations = (await response.json()) as Array<{
    icaoId: string | null;
    site: string;
    lat: number;
    lon: number;
    elev: number | null;
  }>;
  return stations
    .filter((s) => s.icaoId && /^[A-Z0-9]{4}$/.test(s.icaoId))
    .map((s) => ({
      id: s.icaoId!,
      name: s.site,
      latitude: s.lat,
      longitude: s.lon,
      elevation: s.elev,
      distanceKm: Math.round(calculateDistance(latitude, longitude, s.lat, s.lon) * 10) / 10,
    }))
    .filter((s) => s.distanceKm <= STATION_RADIUS_KM)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, 3);
}

async function fetchWithRetry(url: string): Promise<Response> {
  let response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (response.status === 429 || response.status >= 500) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  }
  return response;
}

/** The day-before forecast at the airport, hour by hour in its local time. */
async function fetchPastForecasts(
  station: TrackRecordStation,
  from: string,
  to: string,
): Promise<{ forecast: HourlyForecast; timezone: string }> {
  const vars = ['precipitation', 'wind_speed_10m', 'wind_direction_10m'];
  const params = new URLSearchParams({
    latitude: String(station.latitude),
    longitude: String(station.longitude),
    hourly: vars.map((v) => `${v}_previous_day1`).join(','),
    start_date: from,
    end_date: to,
    timezone: 'auto',
  });
  const response = await fetchWithRetry(
    `https://previous-runs-api.open-meteo.com/v1/forecast?${params}`,
  );
  const body = await response.text();
  let data: { timezone: string; hourly: Record<string, (number | null)[]> & { time: string[] } };
  try {
    if (!response.ok) throw new Error();
    data = JSON.parse(body);
  } catch {
    throw new Error(`Open-Meteo previous runs: ${response.status} ${body.slice(0, 200)}`.trim());
  }
  const h = data.hourly;
  return {
    timezone: data.timezone,
    forecast: {
      time: h.time,
      precipitation: h.precipitation_previous_day1 ?? [],
      windSpeed: h.wind_speed_10m_previous_day1 ?? [],
      windDirection: h.wind_direction_10m_previous_day1 ?? [],
    },
  };
}

/** The airport's routine and special reports over the period, in its local time. */
async function fetchMetars(
  stationId: string,
  from: string,
  to: string,
  timezone: string,
): Promise<string> {
  const [y1, m1, d1] = from.split('-');
  const [y2, m2, d2] = to.split('-');
  const params = new URLSearchParams([
    ['station', stationId],
    ['data', 'sknt'],
    ['data', 'drct'],
    ['data', 'wxcodes'],
    ['data', 'p01i'],
    ['year1', y1],
    ['month1', String(Number(m1))],
    ['day1', String(Number(d1))],
    ['year2', y2],
    ['month2', String(Number(m2))],
    ['day2', String(Number(d2))],
    ['tz', timezone],
    ['format', 'onlycomma'],
    ['missing', 'M'],
    ['trace', 'T'],
    ['report_type', '3'],
    ['report_type', '4'],
  ]);
  const response = await fetchWithRetry(
    `https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py?${params}`,
  );
  if (!response.ok) throw new Error(`METAR archive: ${response.status}`);
  return response.text();
}

export async function buildTrackRecord(
  station: TrackRecordStation,
  now: Date = new Date(),
): Promise<TrackRecord> {
  const day = 24 * 3600 * 1000;
  const to = new Date(now.getTime() - day).toISOString().slice(0, 10);
  const from = new Date(now.getTime() - TRACK_RECORD_DAYS * day).toISOString().slice(0, 10);
  const { forecast, timezone } = await fetchPastForecasts(station, from, to);
  const metars = await fetchMetars(station.id, from, to, timezone);
  const months = scoreTrackRecord(forecast, parseMetarCsv(metars));
  return { station, from, to, months };
}

async function storedRecord(db: Db, stationId: string, now: number): Promise<TrackRecord | null> {
  const row = await db.query.forecastTrackRecords.findFirst({
    where: eq(forecastTrackRecords.stationId, stationId),
  });
  return row && now - row.computedAt.getTime() < MAX_AGE_MS ? row.record : null;
}

/**
 * The track record for the airport nearest a place, from D1 when it is
 * under a month old, otherwise built now (a few seconds) and stored.
 */
export async function getTrackRecord(
  db: Db,
  latitude: number,
  longitude: number,
): Promise<TrackRecordResult> {
  const now = Date.now();
  const locationKey = profileLocationKey(latitude, longitude);
  const location = await db.query.trackRecordLocations.findFirst({
    where: eq(trackRecordLocations.locationKey, locationKey),
  });
  if (location && now - location.checkedAt.getTime() < MAX_AGE_MS) {
    if (!location.stationId) return { record: null, distanceKm: null };
    const record = await storedRecord(db, location.stationId, now);
    if (record) return { record, distanceKm: location.distanceKm };
  }

  let found: { record: TrackRecord; distanceKm: number } | null = null;
  let failure: unknown = null;
  for (const station of await stationsNear(latitude, longitude)) {
    const { distanceKm, ...rest } = station;
    let record = await storedRecord(db, station.id, now);
    if (!record) {
      try {
        record = await buildTrackRecord(rest);
      } catch (error) {
        // Try the next airport, but don't record "none here" for a failed fetch
        console.error(`Track record for ${station.id} failed:`, error);
        failure = error;
        continue;
      }
      if (totalRecord(record.months).days < MIN_DAYS) continue;
      await db
        .insert(forecastTrackRecords)
        .values({ stationId: station.id, record, computedAt: new Date(now) })
        .onConflictDoUpdate({
          target: forecastTrackRecords.stationId,
          set: { record, computedAt: new Date(now) },
        });
    }
    found = { record, distanceKm };
    break;
  }
  if (!found && failure) throw failure;

  const values = {
    stationId: found?.record.station.id ?? null,
    distanceKm: found?.distanceKm ?? null,
    checkedAt: new Date(now),
  };
  await db
    .insert(trackRecordLocations)
    .values({ locationKey, ...values })
    .onConflictDoUpdate({ target: trackRecordLocations.locationKey, set: values });
  return found ?? { record: null, distanceKm: null };
}
