import { useLoaderData } from 'react-router';
import type { Route } from './+types/_auth.settings';
import { getDb } from '~/app/lib/db.server';
import { requireAuth } from '~/app/lib/auth.server';
import {
  settings,
  pushSubscriptions,
  userFavoriteSites,
  launchSites,
  type SiteNotificationPreferences,
} from '~/db/schema';
import { eq, and } from 'drizzle-orm';
import { SettingsClient } from '~/components/settings-client';

export function meta() {
  return [{ title: 'Settings | SoarCast' }];
}

const DEFAULT_SETTINGS = {
  notifications: {
    enabled: false,
    minScoreThreshold: 70,
    daysAhead: 2,
    sitePreferences: {} as Record<string, boolean>,
    siteMinRatings: {} as Record<string, 'Good' | 'Great' | 'Epic' | undefined>,
  },
  emailDigest: { enabled: false, digestTime: '08:00' },
  updatedAt: new Date().toISOString(),
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env as Env;
  const session = await requireAuth(request, env);
  const db = getDb(env);
  const userId = session.user.id;

  // Get settings, push subscriptions, and favorite sites in parallel
  const [[dbSettings], subs, favorites] = await Promise.all([
    db.select().from(settings).where(eq(settings.userId, userId)).limit(1),
    db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId)).limit(1),
    db
      .select({ favorite: userFavoriteSites, site: launchSites })
      .from(userFavoriteSites)
      .innerJoin(launchSites, eq(launchSites.id, userFavoriteSites.siteId))
      .where(eq(userFavoriteSites.userId, userId)),
  ]);

  let appSettings = DEFAULT_SETTINGS;

  if (dbSettings) {
    const enabled = subs.length > 0;
    const legacySitePreferences: Record<string, boolean> = {};
    const siteMinRatings: Record<string, 'Good' | 'Great' | 'Epic' | undefined> = {};
    for (const [siteId, prefs] of Object.entries(dbSettings.siteNotifications)) {
      legacySitePreferences[siteId] = prefs.enabled ?? true;
      siteMinRatings[siteId] = prefs.minRating;
    }

    appSettings = {
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

  const sites = favorites.map((f) => ({
    id: f.site.id,
    name: f.site.name,
    latitude: f.site.latitude,
    longitude: f.site.longitude,
    elevation: f.site.altitude ?? 0,
    customMaxWind: f.favorite.customMaxWind,
    defaultMaxWind: f.site.maxWindSpeed,
  }));

  return {
    settings: appSettings,
    sites,
    vapidPublicKey: env.VAPID_PUBLIC_KEY || '',
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env as Env;
  const session = await requireAuth(request, env);
  const db = getDb(env);
  const userId = session.user.id;
  const formData = await request.formData();
  const intent = formData.get('intent') as string;

  switch (intent) {
    case 'updateSettings': {
      const minScoreThreshold = parseInt(formData.get('minScoreThreshold') as string) || 70;
      const daysAhead = parseInt(formData.get('daysAhead') as string) || 2;

      await db
        .insert(settings)
        .values({
          userId,
          minScoreThreshold,
          daysAhead,
          siteNotifications: {},
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: settings.userId,
          set: { minScoreThreshold, daysAhead, updatedAt: new Date() },
        });
      return { success: true };
    }

    case 'toggleSiteNotifications': {
      const siteId = formData.get('siteId') as string;
      const enabled = formData.get('enabled') === 'true';

      const [current] = await db
        .select()
        .from(settings)
        .where(eq(settings.userId, userId))
        .limit(1);

      const updated: Record<string, SiteNotificationPreferences> = {
        ...current?.siteNotifications,
        [siteId]: { enabled },
      };

      await db
        .insert(settings)
        .values({
          userId,
          minScoreThreshold: current?.minScoreThreshold ?? 70,
          daysAhead: current?.daysAhead ?? 2,
          siteNotifications: updated,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: settings.userId,
          set: { siteNotifications: updated, updatedAt: new Date() },
        });
      return { success: true };
    }

    case 'toggleEmailDigest': {
      const enabled = formData.get('enabled') === 'true';
      await db
        .insert(settings)
        .values({ userId, morningDigestEnabled: enabled, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: settings.userId,
          set: { morningDigestEnabled: enabled, updatedAt: new Date() },
        });
      return { success: true };
    }

    case 'updateDigestTime': {
      const time = formData.get('time') as string;
      if (!/^\d{2}:\d{2}$/.test(time)) return { error: 'Invalid time format' };

      await db
        .insert(settings)
        .values({ userId, morningDigestTime: time, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: settings.userId,
          set: { morningDigestTime: time, updatedAt: new Date() },
        });
      return { success: true };
    }

    case 'updateSiteMinRating': {
      const siteId = formData.get('siteId') as string;
      const minRating = (formData.get('minRating') as string) || undefined;

      const [current] = await db
        .select()
        .from(settings)
        .where(eq(settings.userId, userId))
        .limit(1);

      const currentPrefs = current?.siteNotifications?.[siteId] ?? {};
      const updated: Record<string, SiteNotificationPreferences> = {
        ...current?.siteNotifications,
        [siteId]: {
          ...currentPrefs,
          minRating: minRating as 'Good' | 'Great' | 'Epic' | undefined,
        },
      };

      await db
        .insert(settings)
        .values({
          userId,
          minScoreThreshold: current?.minScoreThreshold ?? 70,
          daysAhead: current?.daysAhead ?? 2,
          siteNotifications: updated,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: settings.userId,
          set: { siteNotifications: updated, updatedAt: new Date() },
        });
      return { success: true };
    }

    case 'updateSiteCustomMaxWind': {
      const siteId = formData.get('siteId') as string;
      const customMaxWind = formData.get('customMaxWind')
        ? parseInt(formData.get('customMaxWind') as string)
        : null;

      if (customMaxWind !== null && (customMaxWind < 10 || customMaxWind > 100)) {
        return { error: 'Wind speed must be between 10 and 100 km/h' };
      }

      await db
        .update(userFavoriteSites)
        .set({ customMaxWind })
        .where(and(eq(userFavoriteSites.userId, userId), eq(userFavoriteSites.siteId, siteId)));
      return { success: true };
    }

    case 'completeOnboarding': {
      await db
        .update(settings)
        .set({ onboardingCompleted: true, updatedAt: new Date() })
        .where(eq(settings.userId, userId));
      return { success: true };
    }

    default:
      return { error: 'Unknown action' };
  }
}

export default function SettingsPage() {
  const { settings: appSettings, sites, vapidPublicKey } = useLoaderData<typeof loader>();

  return (
    <SettingsClient initialSettings={appSettings} sites={sites} vapidPublicKey={vapidPublicKey} />
  );
}
