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
import { isSiteTerrain, terrainFromMeasure } from '~/lib/site-terrain';
import { customSiteToSite } from '~/lib/custom-sites';
import { launchSiteKind, launchSiteToSite } from '~/lib/launch-sites';
import {
  joinAreas,
  moveSite,
  renameArea,
  savedSiteKey,
  setAreaAlerts,
  syncAreas,
} from '~/app/lib/site-areas.server';

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
  experiments: false,
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
      experiments: dbSettings.showExperiments,
      updatedAt: dbSettings.updatedAt.toISOString(),
    };
  }

  // Sites are listed by area, the one first saved in first
  const { areas, areaOf } = await syncAreas(db, userId, [
    ...favorites.map((f) => ({
      key: savedSiteKey('launch', f.site.id),
      name: f.site.name,
      latitude: f.site.latitude,
      longitude: f.site.longitude,
      areaId: f.favorite.areaId,
      savedAt: f.favorite.createdAt,
    })),
    ...customs.map((c) => ({
      key: savedSiteKey('custom', c.id),
      name: c.name,
      latitude: parseFloat(c.latitude),
      longitude: parseFloat(c.longitude),
      areaId: c.areaId,
      savedAt: c.createdAt,
    })),
  ]);

  const sites = [
    ...customs.map((c) => ({
      id: c.id,
      key: savedSiteKey('custom', c.id),
      areaId: areaOf.get(savedSiteKey('custom', c.id)) ?? null,
      name: c.name,
      latitude: parseFloat(c.latitude),
      longitude: parseFloat(c.longitude),
      elevation: c.elevation,
      customMaxWind: null,
      defaultMaxWind: customSiteToSite(c).maxWindSpeed,
      custom: true,
      goal: customSiteToSite(c).goal!,
      kind: c.siteKind,
      terrain: c.terrain,
      measuredTerrain: terrainFromMeasure(c.terrainSlope, c.terrainRelief),
    })),
    ...favorites.map((f) => ({
      id: f.site.id,
      key: savedSiteKey('launch', f.site.id),
      areaId: areaOf.get(savedSiteKey('launch', f.site.id)) ?? null,
      name: f.site.name,
      latitude: f.site.latitude,
      longitude: f.site.longitude,
      elevation: f.site.altitude ?? 0,
      customMaxWind: f.favorite.customMaxWind,
      // The limit without the pilot's own: the listing's, or the usual one for its terrain
      defaultMaxWind: launchSiteToSite(f.site, { ...f.favorite, customMaxWind: null }).maxWindSpeed,
      custom: false,
      goal: launchSiteToSite(f.site, f.favorite).goal!,
      kind: f.favorite.siteKind,
      listedKind: launchSiteKind(f.site),
      terrain: f.favorite.terrain,
      measuredTerrain: terrainFromMeasure(f.site.terrainSlope, f.site.terrainRelief),
    })),
  ].sort((a, b) => a.name.localeCompare(b.name));

  return {
    settings: appSettings,
    sites,
    areas: areas.map((a) => ({ id: a.id, name: a.name, alerts: a.alerts })),
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

    case 'toggleExperiments': {
      const showExperiments = formData.get('enabled') === 'true';
      await db
        .insert(settings)
        .values({ userId, showExperiments, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: settings.userId,
          set: { showExperiments, updatedAt: new Date() },
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

    // What the pilot wants from a site, what it gives and the ground round
    // it: saved on their favorite of a listed site, or on their own site.
    // Empty resets to the default.
    case 'updateSiteGoal':
    case 'updateSiteKind':
    case 'updateSiteTerrain': {
      const siteId = formData.get('siteId');
      const value = formData.get('value');
      if (typeof siteId !== 'string' || !siteId) return { error: 'Missing site' };
      const valid =
        intent === 'updateSiteGoal'
          ? isSiteGoal(value)
          : intent === 'updateSiteKind'
            ? isSiteKind(value)
            : isSiteTerrain(value);
      if (value !== '' && !valid) return { error: 'Unknown choice' };
      const column =
        intent === 'updateSiteGoal' ? 'goal' : intent === 'updateSiteKind' ? 'siteKind' : 'terrain';
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

    // Areas: the places saved sites are grouped by
    case 'renameArea': {
      const ok = await renameArea(
        db,
        userId,
        String(formData.get('areaId') ?? ''),
        String(formData.get('name') ?? ''),
      );
      return ok ? { success: true } : { error: 'An area needs a name' };
    }

    case 'setAreaAlerts': {
      await setAreaAlerts(
        db,
        userId,
        String(formData.get('areaId') ?? ''),
        formData.get('enabled') === 'true',
      );
      return { success: true };
    }

    case 'joinArea': {
      const ok = await joinAreas(
        db,
        userId,
        String(formData.get('areaId') ?? ''),
        String(formData.get('into') ?? ''),
      );
      return ok ? { success: true } : { error: 'Unknown area' };
    }

    case 'moveSite': {
      const ok = await moveSite(
        db,
        userId,
        String(formData.get('siteKey') ?? ''),
        String(formData.get('areaId') ?? ''),
      );
      return ok ? { success: true } : { error: 'Unknown site or area' };
    }

    default:
      return { error: 'Unknown action' };
  }
}

export default function SettingsPage() {
  const { settings: appSettings, sites, areas, vapidPublicKey } = useLoaderData<typeof loader>();

  return (
    <SettingsClient
      initialSettings={appSettings}
      sites={sites}
      areas={areas}
      vapidPublicKey={vapidPublicKey}
    />
  );
}
