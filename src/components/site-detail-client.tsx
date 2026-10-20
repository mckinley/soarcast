'use client';

import { Card } from '@/components/ui/card';
import { WindgramSection } from '@/components/windgram-section';
import { verdictSummary } from '@/lib/forecast-engine';
import { STATUS_BADGE, STATUS_WORD, dayStatus } from '@/lib/verdict-display';
import { SiteGoalLine, type GoalTarget } from '@/components/site-goal-picker';
import { defaultGoal } from '@/lib/site-goals';
import type { Site, DayScore } from '@/types';

interface SiteDetailClientProps {
  site: Site;
  scores: DayScore[];
  /** Today's date where the site is (YYYY-MM-DD) */
  today: string;
  /** Set when the pilot follows or owns the site, so they can change its goal */
  goalTarget?: GoalTarget;
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

export function SiteDetailClient({ site, scores, today, goalTarget }: SiteDetailClientProps) {
  const todayScore = scores.find((s) => s.date === today) ?? scores[0];
  const goal = site.goal ?? defaultGoal(site.kind);

  return (
    <div className="space-y-6">
      {todayScore && (
        <Card className="gap-3 p-4">
          <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-4">
            <span
              className={`inline-flex shrink-0 items-center rounded-full px-3 py-1 text-sm font-semibold ${STATUS_BADGE[dayStatus(todayScore)]}`}
            >
              {todayScore.date === today ? 'Today: ' : ''}
              {STATUS_WORD[dayStatus(todayScore)]}
            </span>
            <p className="text-sm text-muted-foreground sm:flex-1 sm:min-w-0">
              {verdictSummary(todayScore)}
            </p>
          </div>
          <SiteGoalLine target={goalTarget} goal={goal} />
        </Card>
      )}

      <WindgramSection
        latitude={site.latitude}
        longitude={site.longitude}
        scores={scores}
        today={today}
        days={7}
        launchElevation={site.elevation > 0 ? site.elevation : undefined}
        maxWindSpeed={site.maxWindSpeed}
      />
    </div>
  );
}
