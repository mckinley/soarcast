import { eq, gte, sql } from 'drizzle-orm';
import {
  appState,
  customSites,
  getDb,
  pushSubscriptions,
  requestTimings,
  user,
  userFavoriteSites,
} from '~/app/lib/db.server';
import { isRole, roleChangeProblem, summarizeTimings } from '~/lib/admin';
import { HEALTH_REPORT_KEY, HEALTH_REPORT_MAX_AGE_MS, type HealthReport } from '~/lib/health';

// What the admin pages (/admin, /admin/users) show and change. Every caller
// has already passed requireAdmin.

const DAY_MS = 24 * 60 * 60 * 1000;

/** The commit this build came from, set by vite.config.ts from GITHUB_SHA ('dev' locally). */
declare const __COMMIT_SHA__: string;

export async function adminOverview(env: Env) {
  const db = getDb(env);
  const weekAgo = new Date(Date.now() - 7 * DAY_MS);
  const count = (rows: { n: number }[]) => rows[0]?.n ?? 0;
  const [pilots, newPilots, admins, push, favorites, custom, lastReport, timings] =
    await Promise.all([
      db
        .select({ n: sql<number>`count(*)` })
        .from(user)
        .then(count),
      db
        .select({ n: sql<number>`count(*)` })
        .from(user)
        .where(gte(user.createdAt, weekAgo))
        .then(count),
      db
        .select({ n: sql<number>`count(*)` })
        .from(user)
        .where(eq(user.role, 'admin'))
        .then(count),
      db
        .select({ n: sql<number>`count(distinct ${pushSubscriptions.userId})` })
        .from(pushSubscriptions)
        .then(count),
      db
        .select({ n: sql<number>`count(*)` })
        .from(userFavoriteSites)
        .then(count),
      db
        .select({ n: sql<number>`count(*)` })
        .from(customSites)
        .then(count),
      db.select().from(appState).where(eq(appState.key, HEALTH_REPORT_KEY)),
      db
        .select({
          page: requestTimings.page,
          totalMs: requestTimings.totalMs,
          cold: requestTimings.cold,
        })
        .from(requestTimings),
    ]);
  const health = lastReport[0] ? (JSON.parse(lastReport[0].value) as HealthReport) : null;
  return {
    version: {
      commit: typeof __COMMIT_SHA__ === 'string' ? __COMMIT_SHA__ : 'dev',
      deployedAt: env.CF_VERSION_METADATA?.timestamp ?? null,
      versionId: env.CF_VERSION_METADATA?.id ?? null,
    },
    // The hourly cron's last report; the page can run the checks again now
    health,
    healthStale: health
      ? Date.now() - Date.parse(health.checkedAt) > HEALTH_REPORT_MAX_AGE_MS
      : false,
    counts: { pilots, newPilots, admins, push, favorites, custom },
    timings: summarizeTimings(timings),
  };
}

/** Every pilot, newest first, with what they keep in SoarCast. */
export async function adminUsers(env: Env) {
  const rows = await env.DB.prepare(
    `SELECT u.id, u.name, u.email, u.image, u.role, u.created_at AS createdAt,
       (SELECT COUNT(*) FROM user_favorite_sites f WHERE f.user_id = u.id) AS favorites,
       (SELECT COUNT(*) FROM custom_sites c WHERE c.user_id = u.id) AS customSites,
       (SELECT MAX(s.updated_at) FROM session s WHERE s.user_id = u.id) AS lastSeen,
       EXISTS (SELECT 1 FROM push_subscriptions p WHERE p.user_id = u.id) AS push
     FROM user u ORDER BY u.created_at DESC LIMIT 1000`,
  ).all<{
    id: string;
    name: string;
    email: string;
    image: string | null;
    role: string | null;
    createdAt: number;
    favorites: number;
    customSites: number;
    lastSeen: number | null;
    push: number;
  }>();
  return rows.results.map((r) => ({ ...r, role: r.role ?? 'user', push: r.push === 1 }));
}

/** Gives a pilot a role, or says why not. */
export async function setUserRole(
  env: Env,
  actorId: string,
  targetId: string,
  role: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isRole(role)) return { ok: false, error: 'Unknown role.' };
  const db = getDb(env);
  const [target] = await db.select({ role: user.role }).from(user).where(eq(user.id, targetId));
  if (!target) return { ok: false, error: 'No such pilot.' };
  const problem = roleChangeProblem({ actorId, targetId, role, currentRole: target.role });
  if (problem) return { ok: false, error: problem };
  await db.update(user).set({ role }).where(eq(user.id, targetId));
  return { ok: true };
}
