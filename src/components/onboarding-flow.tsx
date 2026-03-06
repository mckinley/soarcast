'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MapPin, Bell, X, ArrowRight, Loader2 } from 'lucide-react';
import { completeOnboarding } from '@/app/settings/actions';

interface OnboardingFlowProps {
  nearbySites?: Array<{
    id: string;
    name: string;
    slug: string;
    region: string | null;
    elevation: number | null;
    distance?: number;
  }>;
}

export function OnboardingFlow({ nearbySites }: OnboardingFlowProps) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [isSkipping, setIsSkipping] = useState(false);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    // Request geolocation on mount for step 1 (finding nearby sites)
    if ('geolocation' in navigator && step === 0) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
        },
        () => {
          // Silently fail - we'll just show popular sites instead
        },
      );
    }
  }, [step]);

  const handleSkip = async () => {
    setIsSkipping(true);
    await completeOnboarding();
    router.push('/dashboard');
    router.refresh();
  };

  const handleComplete = async () => {
    await completeOnboarding();
    router.push('/dashboard');
    router.refresh();
  };

  const steps = [
    {
      title: 'Welcome to SoarCast! 🪂',
      description: "Let's get you set up to find epic flying days.",
      content: (
        <div className="space-y-4">
          <p className="text-muted-foreground">
            SoarCast helps you track soaring conditions at your favorite launch sites with:
          </p>
          <ul className="space-y-2 text-sm">
            <li className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
              <span>
                <strong>Atmospheric profiles</strong> showing lapse rate, cloud base, and thermal
                strength
              </span>
            </li>
            <li className="flex items-start gap-2">
              <Bell className="mt-0.5 h-4 w-4 shrink-0 text-orange-600 dark:text-orange-400" />
              <span>
                <strong>Smart notifications</strong> when epic conditions are forecasted
              </span>
            </li>
          </ul>
          <Button onClick={() => setStep(1)} className="w-full">
            Get Started
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      ),
    },
    {
      title: 'Find Your Home Sites',
      description: 'Add your favorite launch sites to start tracking conditions.',
      content: (
        <div className="space-y-4">
          {nearbySites && nearbySites.length > 0 ? (
            <>
              <p className="text-sm text-muted-foreground">
                {location
                  ? 'Here are some sites near you:'
                  : 'Here are some popular Washington sites:'}
              </p>
              <div className="space-y-2">
                {nearbySites.slice(0, 5).map((site) => (
                  <Card key={site.id} className="cursor-pointer hover:bg-accent">
                    <CardHeader className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-base">{site.name}</CardTitle>
                          <CardDescription className="text-xs">
                            {site.region} • {site.elevation}m
                            {site.distance && ` • ${Math.round(site.distance)}km away`}
                          </CardDescription>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => router.push(`/sites/${site.slug}`)}
                        >
                          View
                        </Button>
                      </div>
                    </CardHeader>
                  </Card>
                ))}
              </div>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => router.push('/sites/browse')}
              >
                Browse All Sites
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                You can search and discover launch sites across Washington.
              </p>
              <Button className="w-full" onClick={() => router.push('/sites/browse')}>
                Browse Launch Sites
              </Button>
            </>
          )}
          <Button onClick={() => setStep(2)} variant="ghost" className="w-full">
            Next
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      ),
    },
    {
      title: 'You&apos;re All Set! 🎉',
      description: 'Start tracking conditions and get notified about epic flying days.',
      content: (
        <div className="space-y-4">
          <div className="rounded-lg border bg-muted/50 p-4">
            <h4 className="mb-2 font-medium">Quick Tips:</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>• Click the ⭐ button on any site to add it to your favorites</li>
              <li>• Enable notifications in Settings to get alerts</li>
              <li>• Check your Dashboard to see today&apos;s conditions at a glance</li>
            </ul>
          </div>
          <Button onClick={handleComplete} className="w-full">
            Go to Dashboard
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  const currentStep = steps[step];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <Card className="w-full max-w-lg shadow-lg">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <CardTitle>{currentStep.title}</CardTitle>
              <CardDescription>{currentStep.description}</CardDescription>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleSkip}
              disabled={isSkipping}
              className="shrink-0"
            >
              {isSkipping ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <X className="h-4 w-4" />
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {currentStep.content}
          <div className="mt-6 flex justify-center gap-1">
            {steps.map((_, idx) => (
              <div
                key={idx}
                className={`h-1.5 w-8 rounded-full transition-colors ${
                  idx === step ? 'bg-primary' : 'bg-muted'
                }`}
              />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
