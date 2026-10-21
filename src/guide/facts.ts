// Numbers the Guide states, taken from the code that uses them, so a page
// can't drift from what the app does. A page writes {{name}}; the Guide
// test checks every placeholder is here and every fact here is used.

import { CACHE_DURATION_HOURS, PROFILE_DAYS } from '@/lib/weather-profile';
import { SHOWER_MM, TROPICS_LATITUDE } from '@/lib/forecast-engine/gates';
import {
  STATION_RADIUS_KM,
  TRACK_RECORD_DAYS,
  TRACK_RECORD_MAX_AGE_DAYS,
} from '@/lib/track-record';
import { SEASON_MONTHS } from '@/lib/seasons';
import { AREA_RADIUS_KM } from '@/lib/destinations';
import { SITE_REFRESH_DAYS } from '@/lib/launch-sites';
import { COMP_RADIUS_KM } from '@/lib/comps';

export const GUIDE_FACTS: Record<string, string | number> = {
  forecastDays: PROFILE_DAYS,
  forecastRefreshHours: CACHE_DURATION_HOURS,
  tropicsLatitude: TROPICS_LATITUDE,
  showerMm: SHOWER_MM,
  trackRecordRadiusKm: STATION_RADIUS_KM,
  trackRecordDays: TRACK_RECORD_DAYS,
  trackRecordRebuildDays: TRACK_RECORD_MAX_AGE_DAYS,
  seasonMonths: SEASON_MONTHS,
  areaRadiusKm: AREA_RADIUS_KM,
  siteRefreshDays: SITE_REFRESH_DAYS,
  compRadiusKm: COMP_RADIUS_KM,
};
