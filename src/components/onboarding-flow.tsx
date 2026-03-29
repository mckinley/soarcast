'use client';

import { useState } from 'react';
import { useNavigate, useFetcher } from 'react-router';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { X, ArrowRight, Loader2, MapPin } from 'lucide-react';

interface OnboardingFlowProps {
  popularSites?: Array<{
    id: string;
    name: string;
    slug: string;
    region: string | null;
    elevation: number | null;
  }>;
}

export function OnboardingFlow({ popularSites }: OnboardingFlowProps) {
  const navigate = useNavigate();
  const fetcher = useFetcher();
  const [isDismissing, setIsDismissing] = useState(false);

  const handleDismiss = () => {
    setIsDismissing(true);
    fetcher.submit({ intent: 'completeOnboarding' }, { method: 'POST' });
  };

  const handleBrowseSites = () => {
    navigate('/sites/browse');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <Card className="w-full max-w-lg shadow-lg">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <CardTitle>Welcome to SoarCast! 🪂</CardTitle>
              <CardDescription>Find your home site to start tracking conditions</CardDescription>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleDismiss}
              disabled={isDismissing}
              className="shrink-0"
              aria-label="Dismiss onboarding"
            >
              {isDismissing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <X className="h-4 w-4" />
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Browse and favorite launch sites to see atmospheric profiles, cloud base forecasts, and
            thermal strength predictions on your dashboard.
          </p>

          {popularSites && popularSites.length > 0 && (
            <>
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">
                  Popular Washington sites:
                </p>
                <div className="space-y-1">
                  {popularSites.slice(0, 3).map((site) => (
                    <button
                      key={site.id}
                      onClick={() => navigate(`/sites/${site.slug}`)}
                      className="flex w-full items-center gap-2 rounded-md border border-border p-3 text-left transition-colors hover:bg-accent"
                    >
                      <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{site.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {site.region} • {site.elevation}m
                        </div>
                      </div>
                      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              </div>
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">or</span>
                </div>
              </div>
            </>
          )}

          <Button onClick={handleBrowseSites} className="w-full" size="lg">
            Browse All Launch Sites
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            After favoriting your first site, it will appear on your dashboard with a 7-day
            forecast.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
