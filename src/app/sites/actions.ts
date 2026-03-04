'use server';

import { revalidatePath } from 'next/cache';
import { eq, and } from 'drizzle-orm';
import { auth } from '@/auth';
import { db, sites } from '@/db';
import type { Site } from '@/types';

/**
 * Transform database site record to app Site type
 */
function dbSiteToAppSite(dbSite: typeof sites.$inferSelect): Site {
  return {
    id: dbSite.id,
    name: dbSite.name,
    latitude: parseFloat(dbSite.latitude),
    longitude: parseFloat(dbSite.longitude),
    elevation: dbSite.elevation,
    idealWindDirections: dbSite.idealWindDirections as number[],
    maxWindSpeed: dbSite.maxWindSpeed,
    notes: dbSite.notes ?? undefined,
    createdAt: new Date(dbSite.createdAt).toISOString(),
    updatedAt: new Date(dbSite.updatedAt).toISOString(),
  };
}

/**
 * Get all sites for the authenticated user
 */
export async function getSites(): Promise<Site[]> {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  const userSites = await db.query.sites.findMany({
    where: eq(sites.userId, session.user.id),
    orderBy: (sites, { desc }) => [desc(sites.updatedAt)],
  });

  return userSites.map(dbSiteToAppSite);
}

/**
 * Add a new site for the authenticated user
 */
export async function addSite(
  site: Omit<Site, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Site> {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  const [newSite] = await db
    .insert(sites)
    .values({
      userId: session.user.id,
      name: site.name,
      latitude: site.latitude.toString(),
      longitude: site.longitude.toString(),
      elevation: site.elevation,
      idealWindDirections: site.idealWindDirections,
      maxWindSpeed: site.maxWindSpeed,
      notes: site.notes ?? null,
    })
    .returning();

  revalidatePath('/sites');
  return dbSiteToAppSite(newSite);
}

/**
 * Update an existing site (must be owned by authenticated user)
 */
export async function updateSite(
  id: string,
  updates: Partial<Omit<Site, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<Site | null> {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  // Build the update object, converting types as needed
  const updateData: Partial<typeof sites.$inferInsert> = {};

  if (updates.name !== undefined) updateData.name = updates.name;
  if (updates.latitude !== undefined) updateData.latitude = updates.latitude.toString();
  if (updates.longitude !== undefined) updateData.longitude = updates.longitude.toString();
  if (updates.elevation !== undefined) updateData.elevation = updates.elevation;
  if (updates.idealWindDirections !== undefined) updateData.idealWindDirections = updates.idealWindDirections;
  if (updates.maxWindSpeed !== undefined) updateData.maxWindSpeed = updates.maxWindSpeed;
  if (updates.notes !== undefined) updateData.notes = updates.notes ?? null;

  // Always update the updatedAt timestamp
  updateData.updatedAt = new Date();

  const [updatedSite] = await db
    .update(sites)
    .set(updateData)
    .where(and(eq(sites.id, id), eq(sites.userId, session.user.id)))
    .returning();

  if (!updatedSite) {
    return null;
  }

  revalidatePath('/sites');
  return dbSiteToAppSite(updatedSite);
}

/**
 * Delete a site (must be owned by authenticated user)
 */
export async function deleteSite(id: string): Promise<void> {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  await db
    .delete(sites)
    .where(and(eq(sites.id, id), eq(sites.userId, session.user.id)));

  revalidatePath('/sites');
}
