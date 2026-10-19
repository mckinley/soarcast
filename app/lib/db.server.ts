import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1';
import * as schema from '~/db/schema';

export type Db = DrizzleD1Database<typeof schema>;

// Cache the Drizzle wrapper per isolate (CF Workers reuse isolates); the
// D1 binding itself is the same object for the isolate's lifetime.
let _db: Db | null = null;
let _binding: D1Database | null = null;

export function getDb(env: { DB: D1Database }): Db {
  if (!_db || _binding !== env.DB) {
    _db = drizzle(env.DB, { schema });
    _binding = env.DB;
  }
  return _db;
}

// Re-export schema for convenience
export * from '~/db/schema';
