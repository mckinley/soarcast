import { describe, expect, it } from 'vitest';
import { isAdmin, isRole, roleChangeProblem, summarizeTimings, type TimingRow } from '../admin';

describe('isAdmin', () => {
  it('is true only for the admin role', () => {
    expect(isAdmin({ role: 'admin' })).toBe(true);
    expect(isAdmin({ role: 'user' })).toBe(false);
    expect(isAdmin({ role: null })).toBe(false);
    expect(isAdmin({})).toBe(false);
    expect(isAdmin(null)).toBe(false);
  });

  it('knows the roles', () => {
    expect(isRole('admin')).toBe(true);
    expect(isRole('user')).toBe(true);
    expect(isRole('owner')).toBe(false);
    expect(isRole(null)).toBe(false);
  });
});

describe('roleChangeProblem', () => {
  const change = { actorId: 'a', targetId: 'b', role: 'admin' as const, currentRole: 'user' };

  it('lets an admin make another pilot an admin, or take it away', () => {
    expect(roleChangeProblem(change)).toBeNull();
    expect(roleChangeProblem({ ...change, role: 'user', currentRole: 'admin' })).toBeNull();
  });

  it('treats a missing role as a pilot', () => {
    expect(roleChangeProblem({ ...change, currentRole: null })).toBeNull();
  });

  it('refuses to remove your own admin role', () => {
    expect(
      roleChangeProblem({ actorId: 'a', targetId: 'a', role: 'user', currentRole: 'admin' }),
    ).toMatch(/your own admin role/);
  });

  it('says when nothing would change', () => {
    expect(roleChangeProblem({ ...change, currentRole: 'admin' })).toBe('Already an admin.');
  });
});

describe('summarizeTimings', () => {
  const rows = (page: string, ms: number[], cold = false): TimingRow[] =>
    ms.map((totalMs) => ({ page, totalMs, cold }));

  it('gives the median, 95th percentile and share of fresh starts', () => {
    const all = [
      ...rows('/', [10, 20, 30, 40, 50, 60, 70, 80, 90]),
      ...rows('/year', [1000], true),
    ];
    const summary = summarizeTimings(all);
    expect(summary).toMatchObject({ requests: 10, medianMs: 50, p95Ms: 1000, coldShare: 0.1 });
  });

  it('ranks pages by median, leaving out pages with too few requests', () => {
    const all = [
      ...rows('/dashboard', [100, 120, 140, 160, 180]),
      ...rows('/sites/:slug', [300, 310, 320, 330, 340, 350]),
      ...rows('/year', [5000]),
    ];
    expect(summarizeTimings(all).slowest).toEqual([
      { page: '/sites/:slug', requests: 6, medianMs: 320 },
      { page: '/dashboard', requests: 5, medianMs: 140 },
    ]);
  });

  it('is all zeros with no requests', () => {
    expect(summarizeTimings([])).toEqual({
      requests: 0,
      medianMs: 0,
      p95Ms: 0,
      coldShare: 0,
      slowest: [],
    });
  });
});
