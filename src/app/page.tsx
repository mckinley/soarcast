import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowRight, Wind, MapPin, Bell, TrendingUp } from 'lucide-react';

export default async function LandingPage() {
  const session = await auth();

  // Redirect authenticated users to dashboard
  if (session?.user) {
    redirect('/dashboard');
  }

  return (
    <div className="flex min-h-screen flex-col">
      {/* Hero Section */}
      <section className="relative flex-1 bg-gradient-to-b from-sky-50 via-white to-sky-50/30 dark:from-gray-900 dark:via-gray-950 dark:to-gray-900">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
          {/* Header */}
          <div className="mb-12 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wind className="h-8 w-8 text-blue-600 dark:text-blue-400" />
              <h1 className="text-2xl font-bold tracking-tight">SoarCast</h1>
            </div>
            <Link href="/auth/signin">
              <Button variant="outline">Sign In</Button>
            </Link>
          </div>

          {/* Hero Content */}
          <div className="text-center">
            <h2 className="mb-4 text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
              Know when to fly,
              <br />
              <span className="text-blue-600 dark:text-blue-400">before you drive</span>
            </h2>
            <p className="mx-auto mb-8 max-w-2xl text-lg text-muted-foreground sm:text-xl">
              Atmospheric forecasts for paraglider pilots. See lapse rate, thermal strength, cloud
              base, and wind conditions for your favorite launch sites.
            </p>

            {/* CTA Buttons */}
            <div className="mb-16 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link href="/sites/browse">
                <Button size="lg" className="w-full sm:w-auto">
                  Browse Sites
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <Link href="/auth/signin">
                <Button size="lg" variant="outline" className="w-full sm:w-auto">
                  Sign In to Get Alerts
                </Button>
              </Link>
            </div>

            {/* Sample Site Preview Card */}
            <div className="mx-auto max-w-4xl rounded-xl border bg-card p-6 shadow-lg">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MapPin className="h-5 w-5 text-muted-foreground" />
                  <h3 className="text-lg font-semibold">Tiger Mountain</h3>
                  <span className="rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-800 dark:bg-green-900/30 dark:text-green-400">
                    Epic Today
                  </span>
                </div>
                <span className="text-sm text-muted-foreground">Issaquah, WA • 1,200m</span>
              </div>

              {/* Simplified Windgram Preview */}
              <div className="relative h-64 overflow-hidden rounded-lg border bg-gradient-to-b from-sky-100 to-green-50 dark:from-gray-800 dark:to-gray-900">
                {/* Decorative visualization placeholder */}
                <div className="flex h-full items-center justify-center">
                  <div className="text-center">
                    <TrendingUp className="mx-auto mb-2 h-12 w-12 text-blue-600 dark:text-blue-400" />
                    <p className="text-sm font-medium text-muted-foreground">
                      Atmospheric profile visualization
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Sign in or browse sites to see live data
                    </p>
                  </div>
                </div>
              </div>

              {/* Key Metrics Preview */}
              <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div className="rounded-lg border bg-background p-3">
                  <p className="text-xs text-muted-foreground">Cloud Base</p>
                  <p className="text-lg font-semibold">4,800ft</p>
                </div>
                <div className="rounded-lg border bg-background p-3">
                  <p className="text-xs text-muted-foreground">Wind</p>
                  <p className="text-lg font-semibold">SW 12mph</p>
                </div>
                <div className="rounded-lg border bg-background p-3">
                  <p className="text-xs text-muted-foreground">Best Window</p>
                  <p className="text-lg font-semibold">11AM-3PM</p>
                </div>
                <div className="rounded-lg border bg-background p-3">
                  <p className="text-xs text-muted-foreground">Thermals</p>
                  <p className="text-lg font-semibold">Strong</p>
                </div>
              </div>

              <div className="mt-4">
                <Link href="/sites/tiger-mountain">
                  <Button variant="ghost" className="w-full">
                    View Full Forecast
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="border-t bg-white py-16 dark:bg-gray-950 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12 text-center">
            <h2 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
              Everything you need to plan your XC flight
            </h2>
            <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
              No more guessing. Get atmospheric data tailored for soaring pilots.
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {/* Feature 1: Windgrams */}
            <div className="rounded-lg border bg-card p-6">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <TrendingUp className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <h3 className="mb-2 text-xl font-semibold">Atmospheric Profiles</h3>
              <p className="text-muted-foreground">
                See lapse rate, thermal index, cloud base, and top of lift. Know exactly when
                conditions are soarable.
              </p>
            </div>

            {/* Feature 2: Site Discovery */}
            <div className="rounded-lg border bg-card p-6">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900/30">
                <MapPin className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <h3 className="mb-2 text-xl font-semibold">55 WA Launch Sites</h3>
              <p className="text-muted-foreground">
                Search, filter, and discover launch sites across Washington. See which sites are
                flyable today.
              </p>
            </div>

            {/* Feature 3: Smart Notifications */}
            <div className="rounded-lg border bg-card p-6">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-orange-100 dark:bg-orange-900/30">
                <Bell className="h-6 w-6 text-orange-600 dark:text-orange-400" />
              </div>
              <h3 className="mb-2 text-xl font-semibold">Smart Alerts</h3>
              <p className="text-muted-foreground">
                Get notified when epic conditions are forecasted at your favorite sites. Morning
                digest or per-site alerts.
              </p>
            </div>

            {/* Feature 4: Wind Analysis */}
            <div className="rounded-lg border bg-card p-6">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/30">
                <Wind className="h-6 w-6 text-purple-600 dark:text-purple-400" />
              </div>
              <h3 className="mb-2 text-xl font-semibold">Wind at Altitude</h3>
              <p className="text-muted-foreground">
                Wind barbs show speed and direction at every altitude level. Plan your flight path
                before you launch.
              </p>
            </div>

            {/* Feature 5: 7-Day Forecasts */}
            <div className="rounded-lg border bg-card p-6">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-cyan-100 dark:bg-cyan-900/30">
                <TrendingUp className="h-6 w-6 text-cyan-600 dark:text-cyan-400" />
              </div>
              <h3 className="mb-2 text-xl font-semibold">7-Day Forecasts</h3>
              <p className="text-muted-foreground">
                Plan your week. See which days have the best soaring conditions at a glance.
              </p>
            </div>

            {/* Feature 6: Free & Open */}
            <div className="rounded-lg border bg-card p-6">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-pink-100 dark:bg-pink-900/30">
                <ArrowRight className="h-6 w-6 text-pink-600 dark:text-pink-400" />
              </div>
              <h3 className="mb-2 text-xl font-semibold">Free to Use</h3>
              <p className="text-muted-foreground">
                Browse sites and forecasts without signing in. Create a free account to save
                favorites and get alerts.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="border-t bg-gradient-to-b from-sky-50 to-white py-16 dark:from-gray-900 dark:to-gray-950 sm:py-24">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
            Ready to fly smarter?
          </h2>
          <p className="mb-8 text-lg text-muted-foreground">
            Join pilots already using SoarCast to find epic flying days.
          </p>
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link href="/sites/browse">
              <Button size="lg" className="w-full sm:w-auto">
                Explore Launch Sites
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <Link href="/auth/signin">
              <Button size="lg" variant="outline" className="w-full sm:w-auto">
                Sign In Free
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <div className="flex items-center gap-2">
              <Wind className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              <span className="text-sm font-medium">SoarCast</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Weather data from{' '}
              <a
                href="https://open-meteo.com"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-foreground"
              >
                Open-Meteo
              </a>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
