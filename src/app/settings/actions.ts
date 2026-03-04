'use server';

import { revalidatePath } from 'next/cache';
import { readJSON, updateJSON } from '@/lib/storage';
import type { Settings, SettingsData } from '@/types';

const SETTINGS_FILE = 'settings.json';

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
 * Get current settings
 */
export async function getSettings(): Promise<Settings> {
  const data = await readJSON<SettingsData>(SETTINGS_FILE, {
    settings: DEFAULT_SETTINGS,
  });
  return data.settings;
}

/**
 * Update settings
 */
export async function updateSettings(
  updates: Partial<Settings['notifications']>
): Promise<Settings> {
  let updatedSettings: Settings | null = null;

  await updateJSON<SettingsData>(
    SETTINGS_FILE,
    { settings: DEFAULT_SETTINGS },
    (data) => {
      updatedSettings = {
        notifications: {
          ...data.settings.notifications,
          ...updates,
        },
        updatedAt: new Date().toISOString(),
      };

      return { settings: updatedSettings };
    }
  );

  revalidatePath('/settings');
  revalidatePath('/'); // Revalidate dashboard to update notification indicators
  return updatedSettings!;
}

/**
 * Toggle notifications for a specific site
 */
export async function toggleSiteNotifications(
  siteId: string,
  enabled: boolean
): Promise<void> {
  await updateJSON<SettingsData>(
    SETTINGS_FILE,
    { settings: DEFAULT_SETTINGS },
    (data) => {
      const updatedSettings: Settings = {
        notifications: {
          ...data.settings.notifications,
          sitePreferences: {
            ...data.settings.notifications.sitePreferences,
            [siteId]: enabled,
          },
        },
        updatedAt: new Date().toISOString(),
      };

      return { settings: updatedSettings };
    }
  );

  revalidatePath('/settings');
  revalidatePath('/'); // Revalidate dashboard
}
