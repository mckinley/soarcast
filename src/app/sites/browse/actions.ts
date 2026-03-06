'use server';

import { eq, and, like, or } from 'drizzle-orm';
import { auth } from '@/auth';
import { db, launchSites, userFavoriteSites } from '@/db';
import type { LaunchSite, UserFavoriteSite } from '@/db/schema';
import { revalidatePath } from 'next/cache';

/**
 * Get all launch sites with optional filtering
 */
export async function getLaunchSites(filters?: {
  search?: string;
  region?: string;
}): Promise<LaunchSite[]> {
  let query = db.query.launchSites.findMany({
    orderBy: (launchSites, { asc }) => [asc(launchSites.name)],
  });

  // Apply filters if provided
  if (filters?.search || filters?.region) {
    const conditions = [];

    if (filters.search) {
      conditions.push(
        or(
          like(launchSites.name, `%${filters.search}%`),
          like(launchSites.region, `%${filters.search}%`),
        ),
      );
    }

    if (filters.region) {
      conditions.push(eq(launchSites.region, filters.region));
    }

    query = db.query.launchSites.findMany({
      where: conditions.length > 1 ? and(...conditions) : conditions[0],
      orderBy: (launchSites, { asc }) => [asc(launchSites.name)],
    });
  }

  return query;
}

/**
 * Get a single launch site by slug
 */
export async function getLaunchSiteBySlug(slug: string): Promise<LaunchSite | null> {
  const site = await db.query.launchSites.findFirst({
    where: eq(launchSites.slug, slug),
  });

  return site ?? null;
}

/**
 * Get user's favorite sites (must be authenticated)
 */
export async function getUserFavoriteSites(): Promise<
  Array<LaunchSite & { favorite: UserFavoriteSite }>
> {
  const session = await auth();

  if (!session?.user?.id) {
    return [];
  }

  const favorites = await db.query.userFavoriteSites.findMany({
    where: eq(userFavoriteSites.userId, session.user.id),
    with: {
      site: true,
    },
  });

  return favorites.map((fav) => ({
    ...fav.site,
    favorite: {
      id: fav.id,
      userId: fav.userId,
      siteId: fav.siteId,
      notes: fav.notes,
      customMaxWind: fav.customMaxWind,
      customIdealDirections: fav.customIdealDirections,
      notify: fav.notify,
      createdAt: fav.createdAt,
    },
  }));
}

/**
 * Check if a site is favorited by the current user
 */
export async function isSiteFavorited(siteId: string): Promise<boolean> {
  const session = await auth();

  if (!session?.user?.id) {
    return false;
  }

  const favorite = await db.query.userFavoriteSites.findFirst({
    where: and(eq(userFavoriteSites.userId, session.user.id), eq(userFavoriteSites.siteId, siteId)),
  });

  return !!favorite;
}

/**
 * Add a site to user's favorites
 */
export async function favoriteSite(siteId: string): Promise<void> {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  await db.insert(userFavoriteSites).values({
    userId: session.user.id,
    siteId: siteId,
    notify: false,
  });

  revalidatePath('/sites/browse');
  revalidatePath('/');
}

/**
 * Remove a site from user's favorites
 */
export async function unfavoriteSite(siteId: string): Promise<void> {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  await db
    .delete(userFavoriteSites)
    .where(
      and(eq(userFavoriteSites.userId, session.user.id), eq(userFavoriteSites.siteId, siteId)),
    );

  revalidatePath('/sites/browse');
  revalidatePath('/');
}
