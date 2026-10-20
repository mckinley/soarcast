// A forecast's track record at one airport: the forecast from the day before
// against what the airport reported in the flying hours, month by month. It
// tells a pilot how far to trust the forecast in that part of the world.

/** Flying hours scored: rain in the hours ending 11:00..17:00, wind at 10:00..17:00 local. */
const RAIN_HOURS = [11, 12, 13, 14, 15, 16, 17];
const WIND_HOURS = [10, 11, 12, 13, 14, 15, 16, 17];
/** An hour with this much forecast rain is a rainy hour, as the forecast engine rates it. */
export const FORECAST_RAIN_MM = 0.3;
/** A day counts when the airport reported in at least this many of the rain hours. */
const MIN_REPORTED_HOURS = 5;
/** Below this the airport's wind direction is mostly noise. */
const DIRECTION_MIN_KMH = 9;
const KNOTS_TO_KMH = 1.852;

/** Totals for one calendar month (all years in the period). */
export interface MonthRecord {
  month: number; // 1-12
  days: number;
  rainForecastDays: number;
  rainSeenDays: number;
  /** Days the forecast called rain and rain fell */
  rainBothDays: number;
  windHours: number;
  windAbsErrorSum: number; // km/h
  windBiasSum: number; // forecast - observed, km/h
  directionHours: number;
  directionRightHours: number; // within 45°
}

export interface TrackRecordStation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  elevation: number | null;
}

export interface TrackRecord {
  station: TrackRecordStation;
  from: string; // YYYY-MM-DD
  to: string;
  months: MonthRecord[];
}

/** What the airport reported in one hour. */
interface ObservedHour {
  reports: number;
  wet: boolean;
  wind: { speed: number; direction: number | null; offsetMinutes: number } | null;
}

/** The forecast, hour by hour in the station's local time, as Open-Meteo returns it. */
export interface HourlyForecast {
  time: string[]; // YYYY-MM-DDTHH:00
  precipitation: (number | null)[]; // mm in the hour ending at time
  windSpeed: (number | null)[]; // km/h
  windDirection: (number | null)[];
}

// Precipitation weather codes: rain, drizzle, snow, hail and showers or
// thunderstorms with them. "VC" (in the vicinity) codes don't count.
const PRECIP =
  /(?:^|[-+])(?:SH|TS|FZ)?(?:RA|DZ|SN|GR|GS|PL|UP)|(?:^|[-+])(?:SH|TS)(?:RA|SN|GR|GS|PL)/;

function hourKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 13) + ':00';
}

/**
 * Hour by hour from Iowa Environmental Mesonet's ASOS/METAR archive CSV
 * (columns valid, sknt, drct, wxcodes, p01i; times local). A report belongs
 * to the hour it falls in for rain, and to the nearest hour for wind.
 */
export function parseMetarCsv(csv: string): Map<string, ObservedHour> {
  const lines = csv.trim().split('\n');
  const header = lines[0].split(',');
  const col = (name: string) => header.indexOf(name);
  const [iValid, iSknt, iDrct, iWx, iP01] = ['valid', 'sknt', 'drct', 'wxcodes', 'p01i'].map(col);
  const out = new Map<string, ObservedHour>();
  const at = (key: string) => {
    let h = out.get(key);
    if (!h) {
      h = { reports: 0, wet: false, wind: null };
      out.set(key, h);
    }
    return h;
  };

  for (const line of lines.slice(1)) {
    const f = line.split(',');
    const valid = f[iValid];
    if (!valid) continue;
    // Local wall time, read as UTC only to do minute arithmetic on it
    const t = Date.parse(`${valid.replace(' ', 'T')}:00Z`);
    if (Number.isNaN(t)) continue;

    const rainHour = at(hourKey(Math.ceil(t / 3_600_000) * 3_600_000));
    rainHour.reports++;
    const codes = iWx >= 0 && f[iWx] !== 'M' ? f[iWx].split(' ') : [];
    if (codes.some((c) => !c.startsWith('VC') && PRECIP.test(c))) rainHour.wet = true;
    const p01 = iP01 >= 0 ? f[iP01] : 'M';
    if (p01 === 'T' || (p01 !== 'M' && p01 !== '' && Number(p01) > 0)) rainHour.wet = true;

    const sknt = iSknt >= 0 ? f[iSknt] : 'M';
    if (sknt !== 'M' && sknt !== '') {
      const nearest = Math.round(t / 3_600_000) * 3_600_000;
      const offsetMinutes = Math.abs(t - nearest) / 60_000;
      const windHour = at(hourKey(nearest));
      if (!windHour.wind || offsetMinutes < windHour.wind.offsetMinutes) {
        const drct = iDrct >= 0 ? f[iDrct] : 'M';
        windHour.wind = {
          speed: Number(sknt) * KNOTS_TO_KMH,
          direction: drct === 'M' || drct === '' ? null : Number(drct),
          offsetMinutes,
        };
      }
    }
  }
  return out;
}

