// Sunrise and sunset from the sun's position, and wall-clock time in a
// time zone, for weather that comes without them (ERA5, ensemble forecasts).

const RAD = Math.PI / 180;

/** Sunrise and sunset (UTC ms) on a date, by the sunrise equation. Null in polar day or night. */
export function sunTimes(date: string, lat: number, lon: number): [number, number] | null {
  const jd = Date.parse(`${date}T12:00:00Z`) / 864e5 + 2440587.5;
  const n = Math.round(jd - 2451545.0 + 0.0008);
  const jStar = n - lon / 360;
  const m = (357.5291 + 0.98560028 * jStar) % 360;
  const c =
    1.9148 * Math.sin(m * RAD) + 0.02 * Math.sin(2 * m * RAD) + 0.0003 * Math.sin(3 * m * RAD);
  const lambda = (m + c + 180 + 102.9372) % 360;
  const transit =
    2451545.0 + jStar + 0.0053 * Math.sin(m * RAD) - 0.0069 * Math.sin(2 * lambda * RAD);
  const decl = Math.asin(Math.sin(lambda * RAD) * Math.sin(23.4397 * RAD));
  const cosW =
    (Math.sin(-0.833 * RAD) - Math.sin(lat * RAD) * Math.sin(decl)) /
    (Math.cos(lat * RAD) * Math.cos(decl));
  if (cosW < -1 || cosW > 1) return null;
  const w = Math.acos(cosW) / RAD / 360;
  const ms = (j: number) => (j - 2440587.5) * 864e5;
  return [ms(transit - w), ms(transit + w)];
}

/** Local wall-clock offset (ms) in a time zone at an instant. */
export function zoneOffset(fmt: Intl.DateTimeFormat, t: number): number {
  const p = Object.fromEntries(fmt.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  const local = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute);
  return local - Math.floor(t / 60000) * 60000;
}

/** A UTC instant as local wall-clock text, once shifted by zoneOffset: "2026-07-14T13:00". */
export const localIso = (t: number) => new Date(t).toISOString().slice(0, 16);

/** A formatter that reads the wall clock in a time zone, for zoneOffset. */
export function zoneFormat(timeZone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Local sunrise and sunset ("YYYY-MM-DDTHH:MM") for each day at a place,
 * shaped like Open-Meteo's daily answer. A day with no sunrise or sunset
 * (polar day or night) spans the whole day.
 */
export function localSunTimes(
  days: string[],
  lat: number,
  lon: number,
  timeZone: string,
): { sunrise: string[]; sunset: string[] } {
  const fmt = zoneFormat(timeZone);
  const sunrise: string[] = [];
  const sunset: string[] = [];
  for (const d of days) {
    const sun = sunTimes(d, lat, lon);
    const off = zoneOffset(fmt, Date.parse(`${d}T12:00:00Z`));
    sunrise.push(sun ? localIso(sun[0] + off) : `${d}T00:00`);
    sunset.push(sun ? localIso(sun[1] + off) : `${d}T23:59`);
  }
  return { sunrise, sunset };
}

/**
 * Where the sun stands at a place and instant: its height above the
 * horizon and its compass bearing, degrees (a short solar formula, good to
 * a few tenths of a degree).
 */
export function sunPosition(
  lat: number,
  lon: number,
  ms: number,
): { elevation: number; azimuth: number } {
  const days = ms / 864e5 - 10957.5; // days since 2000-01-01 12:00 UTC
  const meanLon = (280.46 + 0.9856474 * days) % 360;
  const anomaly = ((357.528 + 0.9856003 * days) % 360) * RAD;
  const eclipticLon = (meanLon + 1.915 * Math.sin(anomaly) + 0.02 * Math.sin(2 * anomaly)) * RAD;
  const obliquity = (23.439 - 0.0000004 * days) * RAD;
  const decl = Math.asin(Math.sin(obliquity) * Math.sin(eclipticLon));
  const ra = Math.atan2(Math.cos(obliquity) * Math.sin(eclipticLon), Math.cos(eclipticLon));
  const sidereal = (280.46061837 + 360.98564736629 * days + lon) * RAD;
  const hourAngle = sidereal - ra;
  const phi = lat * RAD;
  const sinAlt =
    Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(hourAngle);
  const elevation = Math.asin(Math.max(-1, Math.min(1, sinAlt))) / RAD;
  // Bearing from north, clockwise
  const azimuth =
    (Math.atan2(
      Math.sin(hourAngle),
      Math.cos(hourAngle) * Math.sin(phi) - Math.tan(decl) * Math.cos(phi),
    ) /
      RAD +
      180 +
      360) %
    360;
  return { elevation, azimuth };
}
