interface Env {
  /** The app database (`d1_databases` in wrangler.toml). */
  DB: D1Database;
  BETTER_AUTH_URL: string;
  BETTER_AUTH_SECRET: string;
  AUTH_GOOGLE_ID: string;
  AUTH_GOOGLE_SECRET: string;
  AUTH_GITHUB_ID: string;
  AUTH_GITHUB_SECRET: string;
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
  CRON_SECRET: string;
  PGSITES_API_KEY: string;
  /** Where health-check failures are emailed (worker.ts); optional. */
  HEALTH_ALERT_TO?: string;
  /** Which deploy is running (`[version_metadata]` in wrangler.toml), shown on /admin. */
  CF_VERSION_METADATA?: WorkerVersionMetadata;
  /** openAIP's API key for the map's Airspace layer (app/routes/api.airspace.$z.$x.$y.tsx); optional. */
  OPENAIP_API_KEY?: string;
  /** Cloudflare Email Sending (`send_email` binding in wrangler.toml), as `wrangler types` generates it; none on staging. */
  EMAIL?: SendEmail;
  /** Staging only (env.staging in wrangler.toml, docs/staging.md): turns on /dev/login and the email sign-in it uses. */
  DEV_AUTH?: string;
  /** 'staging' on the staging copy: the badge, noindex, no Google or GitHub sign-in. */
  APP_ENV?: string;
  /** The shared staging password (src/lib/staging-gate.ts), also sent to pgsites' staging copy; staging only. */
  STAGING_PASSWORD?: string;
  /** Another pgsites than production (src/lib/pgsites-client.ts); staging's. */
  PGSITES_URL?: string;
  /** That pgsites' Worker, called directly; staging only. */
  PGSITES?: Fetcher;
  /** Syncing Pilots' FlownDaysApi (`[[services]]` in wrangler.toml); missing in local dev. */
  SYNCING_PILOTS?: {
    flownDays(
      query: import('./src/lib/flown-days').FlownDaysQuery,
    ): Promise<import('./src/lib/flown-days').FlownDaysResult>;
    upNow(
      query: import('./src/lib/up-now').UpNowQuery,
    ): Promise<import('./src/lib/up-now').UpNowResult>;
  };
}
