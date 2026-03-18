'use server';

import { revalidatePath } from 'next/cache';
import { eq, and } from 'drizzle-orm';
import { db } from '@/db';
import { settings, pushSubscriptions, userFavoriteSites, type SiteNotificationPreferences } from '@/db/schema';
import { auth } from '@/auth';
import type { Settings } from '@/types';

const DEFAULT_SETTINGS: Settings = {
  notifications: {
    enabled: false,
    minScoreThreshold: 70,
    daysAhead: 2,
    sitePreferences: {},
    siteMinRatings: {},
  },
  emailDigest: { enabled: false, digestTime: '08:00' },
  updatedAt: new Date().toISOString(),
};

/**
 * Transform DB settings row to app Settings type
 */
async function dbSettingsToApp(
  dbSettings: typeof settings.$inferSelect,
  userId?: string,
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

  // Convert new SiteNotificationPreferences format to old boolean format for backward compat
  const legacySitePreferences: Record<string, boolean> = {};
  const siteMinRatings: Record<string, 'Good' | 'Great' | 'Epic' | undefined> = {};
  for (const [siteId, prefs] of Object.entries(dbSettings.siteNotifications)) {
    legacySitePreferences[siteId] = prefs.enabled ?? true;
    siteMinRatings[siteId] = prefs.minRating;
  }

  return {
    notifications: {
      enabled,
      minScoreThreshold: dbSettings.minScoreThreshold,
      daysAhead: dbSettings.daysAhead,
      sitePreferences: legacySitePreferences,
      siteMinRatings,
    },
    emailDigest: {
      enabled: dbSettings.morningDigestEnabled,
      digestTime: dbSettings.morningDigestTime ?? '08:00',
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
  updates: Partial<Settings['notifications']>,
): Promise<Settings> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  // Convert legacy boolean format to new SiteNotificationPreferences format
  let convertedSiteNotifications: Record<string, SiteNotificationPreferences> | undefined;
  if (updates.sitePreferences !== undefined) {
    convertedSiteNotifications = {};
    for (const [siteId, enabled] of Object.entries(updates.sitePreferences)) {
      convertedSiteNotifications[siteId] = { enabled };
    }
  }

  // Build update object with only provided fields
  const updateData: {
    minScoreThreshold?: number;
    daysAhead?: number;
    siteNotifications?: Record<string, SiteNotificationPreferences>;
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
  if (convertedSiteNotifications !== undefined) {
    updateData.siteNotifications = convertedSiteNotifications;
  }

  // Use upsert pattern: insert or update if exists
  const [updatedSettings] = await db
    .insert(settings)
    .values({
      userId: session.user.id,
      minScoreThreshold: updates.minScoreThreshold ?? 70,
      daysAhead: updates.daysAhead ?? 2,
      siteNotifications: convertedSiteNotifications ?? {},
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
export async function toggleSiteNotifications(siteId: string, enabled: boolean): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  // Get current DB settings
  const [currentDbSettings] = await db
    .select()
    .from(settings)
    .where(eq(settings.userId, session.user.id))
    .limit(1);

  // Merge site preferences in new format
  const updatedSitePreferences: Record<string, SiteNotificationPreferences> = {
    ...currentDbSettings?.siteNotifications,
    [siteId]: { enabled },
  };

  // Update with merged site preferences
  await db
    .insert(settings)
    .values({
      userId: session.user.id,
      minScoreThreshold: currentDbSettings?.minScoreThreshold ?? 70,
      daysAhead: currentDbSettings?.daysAhead ?? 2,
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

/**
 * Toggle email morning digest for the current user
 */
export async function toggleEmailDigest(enabled: boolean): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  await db
    .insert(settings)
    .values({
      userId: session.user.id,
      morningDigestEnabled: enabled,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: settings.userId,
      set: { morningDigestEnabled: enabled, updatedAt: new Date() },
    });

  revalidatePath('/settings');
}

/**
 * Update the morning digest delivery time
 */
export async function updateDigestTime(time: string): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  // Validate HH:MM format
  if (!/^\d{2}:\d{2}$/.test(time)) {
    throw new Error('Invalid time format. Use HH:MM.');
  }

  await db
    .insert(settings)
    .values({
      userId: session.user.id,
      morningDigestTime: time,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: settings.userId,
      set: { morningDigestTime: time, updatedAt: new Date() },
    });

  revalidatePath('/settings');
}

/**
 * Update the minimum rating threshold for a specific site's notifications
 */
export async function updateSiteMinRating(
  siteId: string,
  minRating: 'Good' | 'Great' | 'Epic' | undefined,
): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  const [currentDbSettings] = await db
    .select()
    .from(settings)
    .where(eq(settings.userId, session.user.id))
    .limit(1);

  const currentPrefs = currentDbSettings?.siteNotifications?.[siteId] ?? {};
  const updatedSitePreferences: Record<string, SiteNotificationPreferences> = {
    ...currentDbSettings?.siteNotifications,
    [siteId]: { ...currentPrefs, minRating },
  };

  await db
    .insert(settings)
    .values({
      userId: session.user.id,
      minScoreThreshold: currentDbSettings?.minScoreThreshold ?? 70,
      daysAhead: currentDbSettings?.daysAhead ?? 2,
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
}

/**
 * Mark onboarding as completed for the current user
 */
export async function completeOnboarding(): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  await db
    .update(settings)
    .set({
      onboardingCompleted: true,
      updatedAt: new Date(),
    })
    .where(eq(settings.userId, session.user.id));

  revalidatePath('/dashboard');
}

/**
 * Update the custom max wind speed for a specific favorited site
 */
export async function updateSiteCustomMaxWind(
  siteId: string,
  customMaxWind: number | null,
): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  if (customMaxWind !== null && (customMaxWind < 10 || customMaxWind > 100)) {
    throw new Error('Wind speed must be between 10 and 100 km/h');
  }

  await db
    .update(userFavoriteSites)
    .set({ customMaxWind })
    .where(
      and(
        eq(userFavoriteSites.userId, session.user.id),
        eq(userFavoriteSites.siteId, siteId),
      ),
    );

  revalidatePath('/settings');
  revalidatePath('/dashboard');
}

/**
 * Check if user has completed onboarding
 * Returns true if:
 * - User has explicitly completed onboarding (onboardingCompleted flag)
 * - OR user already has sites (favorites or custom sites)
 */
export async function getOnboardingStatus(): Promise<boolean> {
  const session = await auth();
  if (!session?.user?.id) {
    return true; // Unauthenticated users don't need onboarding
  }

  const [userSettings] = await db
    .select({ onboardingCompleted: settings.onboardingCompleted })
    .from(settings)
    .where(eq(settings.userId, session.user.id))
    .limit(1);

  // If user has explicitly completed onboarding, respect that
  if (userSettings?.onboardingCompleted) {
    return true;
  }

  // Check if user has any sites (favorites or custom sites)
  const { userFavoriteSites, customSites } = await import('@/db/schema');

  const [favorites, custom] = await Promise.all([
    db
      .select({ id: userFavoriteSites.id })
      .from(userFavoriteSites)
      .where(eq(userFavoriteSites.userId, session.user.id))
      .limit(1),
    db
      .select({ id: customSites.id })
      .from(customSites)
      .where(eq(customSites.userId, session.user.id))
      .limit(1),
  ]);

  // If user has any sites, they don't need onboarding
  if (favorites.length > 0 || custom.length > 0) {
    return true;
  }

  // User has no sites and hasn't completed onboarding
  return false;
}
