// Push and email alert content, built from the forecast engine's day
// verdicts so alerts say the same thing as the dashboard and site pages.
// An alert means a day is a go: flyable, with the flight the pilot's goal
// for the site asks for.

import type { AtmosphericProfile } from './weather-profile';
import type { DayScore, FlightType, Site } from '@/types';
import {
  evaluateDays,
  launchProfileFromSite,
  sledReasonText,
  verdictSummary,
} from './forecast-engine';
import { addDays } from './alert-schedule';
import {
  FLIGHT_WORD,
  compareDays,
  dayHeadline,
  dayStatus,
  flightTime,
  type DayStatus,
} from './verdict-display';

/** One day at one site, as alerts describe it. */
export interface DayAnalysis {
  date: string; // YYYY-MM-DD
  verdict: DayScore['verdict'];
  /** go when the day meets the pilot's goal for the site */
  status: DayStatus;
  /** "Go: thermals 12:00-16:00", "Flyable: sled ride 10:00-17:00", "Not flyable" */
  headline: string;
  flight: FlightType | null;
  /** When the flight works: the soaring hours, or the window for a sled ride */
  flightTime: string | null;
  limitingFactor: string | null;
  concerns: string[]; // e.g., ["Wind 31 km/h (limit 25), 13:00-17:00"]
  /** A hazard inside the flyable window: overdevelopment or strong shear */
  hazard: string | null;
  highlights: string[]; // e.g., ["Climbs about 2.4 m/s", "lift to ~4,500 ft above launch"]
  /** Plain-language verdict, as the site page words it */
  summary: string;
  /** The engine's day, for ranking */
  day: DayScore;
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

function feet(meters: number): string {
  return `~${Math.round(meters * FEET_PER_METER).toLocaleString('en-US')} ft`;
}

/** What's good about the flight, in a few words each. */
function flightHighlights(day: DayScore): string[] {
  const top = day.topOfLiftAboveLaunch;
  if (day.flight === 'thermal' || day.flight === 'xc') {
    const highlights: string[] = [];
    if (day.wStar) highlights.push(`Climbs about ${day.wStar.toFixed(1)} m/s`);
    if (top && top > 0) highlights.push(`lift to ${feet(top)} above launch`);
    return highlights;
  }
  if (day.flight === 'ridge') return [`Ridge lift ${day.flightWindow}`];
  const why = day.flight === 'sled' && day.sled ? sledReasonText(day.sled, feet) : null;
  if (why) return [`${why[0].toUpperCase()}${why.slice(1)}`];
  return [];
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
    status: dayStatus(day),
    headline: dayHeadline(day),
    flight: day.flight ?? null,
    flightTime: day.verdict === 'no' ? null : (flightTime(day) ?? null),
    limitingFactor: day.limitingFactor,
    concerns,
    hazard,
    highlights: flightHighlights(day),
    summary: verdictSummary(day),
    day,
  };
}

/** "Climbs about 2.4 m/s, lift to ~4,500 ft above launch" */
export function highlightText(analysis: DayAnalysis): string | null {
  return analysis.highlights.join(', ') || null;
}

/**
 * The push alert for a day that is a go at one site.
 * @param url - the site's page, e.g. /sites/tiger-mountain--<uuid>
 * @param today - the pilot's local date (YYYY-MM-DD), so "today" and "tomorrow" are theirs
 */
export function generateNotification(
  site: Site,
  analysis: DayAnalysis,
  url: string,
  today: string,
): RichNotification {
  const { date, flight, concerns, status } = analysis;
  const when = formatDateLabel(date, today);

  const parts: string[] = [];
  if (flight) {
    const highlights = highlightText(analysis);
    parts.push(
      `${FLIGHT_WORD[flight]} ${analysis.flightTime ?? ''}`.trim() +
        (highlights ? `, ${highlights[0].toLowerCase()}${highlights.slice(1)}.` : '.'),
    );
  }
  const watch = status === 'go' ? analysis.hazard : concerns[0];
  if (watch) parts.push(`Watch for: ${watch}.`);

  return {
    title:
      status === 'go'
        ? `${site.name}: go ${when}`
        : `${site.name} ${when}: ${analysis.headline.toLowerCase()}`,
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

/** The digest's one-line answer: "Go today at Tiger Mountain". */
export function digestTitle(statuses: Array<{ name: string; status: DayStatus }>): string {
  const go = statuses.filter((s) => s.status === 'go');
  if (go.length === 0) return 'No go today at your sites';
  if (go.length === 1) return `Go today at ${go[0].name}`;
  return `Go today at ${go.length} of your ${statuses.length} sites`;
}

/**
 * The morning push: which of the pilot's sites are a go today, best first.
 */
export function generateMorningDigest(
  analyses: Array<{ site: Site; analysis: DayAnalysis }>,
  targetDate: string,
): RichNotification {
  const ranked = [...analyses].sort((a, b) => compareDays(a.analysis.day, b.analysis.day));
  const go = ranked.filter((a) => a.analysis.status === 'go');
  const title = digestTitle(ranked.map((a) => ({ name: a.site.name, status: a.analysis.status })));

  let body: string;
  if (go.length > 0) {
    const [top, ...rest] = go;
    const highlights = highlightText(top.analysis);
    body = `${top.site.name}: ${top.analysis.headline.replace(/^Go: /, '')}${
      highlights ? `, ${highlights[0].toLowerCase()}${highlights.slice(1)}` : ''
    }.`;
    if (rest.length > 0) {
      body += ` Also a go: ${rest
        .slice(0, 3)
        .map((s) => `${s.site.name} ${s.analysis.flightTime ?? ''}`.trim())
        .join(', ')}.`;
    }
  } else {
    const flyable = ranked.filter((a) => a.analysis.verdict !== 'no');
    body =
      flyable.length > 0
        ? `${flyable
            .slice(0, 3)
            .map((a) => `${a.site.name}: ${a.analysis.headline.toLowerCase()}`)
            .join('. ')}.`
        : `None of your ${analyses.length} sites has a flyable window.`;
  }

  return {
    title,
    body,
    url: '/dashboard',
    siteId: 'digest',
    tag: `digest-${targetDate}`,
    analysis: (go[0] ?? ranked[0]).analysis,
  };
}
