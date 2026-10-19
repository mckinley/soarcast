import type { Config } from 'drizzle-kit';

// `npx drizzle-kit generate` writes SQL migrations to migrations/, which
// `wrangler d1 migrations apply soarcast` applies (the deploy workflow does
// this with --remote; use --local for the dev database).
export default {
  schema: './src/db/schema.ts',
  out: './migrations',
  dialect: 'sqlite',
} satisfies Config;
