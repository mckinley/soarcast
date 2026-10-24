import { useFetcher, useLoaderData } from 'react-router';
import type { Route } from './+types/admin._index';
import { requireAdmin } from '~/app/lib/auth.server';
import { adminOverview } from '~/app/lib/admin.server';
import { runHealthChecks } from '~/app/lib/health.server';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import type { HealthReport } from '~/lib/health';

// /admin: is SoarCast healthy, which build is live, and how many pilots use it.

const REPO = 'https://github.com/mckinley/soarcast';

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env as Env;
  await requireAdmin(request, env);
  return adminOverview(env);
}

/** Runs every health check now, for the Check now button. */
export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env as Env;
  await requireAdmin(request, env);
  return { report: await runHealthChecks(env) };
}

/** A time as UTC, the same on the server and in the browser. */
function utc(value: string | number | Date): string {
  return `${new Date(value).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

function HealthCard({
  stored,
  storedStale,
}: {
  stored: HealthReport | null;
  storedStale: boolean;
}) {
  const fetcher = useFetcher<typeof action>();
  const report = fetcher.data?.report ?? stored;
  const checking = fetcher.state !== 'idle';
  const stale = storedStale && !fetcher.data;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="space-y-1.5">
          <CardTitle className="flex items-center gap-2">
            Health
            {report && (
              <Badge variant={report.ok ? 'secondary' : 'destructive'}>
                {report.ok ? 'All checks pass' : 'Failing'}
              </Badge>
            )}
            {stale && <Badge variant="outline">Old report</Badge>}
          </CardTitle>
          <CardDescription>
            {report
              ? `${fetcher.data ? 'Checked just now' : 'The hourly check'}, ${utc(report.checkedAt)}.`
              : 'No report yet: the hourly check records one after its first run.'}{' '}
            The same checks email you when they change, and /api/health shows their results.
          </CardDescription>
        </div>
        <fetcher.Form method="post">
          <Button type="submit" variant="outline" size="sm" disabled={checking}>
            {checking ? 'Checking…' : 'Check now'}
          </Button>
        </fetcher.Form>
      </CardHeader>
      {report && (
        <CardContent>
          <ul className="divide-y text-sm">
            {report.checks.map((check) => (
              <li key={check.name} className="flex gap-3 py-2">
                <span
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${check.ok ? 'bg-green-500' : 'bg-destructive'}`}
                />
                <span className="w-28 shrink-0 font-medium">{check.name}</span>
                <span className="min-w-0 break-words text-muted-foreground">{check.detail}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      )}
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

export default function AdminOverview() {
  const { version, health, healthStale, counts, timings } = useLoaderData<typeof loader>();
  const shortCommit = version.commit.slice(0, 7);

  return (
    <div className="space-y-6">
      <HealthCard stored={health} storedStale={healthStale} />

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Pilots</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-4">
            <Stat label="Pilots" value={counts.pilots} />
            <Stat label="New this week" value={counts.newPilots} />
            <Stat label="Admins" value={counts.admins} />
            <Stat label="With alerts on a device" value={counts.push} />
            <Stat label="Saved sites" value={counts.favorites} />
            <Stat label="Custom sites" value={counts.custom} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Live build</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Commit</span>
              {version.commit === 'dev' ? (
                <span>dev (a local build)</span>
              ) : (
                <a
                  href={`${REPO}/commit/${version.commit}`}
                  className="font-mono underline-offset-4 hover:underline"
                >
                  {shortCommit}
                </a>
              )}
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Deployed</span>
              <span>{version.deployedAt ? utc(version.deployedAt) : 'not known locally'}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Worker version</span>
              <span className="truncate font-mono text-xs">{version.versionId ?? 'none'}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Speed</CardTitle>
          <CardDescription>
            The newest {timings.requests.toLocaleString('en-US')} page and data requests.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <Stat label="Median" value={`${timings.medianMs} ms`} />
            <Stat label="95th percentile" value={`${timings.p95Ms} ms`} />
            <Stat label="Fresh Worker starts" value={`${Math.round(timings.coldShare * 100)}%`} />
          </div>
          {timings.slowest.length > 0 && (
            <div>
              <h3 className="mb-1 text-sm font-medium">Slowest pages (median)</h3>
              <ul className="divide-y text-sm">
                {timings.slowest.map((p) => (
                  <li key={p.page} className="flex justify-between gap-4 py-1.5">
                    <span className="truncate font-mono text-xs">{p.page}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {p.medianMs} ms · {p.requests} requests
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
