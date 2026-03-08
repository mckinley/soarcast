'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { ScoreCell } from '@/components/score-cell';
import { ScoreDetailDialog } from '@/components/score-detail-dialog';
import { SiteCard } from '@/components/dashboard/site-card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { SiteForecastData } from '@/app/dashboard/actions';
import type { DayScore, Site, Forecast, Settings } from '@/types';
import { RefreshCw, LayoutGrid, Table } from 'lucide-react';
import Link from 'next/link';

interface DashboardClientProps {
  data: SiteForecastData[];
  settings: Settings;
  refreshAction: () => Promise<{ success: boolean; message: string }>;
  isAuthenticated: boolean; // Always true since dashboard requires auth
}

export function DashboardClient({
  data,
  settings,
  refreshAction,
  isAuthenticated,
}: DashboardClientProps) {
  const [isPending, startTransition] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedScore, setSelectedScore] = useState<DayScore | null>(null);
  const [selectedSite, setSelectedSite] = useState<Site | null>(null);
  const [selectedForecast, setSelectedForecast] = useState<Forecast | null>(null);

  const handleRefresh = () => {
    startTransition(async () => {
      const result = await refreshAction();
      if (result.success) {
        console.log(result.message);
      } else {
        console.error(result.message);
      }
    });
  };

  const handleCellClick = (score: DayScore, site: Site, forecast: Forecast) => {
    setSelectedScore(score);
    setSelectedSite(site);
    setSelectedForecast(forecast);
    setDialogOpen(true);
  };

  // Empty state when authenticated user has no sites
  if (data.length === 0 && isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <h1 className="text-3xl font-bold mb-4">Welcome to SoarCast</h1>
        <p className="text-muted-foreground mb-6 text-center max-w-md">
          No sites yet. Browse launch sites to find your home site.
        </p>
        <Link href="/sites/browse">
          <Button size="lg">Browse Launch Sites</Button>
        </Link>
      </div>
    );
  }

  // Generate next 7 days
  const today = new Date();
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    dates.push(date.toISOString().split('T')[0] || '');
  }

  // Format date for display
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T12:00:00'); // Add time to avoid timezone issues
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const todayStr = today.toISOString().split('T')[0];
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    if (dateStr === todayStr) return 'Today';
    if (dateStr === tomorrowStr) return 'Tomorrow';

    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  // Determine if a notification indicator should be shown for a given score/site/date
  const shouldShowNotification = (
    score: DayScore | null,
    siteId: string,
    dayIndex: number,
  ): boolean => {
    if (!score) return false;

    // Check if site notifications are enabled (default to true if not set)
    const siteNotificationsEnabled = settings.notifications.sitePreferences[siteId] ?? true;
    if (!siteNotificationsEnabled) return false;

    // Check if day is within notification window (daysAhead)
    if (dayIndex >= settings.notifications.daysAhead) return false;

    // Check if score meets threshold
    return score.overallScore >= settings.notifications.minScoreThreshold;
  };

  // Find today's best site (highest score)
  const todayDate = dates[0];
  const bestSiteToday = data.length >= 2
    ? data.reduce<{ siteData: SiteForecastData; score: DayScore; siteType: string; slug?: string } | null>(
        (best, item) => {
          const todayScore = item.scores.find((s) => s.date === todayDate);
          if (!todayScore) return best;
          if (!best || todayScore.overallScore > best.score.overallScore) {
            return { siteData: item, score: todayScore, siteType: item.siteType, slug: item.slug };
          }
          return best;
        },
        null,
      )
    : null;

  return (
    <div className="space-y-4">
      {/* Today's Best banner */}
      {bestSiteToday && bestSiteToday.score.overallScore >= 31 && (
        <div className="rounded-lg bg-gradient-to-r from-sky-100 to-blue-50 dark:from-sky-900/30 dark:to-blue-900/20 p-4 border border-sky-200 dark:border-sky-800">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs font-semibold uppercase tracking-wider text-sky-600 dark:text-sky-400">
              Today&apos;s Best
            </span>
            <Link
              href={
                bestSiteToday.siteType === 'launch' && bestSiteToday.slug
                  ? `/sites/${bestSiteToday.slug}`
                  : `/sites/custom/${bestSiteToday.siteData.site.id}`
              }
              className="font-semibold text-foreground hover:underline"
            >
              {bestSiteToday.siteData.site.name}
            </Link>
            <span
              className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                bestSiteToday.score.overallScore >= 86
                  ? 'bg-green-500/20 text-green-700 dark:text-green-400'
                  : bestSiteToday.score.overallScore >= 71
                    ? 'bg-lime-500/20 text-lime-700 dark:text-lime-400'
                    : bestSiteToday.score.overallScore >= 51
                      ? 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400'
                      : 'bg-orange-500/20 text-orange-700 dark:text-orange-400'
              }`}
            >
              {bestSiteToday.score.overallScore} {bestSiteToday.score.label}
            </span>
            {bestSiteToday.score.wStar != null && bestSiteToday.score.wStar > 0 && (
              <span className="text-xs text-muted-foreground">
                W* {bestSiteToday.score.wStar.toFixed(1)} m/s
              </span>
            )}
            {bestSiteToday.score.bestWindow && (
              <span className="text-xs text-muted-foreground">
                {bestSiteToday.score.bestWindow}
              </span>
            )}
            {bestSiteToday.score.odRisk && bestSiteToday.score.odRisk !== 'none' && (
              <span className="text-xs text-orange-600 dark:text-orange-400">
                OD: {bestSiteToday.score.odRisk}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">7-Day Flying Forecast</h1>
          <p className="text-muted-foreground mt-1">
            Click any card to see detailed windgram and hourly data
          </p>
        </div>
        <Button onClick={handleRefresh} disabled={isPending} size="lg">
          <RefreshCw className={`mr-2 h-4 w-4 ${isPending ? 'animate-spin' : ''}`} />
          {isPending ? 'Refreshing...' : 'Refresh All'}
        </Button>
      </div>

      {/* Tabbed View: Cards (default) vs Table */}
      <Tabs defaultValue="cards" className="w-full">
        <TabsList>
          <TabsTrigger value="cards">
            <LayoutGrid className="mr-2 h-4 w-4" />
            Cards
          </TabsTrigger>
          <TabsTrigger value="table">
            <Table className="mr-2 h-4 w-4" />
            Table
          </TabsTrigger>
        </TabsList>

        {/* Card View */}
        <TabsContent value="cards" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.map(({ site, scores, siteType, slug }) => (
              <SiteCard key={site.id} site={site} scores={scores} siteType={siteType} slug={slug} />
            ))}
          </div>
        </TabsContent>

        {/* Table View */}
        <TabsContent value="table" className="mt-4">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b">
                  <th className="py-3 px-4 text-left font-semibold min-w-[160px] sticky left-0 bg-background z-10">
                    Site
                  </th>
                  {dates.map((date) => (
                    <th key={date} className="py-3 px-2 text-center font-semibold min-w-[100px]">
                      <div className="text-sm">{formatDate(date)}</div>
                      <div className="text-xs text-muted-foreground font-normal">
                        {date.substring(5)}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map(({ site, forecast, scores }) => (
                  <tr key={site.id} className="border-b hover:bg-muted/30 transition-colors">
                    <td className="py-2 px-4 font-medium sticky left-0 bg-background z-10">
                      <div>
                        <div className="font-semibold">{site.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {site.elevation}m • {site.maxWindSpeed}km/h max
                        </div>
                      </div>
                    </td>
                    {dates.map((date, dateIndex) => {
                      const score = scores.find((s) => s.date === date) || null;
                      const showNotification = shouldShowNotification(score, site.id, dateIndex);
                      return (
                        <td key={date} className="py-2 px-2">
                          <ScoreCell
                            score={score}
                            showNotification={showNotification}
                            wStar={score?.wStar}
                            onClick={
                              score && forecast
                                ? () => handleCellClick(score, site, forecast)
                                : undefined
                            }
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>

      {/* Error Messages */}
      {data.some((d) => d.error) && (
        <div className="mt-4 p-4 border border-destructive/50 bg-destructive/10 rounded-lg">
          <h3 className="font-semibold text-destructive mb-2">Errors fetching forecasts:</h3>
          <ul className="space-y-1 text-sm">
            {data
              .filter((d) => d.error)
              .map((d) => (
                <li key={d.site.id} className="text-destructive">
                  <span className="font-medium">{d.site.name}:</span> {d.error}
                </li>
              ))}
          </ul>
        </div>
      )}

      {/* Score Detail Dialog */}
      <ScoreDetailDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        score={selectedScore}
        site={selectedSite}
        forecast={selectedForecast}
      />
    </div>
  );
}
