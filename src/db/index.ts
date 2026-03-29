import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import * as schema from './schema';

// Lazy initialization — compatible with both Node.js (process.env) and CF Workers (env bindings)
// On CF Workers, use getDb(env) from app/lib/db.server.ts instead of this global db.
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

function initDb() {
  const url = typeof process !== 'undefined' ? process.env?.TURSO_DATABASE_URL : undefined;
  const token = typeof process !== 'undefined' ? process.env?.TURSO_AUTH_TOKEN : undefined;

  if (!url || !token) {
    throw new Error(
      'Database not initialized. On CF Workers, use getDb(env) from app/lib/db.server.ts',
    );
  }

  const client = createClient({ url, authToken: token });
  return drizzle(client, { schema });
}

export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_, prop) {
    if (!_db) _db = initDb();
    return (_db as Record<string | symbol, unknown>)[prop];
  },
});

// Re-export schema for convenience
export * from './schema';
