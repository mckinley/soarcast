// Core data types for SoarCast

/** What flying a launch can give: thermals, ridge lift, both, or only a glide down. */
export type SiteKind = 'thermal' | 'ridge' | 'both' | 'sled';

/** What a pilot wants from a site before a day counts as worth going. */
export type SiteGoal = 'launch' | 'soar' | 'great';

/** The kind of flight a day gives, worst to best. */
export type FlightType = 'sled' | 'ridge' | 'thermal' | 'xc';

/**
 * Why a flyable day is only a sled ride: the site never soars, a ridge site
 * lacks wind onto it, or thermals are too weak, too low or too short-lived.
 */
export type SledReason = 'sled-site' | 'ridge-wind' | 'weak' | 'below-launch' | 'low' | 'short';

export interface Site {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  elevation: number; // meters
  idealWindDirections: number[]; // degrees, e.g., [180, 225, 270]
  okWindDirections?: number[]; // degrees the launch works in, but not ideally
  maxWindSpeed: number; // km/h
  /** What the launch can give; null or absent when nobody has said */
  kind?: SiteKind | null;
  /** What the pilot wants from it; absent uses the default for its kind */
  goal?: SiteGoal;
  notes?: string;
  createdAt: string;
  updatedAt: string;
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
  /** The launch check behind limitingFactor: 'wind', 'rain', 'direction', ... */
  limitingGate?: string | null;
  /** Every failed or marginal launch check with its time span, worst first */
  reasons: string[];
  wStar?: number | null; // Peak W* in m/s during the window
  bestWindow?: string; // same as flyableWindow, kept for existing consumers
  odRisk?: 'none' | 'low' | 'moderate' | 'high';
  windShear?: 'none' | 'low' | 'moderate' | 'high';
  freezingConcern?: boolean;
  peakCeilingMsl?: number | null; // meters MSL
  topOfLiftAboveLaunch?: number | null; // meters
  /** The best flight the window gives at this site; null when not flyable */
  flight?: FlightType | null;
  /** When that flight works, e.g. "12:00-16:00": the soaring hours inside the window */
  flightWindow?: string | null;
  /** On a sled-ride day, why it doesn't soar, and how high climbable thermals reach (m above launch) */
  sled?: { reason: SledReason; liftAboveLaunch: number | null } | null;
  /** XC conditions, or a long ridge day at a ridge site */
  greatDay?: boolean;
  /** Whether the day is a go for the pilot's goal at this site */
  goalMet?: boolean;
  /** Where model rain is little trusted (the tropics), the forecast rain that was set aside, in words */
  rainNote?: string | null;
  /** Unstable air the storm check let pass because no showers were forecast near it, in words */
  stormNote?: string | null;
}

export interface Settings {
  notifications: {
    enabled: boolean;
    daysAhead: number; // default 2
    sitePreferences: Record<string, boolean>; // siteId -> enabled
  };
  emailDigest: {
    enabled: boolean; // morning email digest toggle
    digestTime: string; // HH:MM format, default '08:00'
  };
  /** Show the experiments on site pages (the Guide's Experiments page) */
  experiments: boolean;
  updatedAt: string;
}
