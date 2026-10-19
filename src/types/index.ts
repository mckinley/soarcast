// Core data types for SoarCast

export interface Site {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  elevation: number; // meters
  idealWindDirections: number[]; // degrees, e.g., [180, 225, 270]
  okWindDirections?: number[]; // degrees the launch works in, but not ideally
  maxWindSpeed: number; // km/h
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Forecast {
  siteId: string;
  fetchedAt: string;
  expiresAt: string;
  modelElevation: number;
  sunrise: string;
  sunset: string;
  sunriseByDay: Record<string, string>; // date (YYYY-MM-DD) -> ISO time string
  sunsetByDay: Record<string, string>; // date (YYYY-MM-DD) -> ISO time string
  hourly: {
    time: string[];
    temperature_2m: number[];
    wind_speed_10m: number[];
    wind_direction_10m: number[];
    wind_gusts_10m: number[];
    cloud_cover: number[];
    cape: number[];
    precipitation_probability: number[];
    pressure_msl: number[];
    // Upper-air parameters for XC assessment
    boundary_layer_height: (number | null)[];
    wind_speed_850hPa: (number | null)[];
    wind_direction_850hPa: (number | null)[];
    convective_inhibition: (number | null)[];
  };
}

export interface DayScore {
  date: string; // YYYY-MM-DD
  overallScore: number; // 0-100; under 31 means no flyable window
  label: 'Poor' | 'Fair' | 'Good' | 'Great' | 'Epic';
  /** go: a window of 2+ hours where every launch check passes; marginal: only with caveats; no: not flyable */
  verdict: 'go' | 'marginal' | 'no';
  flyableWindow: string | null; // e.g. "11:00-16:00"
  /** The main thing holding the day back, in plain words */
  limitingFactor: string | null;
  /** Every failed or marginal launch check with its time span, worst first */
  reasons: string[];
  wStar?: number | null; // Peak W* in m/s during the window
  bestWindow?: string; // same as flyableWindow, kept for existing consumers
  odRisk?: 'none' | 'low' | 'moderate' | 'high';
  windShear?: 'none' | 'low' | 'moderate' | 'high';
  freezingConcern?: boolean;
  peakCeilingMsl?: number | null; // meters MSL
  topOfLiftAboveLaunch?: number | null; // meters
}

export interface Settings {
  notifications: {
    enabled: boolean;
    minScoreThreshold: number; // default 70
    daysAhead: number; // default 2
    sitePreferences: Record<string, boolean>; // siteId -> enabled
    siteMinRatings: Record<string, 'Good' | 'Great' | 'Epic' | undefined>; // siteId -> minRating
  };
  emailDigest: {
    enabled: boolean; // morning email digest toggle
    digestTime: string; // HH:MM format, default '08:00'
  };
  updatedAt: string;
}

export interface SitesData {
  sites: Site[];
}

export interface ForecastsData {
  forecasts: Record<string, Forecast>; // key: `${siteId}_${date}`
}

export interface SettingsData {
  settings: Settings;
}
