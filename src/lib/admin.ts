// Who may use the admin pages (/admin) and how roles change. Roles live in
// user.role ('user' or 'admin'); pilots can never set their own
// (app/lib/auth.server.ts). The first admin comes from `npm run make-admin`.

export type Role = 'user' | 'admin';

export const ROLES: Role[] = ['user', 'admin'];

export function isRole(value: unknown): value is Role {
  return ROLES.includes(value as Role);
}

export function isAdmin(user: { role?: string | null } | null | undefined): boolean {
  return user?.role === 'admin';
}

/**
 * Why an admin may not give `targetId` this role, or null when they may.
 * Nobody takes away their own admin role, so the last admin can't lock
 * everyone out.
 */
export function roleChangeProblem(change: {
  actorId: string;
  targetId: string;
  role: Role;
  currentRole: string | null;
}): string | null {
  if (change.currentRole === change.role)
    return `Already ${change.role === 'admin' ? 'an admin' : 'a pilot'}.`;
  if (change.role !== 'admin' && change.actorId === change.targetId) {
    return 'You can’t remove your own admin role. Ask another admin.';
  }
  return null;
}

export interface TimingRow {
  page: string;
  totalMs: number;
  cold: boolean;
}

export interface TimingSummary {
  requests: number;
  medianMs: number;
  p95Ms: number;
  /** Share of requests that started a fresh Worker, 0 to 1 */
  coldShare: number;
  /** The pages with the slowest median, at least SLOW_PAGE_MIN_REQUESTS each */
  slowest: { page: string; requests: number; medianMs: number }[];
}

export const SLOW_PAGE_MIN_REQUESTS = 5;

/** The value below which `share` of the sorted values fall (nearest rank). */
function percentile(sorted: number[], share: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.ceil(share * sorted.length) - 1)];
}

/** How fast pages answered, from the request_timings rows kept (newest 2000). */
export function summarizeTimings(rows: TimingRow[], slowestCount = 5): TimingSummary {
  const all = rows.map((r) => r.totalMs).sort((a, b) => a - b);
  const byPage = new Map<string, number[]>();
  for (const r of rows) {
    const ms = byPage.get(r.page);
    if (ms) ms.push(r.totalMs);
    else byPage.set(r.page, [r.totalMs]);
  }
  const slowest = [...byPage]
    .filter(([, ms]) => ms.length >= SLOW_PAGE_MIN_REQUESTS)
    .map(([page, ms]) => ({
      page,
      requests: ms.length,
      medianMs: percentile(
        [...ms].sort((a, b) => a - b),
        0.5,
      ),
    }))
    .sort((a, b) => b.medianMs - a.medianMs)
    .slice(0, slowestCount);
  return {
    requests: rows.length,
    medianMs: percentile(all, 0.5),
    p95Ms: percentile(all, 0.95),
    coldShare: rows.length ? rows.filter((r) => r.cold).length / rows.length : 0,
    slowest,
  };
}