function angleDifference(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

function emptyMonth(month: number): MonthRecord {
  return {
    month,
    days: 0,
    rainForecastDays: 0,
    rainSeenDays: 0,
    rainBothDays: 0,
    windHours: 0,
    windAbsErrorSum: 0,
    windBiasSum: 0,
    directionHours: 0,
    directionRightHours: 0,
  };
}

/** Scores the forecast against the airport's reports, day by day, into months. */
export function scoreTrackRecord(
  forecast: HourlyForecast,
  observed: Map<string, ObservedHour>,
): MonthRecord[] {
  const byTime = new Map(forecast.time.map((t, i) => [t, i]));
  const months = new Map<number, MonthRecord>();
  const dates = [...new Set(forecast.time.map((t) => t.slice(0, 10)))];

  for (const date of dates) {
    const key = (h: number) => `${date}T${String(h).padStart(2, '0')}:00`;
    const rainHours = RAIN_HOURS.map((h) => {
      const i = byTime.get(key(h));
      return { fc: i === undefined ? null : forecast.precipitation[i], obs: observed.get(key(h)) };
    });
    const reported = rainHours.filter((h) => h.obs && h.obs.reports > 0).length;
    if (reported < MIN_REPORTED_HOURS || rainHours.some((h) => h.fc === null)) continue;

    const month = Number(date.slice(5, 7));
    const m = months.get(month) ?? emptyMonth(month);
    months.set(month, m);
    const forecastRain = rainHours.some((h) => (h.fc ?? 0) >= FORECAST_RAIN_MM);
    const seenRain = rainHours.some((h) => h.obs?.wet);
    m.days++;
    if (forecastRain) m.rainForecastDays++;
    if (seenRain) m.rainSeenDays++;
    if (forecastRain && seenRain) m.rainBothDays++;

    for (const h of WIND_HOURS) {
      const i = byTime.get(key(h));
      const wind = observed.get(key(h))?.wind;
      const speed = i === undefined ? null : forecast.windSpeed[i];
      if (!wind || speed === null) continue;
      m.windHours++;
      m.windAbsErrorSum += Math.abs(speed - wind.speed);
      m.windBiasSum += speed - wind.speed;
      const direction = forecast.windDirection[i!];
      // METARs give 0 for calm and variable winds
      if (wind.speed >= DIRECTION_MIN_KMH && wind.direction && direction !== null) {
        m.directionHours++;
        if (angleDifference(direction, wind.direction) <= 45) m.directionRightHours++;
      }
    }
  }
  return [...months.values()].sort((a, b) => a.month - b.month);
}

/** All the months added together, for the year as a whole. */
export function totalRecord(months: MonthRecord[]): MonthRecord {
  return months.reduce(
    (t, m) => ({
      month: 0,
      days: t.days + m.days,
      rainForecastDays: t.rainForecastDays + m.rainForecastDays,
      rainSeenDays: t.rainSeenDays + m.rainSeenDays,
      rainBothDays: t.rainBothDays + m.rainBothDays,
      windHours: t.windHours + m.windHours,
      windAbsErrorSum: t.windAbsErrorSum + m.windAbsErrorSum,
      windBiasSum: t.windBiasSum + m.windBiasSum,
      directionHours: t.directionHours + m.directionHours,
      directionRightHours: t.directionRightHours + m.directionRightHours,
    }),
    emptyMonth(0),
  );
}

export type Trust = 'good' | 'fair' | 'poor' | 'unknown';

/**
 * How far to trust a rain forecast: how often rain fell on the days it was
 * forecast, and poor whatever that is when it calls rain on more than twice
 * as many days as it falls. Washington airports scored about 0.75, Colombian
 * ones 0.2 to 0.4 with rain forecast on two to four times as many days.
 */
export function rainTrustOf(m: MonthRecord): Trust {
  if (m.rainForecastDays < 5) return 'unknown';
  const hit = m.rainBothDays / m.rainForecastDays;
  if (hit < 0.35 || m.rainForecastDays > 2 * m.rainSeenDays) return 'poor';
  return hit >= 0.6 ? 'good' : 'fair';
}

/** How far to trust the wind: its average error, marked down when the direction is often wrong. */
export function windTrustOf(m: MonthRecord): Trust {
  if (m.windHours < 50) return 'unknown';
  const error = m.windAbsErrorSum / m.windHours;
  const levels: Trust[] = ['good', 'fair', 'poor'];
  let level = error <= 6 ? 0 : error <= 10 ? 1 : 2;
  if (m.directionHours >= 20 && m.directionRightHours / m.directionHours < 0.5) {
    level = Math.min(2, level + 1);
  }
  return levels[level];
}

export const TRUST_WORD: Record<Trust, string> = {
  good: 'Good',
  fair: 'Fair',
  poor: 'Poor',
  unknown: 'Too little to say',
};

/** "The forecast called rain in the flying hours on 18 of 31 days, and rain fell on 4 of them." */
export function rainText(m: MonthRecord): string {
  const missed = m.rainSeenDays - m.rainBothDays;
  if (m.rainForecastDays === 0) {
    return `The forecast called rain in the flying hours on none of ${m.days} days, and rain fell on ${m.rainSeenDays}.`;
  }
  const also =
    missed > 0 ? `; it also fell on ${missed} ${missed === 1 ? 'day' : 'days'} forecast dry` : '';
  return `The forecast called rain in the flying hours on ${m.rainForecastDays} of ${m.days} days, and rain fell on ${m.rainBothDays} of them${also}.`;
}

/** "Wind was off by 5 km/h on average (it reads 4 km/h low), direction within 45° 40% of the time." */
export function windText(m: MonthRecord): string | null {
  if (m.windHours === 0) return null;
  const error = Math.round(m.windAbsErrorSum / m.windHours);
  const bias = Math.round(m.windBiasSum / m.windHours);
  const reads =
    Math.abs(bias) >= 3 ? ` (it reads ${Math.abs(bias)} km/h ${bias < 0 ? 'low' : 'high'})` : '';
  const direction =
    m.directionHours >= 20
      ? `, direction within 45° ${Math.round((100 * m.directionRightHours) / m.directionHours)}% of the time`
      : '';
  return `Wind was off by ${error} km/h on average${reads}${direction}.`;
}
