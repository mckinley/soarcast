// Push and email alert content, built from the forecast engine's day
// verdicts so alerts say the same thing as the dashboard and site pages.

import type { AtmosphericProfile } from './weather-profile';
import type { DayScore, Site } from '@/types';
import { evaluateDays, launchProfileFromSite, verdictSummary } from './forecast-engine';
import { addDays } from './alert-schedule';

/** One day at one site, as alerts describe it. */
export interface DayAnalysis {
  date: string; // YYYY-MM-DD
  verdict: DayScore['verdict'];
  /** Quality label and score: only for alert thresholds, never shown */
  rating: DayScore['label'];
  score: number;
  bestWindow: string | null; // flyable window, e.g. "11:00-16:00"
  limitingFactor: string | null;
  concerns: string[]; // e.g., ["Wind 31 km/h (limit 25), 13:00-17:00"]
  /** A hazard inside the flyable window: overdevelopment or strong shear */
  hazard: string | null;
  highlights: string[]; // e.g., ["Thermals to about 2.4 m/s"]
  wStar: number | null;
  /** Top of lift above launch, feet */
  liftAboveLaunchFt: number | null;
  /** Plain-language verdict, as the site page words it */
  summary: string;
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

  const liftAboveLaunchFt =
    day.topOfLiftAboveLaunch && day.topOfLiftAboveLaunch > 0
      ? Math.round(day.topOfLiftAboveLaunch * FEET_PER_METER)
      : null;
  const highlights: string[] = [];
  if (day.wStar) highlights.push(`Thermals to about ${day.wStar.toFixed(1)} m/s`);
  if (liftAboveLaunchFt) {
    highlights.push(`Lift to ~${liftAboveLaunchFt.toLocaleString('en-US')}ft above launch`);
  }

  const hazard =
    day.odRisk === 'high' || day.odRisk === 'moderate'
      ? `Overdevelopment risk (${day.odRisk})`
      : day.windShear === 'high'
        ? 'High wind shear'
        : null;
  const concerns = hazard ? [hazard, ...day.reasons] : [...day.reasons];

  return {
    date: targetDate,
    verdict: day.verdict,
    rating: day.label,
    score: day.overallScore,
    bestWindow: day.flyableWindow,
    limitingFactor: day.limitingFactor,
    concerns,
    hazard,
    highlights,
    wStar: day.wStar ?? null,
    liftAboveLaunchFt,
    summary: verdictSummary(day),
  };
}

/**
 * The push alert for a flyable day at one site.
 * @param url - the site's page, e.g. /sites/tiger-mountain--<uuid>
 * @param today - the pilot's local date (YYYY-MM-DD), so "today" and "tomorrow" are theirs
 */
export function generateNotification(
  site: Site,
  analysis: DayAnalysis,
  url: string,
  today: string,
): RichNotification {
  const { date, bestWindow, highlights, concerns, verdict } = analysis;
  const when = formatDateLabel(date, today);
  const word = verdict === 'go' ? 'Flyable' : verdict === 'marginal' ? 'Marginal' : 'Not flyable';

  const parts: string[] = [];
  if (highlights.length > 0) parts.push(`${highlights.slice(0, 2).join(', ')}.`);
  const watch = verdict === 'go' ? analysis.hazard : concerns[0];
  if (watch) parts.push(`Watch for: ${watch}.`);

  return {
    title: `${site.name}: ${word} ${when}${bestWindow ? ` ${bestWindow}` : ''}`,
    body: parts.join(' ') || analysis.summary,
    url,
    siteId: site.id,
    tag: `site-${site.id}-${date}`,
    analysis,
  };
}

/** "today", "tomorrow" or a weekday, for `dateStr` relative to the pilot's `today`. */
export function formatDateLabel(dateStr: string, today: string): string {
  if (dateStr === today) return 'today';
  if (dateStr === addDays(today, 1)) return 'tomorrow';
  return new Date(`${dateStr}T12:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'long',
    timeZone: 'UTC',
  });
}

/**
 * The morning push: which of the pilot's sites are flyable today, best first.
 */
export function generateMorningDigest(
  analyses: Array<{ site: Site; analysis: DayAnalysis }>,
  targetDate: string,
): RichNotification {
  const flyable = analyses
    .filter((a) => a.analysis.verdict === 'go')
    .sort((a, b) => b.analysis.score - a.analysis.score);
  const marginal = analyses.filter((a) => a.analysis.verdict === 'marginal');

  if (flyable.length === 0) {
    return {
      title: 'Not flyable today',
      body:
        marginal.length > 0
          ? `Marginal at ${marginal
              .slice(0, 3)
              .map((m) => m.site.name)
              .join(', ')}. ${marginal[0].analysis.limitingFactor ?? ''}`.trim()
          : `None of your ${analyses.length} sites has a flyable window.`,
      url: '/dashboard',
      siteId: 'digest',
      tag: `digest-${targetDate}`,
      analysis: (marginal[0] ?? analyses[0]).analysis,
    };
  }

  const top = flyable[0];
  const parts = [
    `${top.site.name} ${top.analysis.bestWindow}${
      top.analysis.highlights[0] ? `, ${top.analysis.highlights[0].toLowerCase()}` : ''
    }.`,
  ];
  if (flyable.length > 1) {
    parts.push(
      `Also flyable: ${flyable
        .slice(1, 4)
        .map((s) => `${s.site.name} ${s.analysis.bestWindow}`)
        .join(', ')}.`,
    );
  }

  return {
    title:
      flyable.length === 1
        ? `Flyable today at ${top.site.name}`
        : `Flyable today at ${flyable.length} of your sites`,
    body: parts.join(' '),
    url: '/dashboard',
    siteId: 'digest',
    tag: `digest-${targetDate}`,
    analysis: top.analysis,
  };
}
