import { drizzle } from 'drizzle-orm/libsql/web';
import { createClient } from '@libsql/client/web';
import * as schema from '~/db/schema';

// Cache the db instance per isolate (CF Workers reuse isolates)
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let _lastUrl: string | null = null;

export function getDb(env: { TURSO_DATABASE_URL: string; TURSO_AUTH_TOKEN: string }) {
  // Recreate if env changed (shouldn't happen in production, but safe for dev)
  if (!_db || _lastUrl !== env.TURSO_DATABASE_URL) {
    const client = createClient({
      url: env.TURSO_DATABASE_URL,
      authToken: env.TURSO_AUTH_TOKEN,
    });
    _db = drizzle(client, { schema });
    _lastUrl = env.TURSO_DATABASE_URL;
  }
  return _db;
}

// Re-export schema for convenience
export * from '~/db/schema';
