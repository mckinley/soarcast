// Push and email alert content, built from the forecast engine's day
// verdicts so alerts say the same thing as the dashboard and site pages.

import type { AtmosphericProfile } from './weather-profile';
import type { Site } from '@/types';
import { evaluateDays, launchProfileFromSite } from './forecast-engine';

/**
 * Analyzes a single day's atmospheric conditions and generates a plain-language notification
 */
export interface DayAnalysis {
  date: string; // YYYY-MM-DD
  rating: 'Poor' | 'Fair' | 'Good' | 'Great' | 'Epic';
  score: number; // 0-100
  bestWindow: string | null; // flyable window, e.g. "11:00-16:00"
  concerns: string[]; // e.g., ["Wind 31 km/h (limit 25), 13:00-17:00"]
  highlights: string[]; // e.g., ["Thermals to about 2.4 m/s"]
  thermalStrength: string | null; // e.g., "moderate" | "strong" | "weak"
  cloudBase: string | null; // e.g., "~5000ft AGL"
  topOfLift: string | null; // e.g., "~8000ft MSL"
}

/**
 * Rich notification payload with atmospheric analysis
 */
export interface RichNotification {
  title: string;
  body: string;
  url: string;
  siteId: string;
  tag: string;
  analysis: DayAnalysis;
}

const FEET_PER_METER = 3.28084;

function classifyThermalStrength(wStar: number | null | undefined): string | null {
  if (wStar == null || wStar <= 0) return null;
  if (wStar < 1) return 'weak';
  if (wStar < 2) return 'moderate';
  return 'strong';
}

/**
 * Summarizes one day at a site for an alert, from the forecast engine's verdict.
 */
export function analyzeFlyingDay(
  profile: AtmosphericProfile,
  site: Site,
  targetDate: string, // YYYY-MM-DD
): DayAnalysis | null {
  const day = evaluateDays(profile, launchProfileFromSite(site)).find((d) => d.date === targetDate);
  if (!day) return null;

  const highlights: string[] = [];
  if (day.wStar) highlights.push(`Thermals to about ${day.wStar.toFixed(1)} m/s`);
  if (day.topOfLiftAboveLaunch && day.topOfLiftAboveLaunch > 0) {
    highlights.push(
      `Lift to ~${Math.round(day.topOfLiftAboveLaunch * FEET_PER_METER).toLocaleString('en-US')}ft above launch`,
    );
  }

  const concerns = [...day.reasons];
  if (day.odRisk === 'high' || day.odRisk === 'moderate') {
    concerns.unshift(`Overdevelopment risk (${day.odRisk})`);
  }
  if (day.windShear === 'high') concerns.push('High wind shear');

  return {
    date: targetDate,
    rating: day.label,
    score: day.overallScore,
    bestWindow: day.flyableWindow,
    concerns,
    highlights,
    thermalStrength: classifyThermalStrength(day.wStar),
    cloudBase: null,
    topOfLift: day.peakCeilingMsl
      ? `~${Math.round(day.peakCeilingMsl * FEET_PER_METER).toLocaleString('en-US')}ft MSL`
      : null,
  };
}

/**
 * Generates a plain-language notification from day analysis
 */
export function generateNotification(site: Site, analysis: DayAnalysis): RichNotification {
  const { rating, date, bestWindow, highlights, concerns } = analysis;

  // Format date as "tomorrow" or "Wednesday"
  const dateLabel = formatDateLabel(date);

  // Build title
  const title = `${rating} Flying Day: ${site.name}`;

  // Build body with key information
  const parts: string[] = [];

  // Add date and rating
  parts.push(`${site.name} looks ${rating} ${dateLabel}!`);

  // Add best window if available
  if (bestWindow) {
    parts.push(`Flyable ${bestWindow}.`);
  }

  // Add top highlights (max 2)
  const topHighlights = highlights.slice(0, 2);
  if (topHighlights.length > 0) {
    parts.push(topHighlights.join(', ') + '.');
  }

  // Add key concerns (max 1)
  if (concerns.length > 0) {
    parts.push(`⚠️ ${concerns[0]}.`);
  }

  // Add cloud base if available
  if (analysis.cloudBase) {
    parts.push(`Cloud base ${analysis.cloudBase}.`);
  }

  const body = parts.join(' ');

  return {
    title,
    body,
    url: `/sites/${site.id}`,
    siteId: site.id,
    tag: `site-${site.id}-${date}`,
    analysis,
  };
}

/**
 * Formats date as "tomorrow", "today", or day name
 */
function formatDateLabel(dateStr: string): string {
  const target = new Date(dateStr + 'T12:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const targetTime = target.getTime();
  const todayTime = today.getTime();
  const tomorrowTime = tomorrow.getTime();

  if (targetTime === todayTime) {
    return 'today';
  } else if (targetTime === tomorrowTime) {
    return 'tomorrow';
  } else {
    // Return day name (e.g., "Wednesday")
    return target.toLocaleDateString('en-US', { weekday: 'long' });
  }
}

/**
 * Generates a morning digest notification summarizing all favorited sites
 */
export function generateMorningDigest(
  analyses: Array<{ site: Site; analysis: DayAnalysis }>,
  targetDate: string,
): RichNotification {
  // Filter to sites with Good or better rating
  const goodSites = analyses.filter((a) => ['Good', 'Great', 'Epic'].includes(a.analysis.rating));

  // Sort by score (best first)
  goodSites.sort((a, b) => b.analysis.score - a.analysis.score);

  const dateLabel = formatDateLabel(targetDate);

  if (goodSites.length === 0) {
    return {
      title: 'Daily Flying Forecast',
      body: `No great flying conditions ${dateLabel}. Check individual sites for details.`,
      url: '/dashboard',
      siteId: 'digest',
      tag: `digest-${targetDate}`,
      analysis: {
        date: targetDate,
        rating: 'Poor',
        score: 0,
        bestWindow: null,
        concerns: [],
        highlights: [],
        thermalStrength: null,
        cloudBase: null,
        topOfLift: null,
      },
    };
  }

  // Build summary
  const topSite = goodSites[0];
  const title =
    goodSites.length === 1
      ? `${topSite.analysis.rating} Flying ${dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1)}`
      : `${goodSites.length} Sites Look Good ${dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1)}`;

  const parts: string[] = [];

  // Add top site summary
  parts.push(`${topSite.site.name}: ${topSite.analysis.rating} (${topSite.analysis.score}/100).`);

  if (topSite.analysis.bestWindow) {
    parts.push(`Flyable ${topSite.analysis.bestWindow}.`);
  }

  // Add top highlights from the best site
  if (topSite.analysis.highlights.length > 0) {
    parts.push(topSite.analysis.highlights[0] + '.');
  }

  // Mention other good sites
  if (goodSites.length > 1) {
    const otherSites = goodSites.slice(1, 3).map((s) => s.site.name);
    parts.push(`Also good: ${otherSites.join(', ')}.`);
  }

  const body = parts.join(' ');

  return {
    title,
    body,
    url: '/dashboard',
    siteId: 'digest',
    tag: `digest-${targetDate}`,
    analysis: topSite.analysis,
  };
}
