import { useLoaderData } from 'react-router';
import type { Route } from './+types/_auth.settings';
import { getDb } from '~/app/lib/db.server';
import { requireAuth } from '~/app/lib/auth.server';
import {
  settings,
  pushSubscriptions,
  userFavoriteSites,
  launchSites,
  customSites,
  type SiteNotificationPreferences,
} from '~/db/schema';
import { eq, and, asc } from 'drizzle-orm';
import { SettingsClient } from '~/components/settings-client';
import { isValidTimeZone } from '~/lib/alert-schedule';
import { isSiteGoal, isSiteKind } from '~/lib/site-goals';
import { customSiteToSite } from '~/lib/custom-sites';
import { launchSiteKind, launchSiteToSite } from '~/lib/launch-sites';

export function meta() {
  return [{ title: 'Settings | SoarCast' }];
}

const DEFAULT_SETTINGS = {
  notifications: {
    enabled: false,
    daysAhead: 2,
    sitePreferences: {} as Record<string, boolean>,
  },
  emailDigest: { enabled: false, digestTime: '08:00' },
  updatedAt: new Date().toISOString(),
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env as Env;
  const session = await requireAuth(request, env);
  const db = getDb(env);
  const userId = session.user.id;

  // Get settings, push subscriptions, and the user's sites in parallel
  const [[dbSettings], subs, favorites, customs] = await Promise.all([
    db.select().from(settings).where(eq(settings.userId, userId)).limit(1),
    db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId)).limit(1),
    db
      .select({ favorite: userFavoriteSites, site: launchSites })
      .from(userFavoriteSites)
      .innerJoin(launchSites, eq(launchSites.id, userFavoriteSites.siteId))
      .where(eq(userFavoriteSites.userId, userId)),
    db
      .select()
      .from(customSites)
      .where(eq(customSites.userId, userId))
      .orderBy(asc(customSites.name)),
  ]);

  let appSettings = DEFAULT_SETTINGS;

  if (dbSettings) {
    const enabled = subs.length > 0;
    const legacySitePreferences: Record<string, boolean> = {};
    for (const [siteId, prefs] of Object.entries(dbSettings.siteNotifications)) {
      legacySitePreferences[siteId] = prefs.enabled ?? true;
    }

    appSettings = {
      notifications: {
        enabled,
        daysAhead: dbSettings.daysAhead,
        sitePreferences: legacySitePreferences,
      },
      emailDigest: {
        enabled: dbSettings.morningDigestEnabled,
        digestTime: dbSettings.morningDigestTime ?? '08:00',
      },
      updatedAt: dbSettings.updatedAt.toISOString(),
    };
  }

  const sites = [
    ...customs.map((c) => ({
      id: c.id,
      name: c.name,
      latitude: parseFloat(c.latitude),
      longitude: parseFloat(c.longitude),
      elevation: c.elevation,
      customMaxWind: null,
      defaultMaxWind: c.maxWindSpeed,
      custom: true,
      goal: customSiteToSite(c).goal!,
      kind: c.siteKind,
    })),
    ...favorites.map((f) => ({
      id: f.site.id,
      name: f.site.name,
      latitude: f.site.latitude,
      longitude: f.site.longitude,
      elevation: f.site.altitude ?? 0,
      customMaxWind: f.favorite.customMaxWind,
      defaultMaxWind: f.site.maxWindSpeed,
      custom: false,
      goal: launchSiteToSite(f.site, f.favorite).goal!,
      kind: f.favorite.siteKind,
      listedKind: launchSiteKind(f.site),
    })),
  ];

  return {
    settings: appSettings,
    sites,
    vapidPublicKey: env.VAPID_PUBLIC_KEY || '',
  };
}

// The digest goes out at the user's local time, so digest changes carry the
// browser's IANA time zone.
function browserTimeZone(formData: FormData): string | null {
  const timeZone = formData.get('timeZone');
  return typeof timeZone === 'string' && isValidTimeZone(timeZone) ? timeZone : null;
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
      // Saves only the fields sent, so a missing one is never reset
      const days = parseInt(formData.get('daysAhead') as string);
      const changes = {
        ...(days >= 1 && days <= 7 && { daysAhead: days }),
        updatedAt: new Date(),
      };

      await db
        .insert(settings)
        .values({ userId, ...changes })
        .onConflictDoUpdate({ target: settings.userId, set: changes });
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
      const timeZone = browserTimeZone(formData);
      await db
        .insert(settings)
        .values({ userId, morningDigestEnabled: enabled, timeZone, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: settings.userId,
          set: {
            morningDigestEnabled: enabled,
            ...(timeZone && { timeZone }),
            updatedAt: new Date(),
          },
        });
      return { success: true };
    }

    case 'updateDigestTime': {
      const time = formData.get('digestTime') as string;
      if (!/^\d{2}:\d{2}$/.test(time)) return { error: 'Invalid time format' };

      const timeZone = browserTimeZone(formData);
      await db
        .insert(settings)
        .values({ userId, morningDigestTime: time, timeZone, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: settings.userId,
          set: { morningDigestTime: time, ...(timeZone && { timeZone }), updatedAt: new Date() },
        });
      return { success: true };
    }

    // What the pilot wants from a site, and what it gives: saved on their
    // favorite of a listed site, or on their own site. Empty resets to the default.
    case 'updateSiteGoal':
    case 'updateSiteKind': {
      const siteId = formData.get('siteId');
      const value = formData.get('value');
      if (typeof siteId !== 'string' || !siteId) return { error: 'Missing site' };
      const valid = intent === 'updateSiteGoal' ? isSiteGoal(value) : isSiteKind(value);
      if (value !== '' && !valid) return { error: 'Unknown choice' };
      const column = intent === 'updateSiteGoal' ? 'goal' : 'siteKind';
      const change = { [column]: value === '' ? null : value };

      const custom = formData.get('source') === 'custom';
      if (custom) {
        await db
          .update(customSites)
          .set({ ...change, updatedAt: new Date() })
          .where(and(eq(customSites.id, siteId), eq(customSites.userId, userId)));
      } else {
        await db
          .update(userFavoriteSites)
          .set(change)
          .where(and(eq(userFavoriteSites.userId, userId), eq(userFavoriteSites.siteId, siteId)));
      }
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
