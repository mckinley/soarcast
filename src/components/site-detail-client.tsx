'use client';

import { Card } from '@/components/ui/card';
import { WindgramSection } from '@/components/windgram-section';
import { verdictSummary } from '@/lib/forecast-engine';
import { VERDICT_BADGE, VERDICT_WORD } from '@/lib/verdict-display';
import type { Site, DayScore } from '@/types';

interface SiteDetailClientProps {
  site: Site;
  scores: DayScore[];
  /** Today's date where the site is (YYYY-MM-DD) */
  today: string;
}

/** Shown when Open-Meteo can't be reached and nothing is cached. */
export function ForecastUnavailable() {
  return (
    <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-4 text-amber-900 dark:text-amber-200">
      <p className="font-medium">Forecast unavailable right now</p>
      <p className="text-sm">The forecast service is busy. Reload the page in a minute.</p>
    </div>
  );
}

export function SiteDetailClient({ site, scores, today }: SiteDetailClientProps) {
  const todayScore = scores.find((s) => s.date === today) ?? scores[0];

  return (
    <div className="space-y-6">
      {todayScore && (
        <Card className="p-4">
          <div className="flex items-center gap-4 flex-wrap">
            <span
              className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ${VERDICT_BADGE[todayScore.verdict]}`}
            >
              {todayScore.date === today ? 'Today: ' : ''}
              {VERDICT_WORD[todayScore.verdict]}
            </span>
            <p className="text-sm text-muted-foreground flex-1 min-w-0">
              {verdictSummary(todayScore)}
            </p>
          </div>
        </Card>
      )}

      <WindgramSection
        latitude={site.latitude}
        longitude={site.longitude}
        scores={scores}
        today={today}
        days={7}
        launchElevation={site.elevation > 0 ? site.elevation : undefined}
      />
    </div>
  );
}
