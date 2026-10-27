import { Link, redirect } from 'react-router';
import type { Route } from './+types/_index';
import { getSession } from '~/app/lib/auth.server';
import { Button } from '~/components/ui/button';
import { Bell, CalendarRange, Check, Wind } from 'lucide-react';
import { STATUS_CELL, type DayStatus } from '~/lib/verdict-display';
import { SEASON_YEARS } from '~/lib/seasons';

export function meta() {
  return [
    { title: 'SoarCast: which days you can fly at each launch' },
    {
      name: 'description',
      content:
        'A paragliding forecast for each launch. Go, Flyable, Marginal or Not flyable for the next 7 days, with the hours that work, windgrams, trip planning and alerts. Free.',
    },
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env as Env;
  const session = await getSession(request, env);

  // Signed-in pilots start on their week
  if (session?.user) {
    throw redirect('/dashboard');
  }

  return {};
}

type ExampleDay = [DayStatus, string, string?];

/** A made-up week, to show what the dashboard looks like. */
const EXAMPLE: Array<{ name: string; days: ExampleDay[] }> = [
  {
    name: 'Tiger Mountain',
    days: [
      ['marginal', 'Marginal', '16-19'],
      ['no', 'Rain'],
      ['no', 'Rain'],
      ['marginal', 'Marginal', '12-15'],
      ['go', 'Thermals', '11-16'],
      ['go', 'Thermals', '12-17'],
      ['flyable', 'Sled', '10-16'],
    ],
  },
  {
    name: 'Mt. Si',
    days: [
      ['no', 'Too windy'],
      ['no', 'Rain'],
      ['no', 'Wrong wind'],
      ['no', 'Gusty'],
      ['go', 'Thermals', '11-16'],
      ['go', 'XC', '11-17'],
      ['marginal', 'Marginal', '13-15'],
    ],
  },
  {
    name: 'Mailbox Peak',
    days: [
      ['go', 'Sled', '10-15'],
      ['no', 'Rain'],
      ['no', 'In cloud'],
      ['go', 'Sled', '10-14'],
      ['go', 'Thermals', '11-15'],
      ['go', 'Thermals', '12-16'],
      ['go', 'Sled', '10-15'],
    ],
  },
];

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const FEATURES = [
  {
    icon: Check,
    title: 'A clear word for each day',
    text: 'Go, Flyable, Marginal or Not flyable, with the hours that work and what stops the rest.',
  },
  {
    icon: Wind,
    title: 'Windgrams pilots know',
    text: 'Wind, thermals and cloud from the ground up, hour by hour, at the launch height.',
  },
  {
    icon: CalendarRange,
    title: 'Plan trips months ahead',
    text: `Where the flying is good in any month, from ${SEASON_YEARS} years of past weather.`,
  },
  {
    icon: Bell,
    title: 'Alerts on go days',
    text: 'A push or a morning email when a saved site is a go.',
  },
];

/** The example week as the dashboard draws it: a row per site, a colored box per day. */
function ExampleWeek() {
  return (
    <figure className="-mx-3 rounded-2xl border bg-card px-1 pt-3 pb-1 md:mx-0 md:p-5">
      <figcaption className="flex items-baseline justify-between px-2 pb-3 md:px-1">
        <span className="font-semibold">This week</span>
        <span className="text-xs text-muted-foreground">An example</span>
      </figcaption>
      <div className="grid grid-cols-7 gap-0.5 border-b pb-2 text-center text-xs font-semibold text-muted-foreground md:gap-1.5">
        {WEEKDAYS.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      {EXAMPLE.map((site) => (
        <div key={site.name} className="border-b py-2.5 last:border-b-0 last:pb-0">
          <p className="px-2 pb-1.5 text-sm font-semibold md:px-1">{site.name}</p>
          <div className="grid grid-cols-7 gap-0.5 md:gap-1.5">
            {site.days.map(([status, label, hours], i) => (
              <span
                key={i}
                className={`flex h-12 min-w-0 flex-col items-center justify-center rounded-lg text-center leading-tight ${STATUS_CELL[status]}`}
              >
                <span className="text-[10.5px] font-semibold tracking-[-0.01em] md:text-xs md:tracking-normal">
                  {label}
                </span>
                {hours && <span className="text-[10px] opacity-90 md:text-[11px]">{hours}</span>}
              </span>
            ))}
          </div>
        </div>
      ))}
    </figure>
  );
}

export default function LandingPage() {
  return (
    <div className="space-y-16 md:space-y-20 md:pt-6">
      <section className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-14">
        <div className="space-y-6">
          <h1 className="text-[36px] leading-[1.08] font-semibold tracking-tight md:text-5xl">
            Know which days you can fly.
          </h1>
          <p className="max-w-xl text-lg leading-relaxed text-muted-foreground md:text-xl">
            SoarCast reads the forecast at each launch. It tells you which days are good, when to be
            on launch, and what stops the rest.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button size="lg" asChild className="h-12 px-6 text-base">
              <Link to="/sites">Find a launch</Link>
            </Button>
            <Button size="lg" variant="outline" asChild className="h-12 px-6 text-base">
              <Link to="/login">Sign in</Link>
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Free. Sign in with Google or GitHub to save sites and get alerts.
          </p>
        </div>
        <ExampleWeek />
      </section>

      <section aria-label="What SoarCast does" className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map((f) => (
          <div key={f.title} className="flex gap-4 sm:block sm:space-y-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">
              <f.icon className="size-5" />
            </span>
            <div className="space-y-1.5">
              <h2 className="text-[17px] font-semibold">{f.title}</h2>
              <p className="text-[15px] leading-relaxed text-muted-foreground">{f.text}</p>
            </div>
          </div>
        ))}
      </section>

      <p className="text-sm text-muted-foreground">
        New to SoarCast? The{' '}
        <Link to="/guide" className="font-medium text-primary hover:underline">
          Guide
        </Link>{' '}
        explains how each day is rated and where the data comes from.
      </p>
    </div>
  );
}
