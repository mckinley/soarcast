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
  };
}

export interface Settings {
  notifications: {
    enabled: boolean;
    minScoreThreshold: number; // default 70
    daysAhead: number; // default 2
    sitePreferences: Record<string, boolean>; // siteId -> enabled
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
