interface Env {
  TURSO_DATABASE_URL: string;
  TURSO_AUTH_TOKEN: string;
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
  /** Cloudflare Email Sending (`send_email` binding in wrangler.toml), as `wrangler types` generates it. */
  EMAIL: SendEmail;
}
