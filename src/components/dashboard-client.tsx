'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { ScoreCell } from '@/components/score-cell';
import { ScoreDetailDialog } from '@/components/score-detail-dialog';
import { SiteCard } from '@/components/dashboard/site-card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { SiteForecastData } from '@/app/actions';
import type { DayScore, Site, Forecast, Settings } from '@/types';
import { RefreshCw, LayoutGrid, Table } from 'lucide-react';
import Link from 'next/link';

interface DashboardClientProps {
  data: SiteForecastData[];
  settings: Settings;
  refreshAction: () => Promise<{ success: boolean; message: string }>;
  isAuthenticated: boolean;
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
          Get started by adding your flying sites to see 7-day XC soaring forecasts.
        </p>
        <Link href="/sites">
          <Button size="lg">Add Your First Site</Button>
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

  return (
    <div className="space-y-4">
      {/* Unauthenticated User Banner */}
      {!isAuthenticated && (
        <div className="p-6 border border-primary/30 bg-primary/5 rounded-lg">
          <h2 className="text-xl font-semibold mb-2">Welcome to SoarCast</h2>
          <p className="text-muted-foreground mb-4">
            You&apos;re viewing demo sites with live weather data. Sign in to add your own flying
            sites and customize your XC soaring forecasts.
          </p>
          <Link href="/auth/signin">
            <Button size="lg">Sign In to Add Your Sites</Button>
          </Link>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">7-Day XC Forecast</h1>
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
            {data.map(({ site, scores }) => (
              <SiteCard key={site.id} site={site} scores={scores} />
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
