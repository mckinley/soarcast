// Core data types for SoarCast

export interface Site {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  elevation: number; // meters
  idealWindDirections: number[]; // degrees, e.g., [180, 225, 270]
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
  overallScore: number; // 0-100
  label: 'Poor' | 'Fair' | 'Good' | 'Great' | 'Epic';
  factors: {
    cape: number; // 0-100
    windSpeed: number; // 0-100
    windDirection: number; // 0-100
    cloudCover: number; // 0-100
    precipitation: number; // 0-100
    blh: number; // 0-100 (boundary layer height)
    upperWind: number; // 0-100 (850hPa wind)
  };
  // v2 fields (optional for backward compat)
  wStar?: number | null; // Peak W* in m/s during flyable window
  bestWindow?: string; // e.g. "12:00-16:00"
  odRisk?: 'none' | 'low' | 'moderate' | 'high';
  windShear?: 'none' | 'low' | 'moderate' | 'high';
  freezingConcern?: boolean;
  peakCeilingMsl?: number | null; // meters MSL
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
