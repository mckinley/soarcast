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
  /** Cloudflare Email Sending (`send_email` binding in wrangler.toml), as `wrangler types` generates it. */
  EMAIL: SendEmail;
}
