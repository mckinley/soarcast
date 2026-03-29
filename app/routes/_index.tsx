import { Link, redirect } from 'react-router';
import type { Route } from './+types/_index';
import { getSession } from '~/app/lib/auth.server';
import { Button } from '~/components/ui/button';
import { ArrowRight, Wind, MapPin, Bell, TrendingUp } from 'lucide-react';

export function meta() {
  return [
    { title: 'SoarCast - Paragliding XC Weather Monitor' },
    {
      name: 'description',
      content:
        'Track flying conditions at your favorite paragliding sites with 7-day weather forecasts, intelligent XC scoring, and push notifications.',
    },
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env as Env;
  const session = await getSession(request, env);

  // Redirect authenticated users to dashboard
  if (session?.user) {
    throw redirect('/dashboard');
  }

  return {};
}

export default function LandingPage() {
  // NOTE: This is a simplified landing page.
  // Port the full landing page content from src/app/page.tsx
  // (hero, feature cards, demo section, CTA)

  return (
    <div className="flex min-h-screen flex-col">
      <section className="relative flex-1 bg-gradient-to-b from-sky-50 via-white to-sky-50/30 dark:from-gray-900 dark:via-gray-950 dark:to-gray-900">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
          {/* Header */}
          <div className="mb-12 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wind className="h-8 w-8 text-blue-600 dark:text-blue-400" />
              <h1 className="text-2xl font-bold tracking-tight">SoarCast</h1>
            </div>
            <Link to="/auth/signin">
              <Button variant="outline">Sign In</Button>
            </Link>
          </div>

          {/* Hero */}
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

            <div className="mb-16 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link to="/sites/browse">
                <Button size="lg" className="w-full sm:w-auto">
                  Browse Sites
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <Link to="/auth/signin">
                <Button size="lg" variant="outline" className="w-full sm:w-auto">
                  Get Started Free
                </Button>
              </Link>
            </div>
          </div>

          {/* Features */}
          <div className="mx-auto mt-16 grid max-w-5xl gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                icon: TrendingUp,
                title: 'XC Scoring',
                desc: '0-100 flyability scores based on 7 atmospheric factors',
              },
              {
                icon: Wind,
                title: 'Windgrams',
                desc: 'Wind speed and direction at every altitude, every hour',
              },
              {
                icon: MapPin,
                title: 'Site Browser',
                desc: 'Browse and favorite launch sites from around the world',
              },
              {
                icon: Bell,
                title: 'Alerts',
                desc: 'Push notifications when epic conditions are forecasted',
              },
            ].map((feature) => (
              <div
                key={feature.title}
                className="rounded-xl border bg-card p-6 text-card-foreground"
              >
                <feature.icon className="mb-3 h-6 w-6 text-blue-600 dark:text-blue-400" />
                <h3 className="mb-1 font-semibold">{feature.title}</h3>
                <p className="text-sm text-muted-foreground">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
