// Numbers the Guide states, taken from the code that uses them, so a page
// can't drift from what the app does. A page writes {{name}}; the Guide
// test checks every placeholder is here and every fact here is used.

import { CACHE_DURATION_HOURS, CLOUD_BASE_M_PER_DEGREE, PROFILE_DAYS } from '@/lib/weather-profile';
import {
  CLOUD_CLEARANCE_M,
  FOG_VISIBILITY_M,
  GUST_OVER_LIMIT_KMH,
  GUST_SPREAD_FAIL_KMH,
  GUST_SPREAD_MARGINAL_KMH,
  HAZE_VISIBILITY_M,
  LIGHT_CROSS_KMH,
  LOW_CLOUD_COVER,
  NIL_WIND_KMH,
  RAIN_FAIL_CHANCE,
  RAIN_FAIL_MM,
  RAIN_MARGINAL_CHANCE,
  RAIN_SOON_HOURS,
  SECTOR_HALF_WIDTH,
  SHOWER_MM,
  THERMAL_MIN_WSTAR,
  TROPICS_LATITUDE,
  WIND_NEAR_LIMIT,
} from '@/lib/forecast-engine/gates';
import {
  GREAT_RIDGE_HOURS,
  MIN_WINDOW_HOURS,
  RIDGE_MIN_KMH,
  SOAR_MIN_HEIGHT,
  SOAR_MIN_HOURS,
  XC_MIN_HEIGHT,
  XC_MIN_HOURS,
  XC_MIN_WSTAR,
} from '@/lib/forecast-engine/evaluate';
import { DEFAULT_MAX_WIND_KMH } from '@/lib/forecast-engine';
import {
  GUST_FADE_FULL_M,
  GUST_FADE_SHARE,
  GUST_FADE_START_M,
  TERRAIN_LIFT_SHARE,
} from '@/lib/forecast-engine/launch-conditions';
import {
  STATION_RADIUS_KM,
  TRACK_RECORD_DAYS,
  TRACK_RECORD_MAX_AGE_DAYS,
} from '@/lib/track-record';
import { SEASON_MONTHS, SEASON_YEARS } from '@/lib/seasons';
import { FLOWN_RADIUS_KM, FLOWN_REFRESH_HOURS } from '@/lib/flown-days';
import { UP_NOW_AIR_KM } from '@/lib/up-now';
import { AREA_RADIUS_KM } from '@/lib/destinations';
import { AREA_JOIN_KM } from '@/lib/site-areas';
import { SITE_REFRESH_DAYS } from '@/lib/launch-sites';
import { COMP_RADIUS_KM } from '@/lib/comps';
import { NOGA_MIN_POINTS, NOGA_NEAR_KM } from '@/lib/noga';
import { CALM_KMH, MIN_WIND_FLOWN_DAYS } from '@/lib/flown-winds';
import { ENSEMBLE_DAYS, ENSEMBLE_GRID_KM, ENSEMBLE_RUNS } from '@/lib/ensembles';
import { LAPSE_BANDS } from '@/components/windgram/lapse-rate-utils';
import {
  BARB_FLAG_KMH,
  BARB_LONG_KMH,
  BARB_SHORT_KMH,
} from '@/components/windgram/wind-barb-utils';
import { ISOTHERM_STEP_C, MODEL_CLOUD_PERCENT } from '@/components/windgram/windgram-data';

const meters = (m: number) => m.toLocaleString('en-US');
/** Where each windgram color starts, °C of cooling per 1000 ft: grey, blue, tan, lavender ... red. */
const lapseStart = LAPSE_BANDS.map((band) => band.min);

