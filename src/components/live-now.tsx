import { Suspense } from 'react';
import { Await } from 'react-router';
import { UpNowCard } from '@/components/up-now';
import { WindNowCard } from '@/components/wind-now';
import type { OgnNow } from '@/lib/ogn';
import type { UpNowResult } from '@/lib/up-now';
import type { NearStation } from '@/lib/wind-now';

/**
 * What is happening at a launch now, side by side on a computer: the wind
 * the nearest stations measure, and pilots up or flown today. Both stream in
 * after the page, and neither shows when it has nothing.
 */
export function LiveNow({
  upNow,
  windNow,
  launchAltitude,
}: {
  upNow: Promise<{ sp: UpNowResult | null; ogn: OgnNow | null; timeZone: string | null }>;
  windNow: Promise<{ stations: NearStation[]; checkedAt: number } | null>;
  launchAltitude: number | null;
}) {
  return (
    <div className="grid items-start gap-4 empty:hidden md:grid-cols-2">
      <Suspense fallback={null}>
        <Await resolve={windNow} errorElement={null}>
          {(w) =>
            w ? (
              <WindNowCard
                stations={w.stations}
                checkedAt={w.checkedAt}
                launchAltitude={launchAltitude}
              />
            ) : null
          }
        </Await>
      </Suspense>
      <Suspense fallback={null}>
        <Await resolve={upNow} errorElement={null}>
          {(u) => (
            <UpNowCard
              up={u.sp}
              ogn={u.ogn}
              launchAltitude={launchAltitude}
              timeZone={u.timeZone}
            />
          )}
        </Await>
      </Suspense>
    </div>
  );
}
