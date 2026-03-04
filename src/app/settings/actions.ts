'use server';

import { revalidatePath } from 'next/cache';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { settings, pushSubscriptions } from '@/db/schema';
import { auth } from '@/auth';
import type { Settings } from '@/types';

const DEFAULT_SETTINGS: Settings = {
  notifications: {
    enabled: false,
    minScoreThreshold: 70,
    daysAhead: 2,
    sitePreferences: {},
  },
  updatedAt: new Date().toISOString(),
};

/**
 * Transform DB settings row to app Settings type
 */
async function dbSettingsToApp(
  dbSettings: typeof settings.$inferSelect,
  userId?: string
): Promise<Settings> {
  // Check if user has active push subscriptions
  let enabled = false;
  if (userId) {
    const subs = await db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, userId))
      .limit(1);
    enabled = subs.length > 0;
  }

  return {
    notifications: {
      enabled,
      minScoreThreshold: dbSettings.minScoreThreshold,
      daysAhead: dbSettings.daysAhead,
      sitePreferences: dbSettings.siteNotifications,
    },
    updatedAt: dbSettings.updatedAt.toISOString(),
  };
}

/**
 * Get current settings for authenticated user
 * Creates default settings if none exist
 * Returns default settings for unauthenticated users (demo mode)
 */
export async function getSettings(): Promise<Settings> {
  const session = await auth();

  // Unauthenticated users get default settings (for demo mode)
  if (!session?.user?.id) {
    return DEFAULT_SETTINGS;
  }

  // Try to get existing settings
  const [existingSettings] = await db
    .select()
    .from(settings)
    .where(eq(settings.userId, session.user.id))
    .limit(1);

  if (existingSettings) {
    return dbSettingsToApp(existingSettings, session.user.id);
  }

  // Create default settings if none exist
  const [newSettings] = await db
    .insert(settings)
    .values({
      userId: session.user.id,
      minScoreThreshold: 70,
      daysAhead: 2,
      siteNotifications: {},
    })
    .returning();

  return dbSettingsToApp(newSettings, session.user.id);
}

/**
 * Update settings for authenticated user
 */
export async function updateSettings(
  updates: Partial<Settings['notifications']>
): Promise<Settings> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  // Build update object with only provided fields
  const updateData: {
    minScoreThreshold?: number;
    daysAhead?: number;
    siteNotifications?: Record<string, boolean>;
    updatedAt: Date;
  } = {
    updatedAt: new Date(),
  };

  if (updates.minScoreThreshold !== undefined) {
    updateData.minScoreThreshold = updates.minScoreThreshold;
  }
  if (updates.daysAhead !== undefined) {
    updateData.daysAhead = updates.daysAhead;
  }
  if (updates.sitePreferences !== undefined) {
    updateData.siteNotifications = updates.sitePreferences;
  }

  // Use upsert pattern: insert or update if exists
  const [updatedSettings] = await db
    .insert(settings)
    .values({
      userId: session.user.id,
      minScoreThreshold: updates.minScoreThreshold ?? 70,
      daysAhead: updates.daysAhead ?? 2,
      siteNotifications: updates.sitePreferences ?? {},
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: settings.userId,
      set: updateData,
    })
    .returning();

  revalidatePath('/settings');
  revalidatePath('/'); // Revalidate dashboard to update notification indicators
  return dbSettingsToApp(updatedSettings, session.user.id);
}

/**
 * Toggle notifications for a specific site
 */
export async function toggleSiteNotifications(
  siteId: string,
  enabled: boolean
): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  // Get current settings to merge site preferences
  const currentSettings = await getSettings();
  const updatedSitePreferences = {
    ...currentSettings.notifications.sitePreferences,
    [siteId]: enabled,
  };

  // Update with merged site preferences
  await db
    .insert(settings)
    .values({
      userId: session.user.id,
      minScoreThreshold: currentSettings.notifications.minScoreThreshold,
      daysAhead: currentSettings.notifications.daysAhead,
      siteNotifications: updatedSitePreferences,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: settings.userId,
      set: {
        siteNotifications: updatedSitePreferences,
        updatedAt: new Date(),
      },
    });

  revalidatePath('/settings');
  revalidatePath('/'); // Revalidate dashboard
}
