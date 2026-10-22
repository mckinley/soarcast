// ERA5 at a launch turned into the profile the forecast engine rates, a
// month at a time, in the launch's local time. ERA5 has surface weather
// only: no storm energy, no pressure levels and no visibility. Its 100 m
// wind stands in for the wind above the ground, and sunrise and sunset come
// from the sun's position. So storms and fog never hold a past day back.

import {
  profileFromOpenMeteo,
  type AtmosphericProfile,
  type OpenMeteoProfileResponse,
} from '../weather-profile';
import { era5At, HOUR_MS, windFromUV, type Era5Series, type Era5Variable } from './era5';
import { localIso, localSunTimes, zoneFormat, zoneOffset } from '../sun-times';

export { sunTimes, zoneOffset } from '../sun-times';

/** Hours missing what the engine can't do without are dropped, then days left short. */
export function cleanProfile(profile: AtmosphericProfile): AtmosphericProfile {
  const complete = profile.hours.filter(
    (h) =>
      h.surface.temperature != null &&
      h.surface.windSpeed != null &&
      h.surface.windDirection != null &&
      h.surface.windGusts != null &&
      h.pressureLevels.every((l) => l.geopotentialHeight != null && l.windSpeed != null),
  );
  const perDay = new Map<string, number>();
  for (const h of complete)
    perDay.set(h.time.slice(0, 10), (perDay.get(h.time.slice(0, 10)) ?? 0) + 1);
  return {
    ...profile,
    hours: complete.filter((h) => (perDay.get(h.time.slice(0, 10)) ?? 0) >= 20),
  };
}

/** Local days `from` to `to` (YYYY-MM-DD) of ERA5 at a launch, shaped like an Open-Meteo response. */
export function era5Span(
  s: Era5Series,
  from: string,
  to: string,
  timeZone: string,
  lat: number,
  lon: number,
): OpenMeteoProfileResponse {
  const fmt = zoneFormat(timeZone);
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`) + 24 * HOUR_MS;
  const utcHours: number[] = [];
  const times: string[] = [];
  for (let t = start - 14 * HOUR_MS; t < end + 14 * HOUR_MS; t += HOUR_MS) {
    const local = localIso(t + zoneOffset(fmt, t));
    const day = local.slice(0, 10);
    // The hour repeated when clocks go back is kept once
    if (day < from || day > to || local === times[times.length - 1]) continue;
    utcHours.push(t);
    times.push(local);
  }
  const days = [...new Set(times.map((t) => t.slice(0, 10)))];
  const { sunrise, sunset } = localSunTimes(days, lat, lon, timeZone);
  const get = (v: Era5Variable) => utcHours.map((t) => era5At(s, v, t));
  const wind = (u: Era5Variable, v: Era5Variable) => {
    const us = get(u);
    const vs = get(v);
    return us.map((uu, i) => (uu === null || vs[i] === null ? null : windFromUV(uu, vs[i]!)));
  };
  const w10 = wind('wind_u_component_10m', 'wind_v_component_10m');
  const w100 = wind('wind_u_component_100m', 'wind_v_component_100m');
  const temp = get('temperature_2m');
  const hourly = {
    time: times,
    temperature_2m: temp,
    dew_point_2m: get('dew_point_2m'),
    wind_speed_10m: w10.map((w) => w?.speed ?? null),
    wind_direction_10m: w10.map((w) => w?.direction ?? null),
    // m/s to km/h
    wind_gusts_10m: get('wind_gusts_10m').map((g) => (g === null ? null : Math.round(g * 36) / 10)),
    cloud_cover: get('cloud_cover'),
    cloud_cover_low: get('cloud_cover_low'),
    precipitation: get('precipitation'),
    boundary_layer_height: get('boundary_layer_height'),
    shortwave_radiation: get('shortwave_radiation'),
    cape: times.map(() => 0),
    convective_inhibition: times.map(() => 0),
    lifted_index: times.map(() => null),
    // ERA5's 100 m wind as the one level above the ground
    temperature_1000hPa: temp.map((t) => (t === null ? null : t - 0.6)),
    wind_speed_1000hPa: w100.map((w) => w?.speed ?? null),
    wind_direction_1000hPa: w100.map((w) => w?.direction ?? null),
    geopotential_height_1000hPa: times.map(() => s.elevation + 100),
  };
  return {
    latitude: lat,
    longitude: lon,
    elevation: s.elevation,
    timezone: timeZone,
    daily: { time: days, sunrise, sunset },
    hourly: hourly as unknown as OpenMeteoProfileResponse['hourly'],
  };
}

/**
 * Local days `from` to `to` of ERA5 as the engine's profile. Hours missing
 * what the engine reads for thermals, cloud or rain are dropped, then days
 * left with fewer than 20 hours: a day ERA5 can't say enough about isn't
 * rated. A month at a time keeps memory low: a year at once came near a
 * Worker's 128 MB.
 */
export function era5Profile(
  s: Era5Series,
  from: string,
  to: string,
  timeZone: string,
  lat: number,
  lon: number,
): AtmosphericProfile {
  const profile = profileFromOpenMeteo(era5Span(s, from, to, timeZone, lat, lon));
  return cleanProfile({
    ...profile,
    hours: profile.hours.filter(
      (h) =>
        h.surface.boundaryLayerHeight != null &&
        h.surface.cloudCover != null &&
        h.surface.precipitation != null &&
        h.surface.shortwaveRadiation != null,
    ),
  });
}