export const GUIDE_FACTS: Record<string, string | number> = {
  forecastDays: PROFILE_DAYS,
  forecastRefreshHours: CACHE_DURATION_HOURS,
  tropicsLatitude: TROPICS_LATITUDE,
  showerMm: SHOWER_MM,
  trackRecordRadiusKm: STATION_RADIUS_KM,
  trackRecordDays: TRACK_RECORD_DAYS,
  trackRecordRebuildDays: TRACK_RECORD_MAX_AGE_DAYS,
  seasonMonths: SEASON_MONTHS,
  seasonYears: SEASON_YEARS,
  areaRadiusKm: AREA_RADIUS_KM,
  areaJoinKm: AREA_JOIN_KM,
  flownRadiusKm: FLOWN_RADIUS_KM,
  calmKmh: CALM_KMH,
  minWindFlownDays: MIN_WIND_FLOWN_DAYS,
  ensembleRuns: ENSEMBLE_RUNS,
  ensembleDays: ENSEMBLE_DAYS,
  ensembleGridKm: ENSEMBLE_GRID_KM,
  flownRefreshHours: FLOWN_REFRESH_HOURS,
  upNowAirKm: UP_NOW_AIR_KM,
  siteRefreshDays: SITE_REFRESH_DAYS,
  compRadiusKm: COMP_RADIUS_KM,
  nogaNearKm: NOGA_NEAR_KM,
  nogaMinPoints: NOGA_MIN_POINTS,

  // How a day is rated
  windowHours: MIN_WINDOW_HOURS,
  defaultWindLimitKmh: DEFAULT_MAX_WIND_KMH,
  windNearLimitPercent: Math.round(WIND_NEAR_LIMIT * 100),
  gustOverLimitKmh: GUST_OVER_LIMIT_KMH,
  gustSpreadFailKmh: GUST_SPREAD_FAIL_KMH,
  gustSpreadMarginalKmh: GUST_SPREAD_MARGINAL_KMH,
  sectorDegrees: SECTOR_HALF_WIDTH,
  crossDegrees: 2 * SECTOR_HALF_WIDTH,
  nilWindKmh: NIL_WIND_KMH,
  lightCrossKmh: LIGHT_CROSS_KMH,
  rainSoonHours: RAIN_SOON_HOURS,
  rainFailMm: RAIN_FAIL_MM,
  rainFailChance: RAIN_FAIL_CHANCE,
  rainMarginalChance: RAIN_MARGINAL_CHANCE,
  cloudClearanceM: CLOUD_CLEARANCE_M,
  lowCloudPercent: LOW_CLOUD_COVER,
  cloudBasePerDegreeM: CLOUD_BASE_M_PER_DEGREE,
  fogKm: FOG_VISIBILITY_M / 1000,
  hazeKm: HAZE_VISIBILITY_M / 1000,
  thermalClimbMs: THERMAL_MIN_WSTAR.toFixed(1),
  soarHeightM: meters(SOAR_MIN_HEIGHT),
  terrainLiftPercent: Math.round(TERRAIN_LIFT_SHARE * 100),
  gustFadeStartM: GUST_FADE_START_M,
  gustFadeFullM: GUST_FADE_FULL_M,
  gustFadeSharePercent: Math.round(GUST_FADE_SHARE * 100),
  soarHours: SOAR_MIN_HOURS,
  xcClimbMs: XC_MIN_WSTAR.toFixed(1),
  xcHeightM: meters(XC_MIN_HEIGHT),
  xcHours: XC_MIN_HOURS,
  ridgeWindKmh: RIDGE_MIN_KMH,
  greatRidgeHours: GREAT_RIDGE_HOURS,

  // Reading the windgram
  lapseBlueC: lapseStart[2],
  lapseTanC: lapseStart[3],
  lapseGoodC: lapseStart[4],
  lapseRedC: lapseStart[7],
  barbFlagKmh: BARB_FLAG_KMH,
  barbLongKmh: BARB_LONG_KMH,
  barbShortKmh: BARB_SHORT_KMH,
  barbExampleKmh: 2 * BARB_LONG_KMH + BARB_SHORT_KMH,
  isothermStepC: ISOTHERM_STEP_C,
  modelCloudPercent: MODEL_CLOUD_PERCENT,
};
