import type { ActionFunctionArgs } from 'react-router';
import { getDb } from '~/app/lib/db.server';
import {
  user as userTable,
  launchSites,
  userFavoriteSites,
  customSites,
  pushSubscriptions,
  settings as settingsTable,
} from '~/db/schema';
import { eq } from 'drizzle-orm';
import { customSiteToSite } from '~/lib/custom-sites';
import { launchSiteToSite } from '~/lib/launch-sites';
import {
  addDays,
  DEFAULT_DIGEST_TIME,
  dueAlertRun,
  localDate,
  resolveTimeZone,
} from '~/lib/alert-schedule';
import { getAtmosphericProfile, PROFILE_DAYS, setProfileDb } from '~/lib/weather-profile';
import {
  analyzeFlyingDay,
  generateNotification,
  generateMorningDigest,
  highlightText,
} from '~/lib/notifications';
import type { DayAnalysis } from '~/lib/notifications';
import type { AtmosphericProfile } from '~/lib/weather-profile';
import type { Site } from '~/types';
import webpush from 'web-push';
import { sendPush } from '~/lib/push-send';
import { mutedAreaIds } from '~/app/lib/site-areas.server';

/** The settings a pilot has before saving any: the schema's column defaults. */
function defaultSettings(userId: string, now: Date): typeof settingsTable.$inferSelect {
  return {
    id: '',
    userId,
    minScoreThreshold: 70,
    daysAhead: 2,
    siteNotifications: {},
    morningDigestEnabled: false,
    morningDigestTime: DEFAULT_DIGEST_TIME,
    timeZone: null,
    onboardingCompleted: false,
    updatedAt: now,
  };
}

export async function action({ request, context }: ActionFunctionArgs) {
  const env = context.cloudflare.env as Env;

  try {
    // Verify cron secret
    const authHeader = request.headers.get('authorization');
    if (env.CRON_SECRET && authHeader !== `Bearer ${env.CRON_SECRET}`) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = getDb(env);
    setProfileDb(db);

    // Configure VAPID keys
    if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
      console.error('VAPID keys not configured');
      return Response.json({ error: 'Push notifications not configured' }, { status: 500 });
    }

    webpush.setVapidDetails(
      'mailto:soarcast@mckinleyaviation.com',
      env.VAPID_PUBLIC_KEY,
      env.VAPID_PRIVATE_KEY,
    );

    const allUsers = await db.select().from(userTable);
    let totalNotificationsSent = 0;
    let totalErrors = 0;

    // The Worker's hourly cron posts here (worker.ts); each user's runs are
    // due at their own local hours. `?run=morning|evening` runs one for
    // everyone now, for testing.
    const now = new Date();
    const forcedRun = new URL(request.url).searchParams.get('run');

    for (const user of allUsers) {
      try {
        const [savedSettings] = await db
          .select()
          .from(settingsTable)
          .where(eq(settingsTable.userId, user.id))
          .limit(1);
        // Pilots who signed up before sign-up created a settings row get the defaults
        const userSettings = savedSettings ?? defaultSettings(user.id, now);

        const run =
          forcedRun === 'morning' || forcedRun === 'evening'
            ? forcedRun
            : dueAlertRun(now, userSettings.timeZone, userSettings.morningDigestTime);
        if (!run) continue;
        const isMorningRun = run === 'morning';
        const todayStr = localDate(now, resolveTimeZone(userSettings.timeZone));

        const subscriptions = await db
          .select()
          .from(pushSubscriptions)
          .where(eq(pushSubscriptions.userId, user.id));

        // The digest can go by email alone; site alerts are push only.
        const wantsEmailDigest =
          isMorningRun && userSettings.morningDigestEnabled && !!env.EMAIL && !!user.email;
        if (subscriptions.length === 0 && !wantsEmailDigest) continue;

        // Get user's monitored sites from both favorite launch sites and custom sites
        const favoriteSitesResult = await db
          .select({ favorite: userFavoriteSites, site: launchSites })
          .from(userFavoriteSites)
          .innerJoin(launchSites, eq(userFavoriteSites.siteId, launchSites.id))
          .where(eq(userFavoriteSites.userId, user.id));

        const customSitesResult = await db
          .select()
          .from(customSites)
          .where(eq(customSites.userId, user.id));

        // Each with the pilot's goal for it, which decides what is worth an
        // alert; sites in an area with alerts off are left out
        const muted = await mutedAreaIds(db, user.id);
        const alerting = (areaId: string | null) => !areaId || !muted.has(areaId);
        const userSites: Site[] = [
          ...favoriteSitesResult
            .filter((f) => alerting(f.favorite.areaId))
            .map((f) => launchSiteToSite(f.site, f.favorite)),
          ...customSitesResult.filter((c) => alerting(c.areaId)).map(customSiteToSite),
        ];
        if (userSites.length === 0) continue;
        // Where an alert about each site opens
        const siteUrls = new Map<string, string>([
          ...favoriteSitesResult.map((f) => [f.site.id, `/sites/${f.site.slug}`] as const),
          ...customSitesResult.map((s) => [s.id, `/sites/custom/${s.id}`] as const),
        ]);

        // Morning digest
        if (isMorningRun && userSettings.morningDigestEnabled) {
          try {
            const siteAnalyses: Array<{
              site: Site;
              analysis: DayAnalysis;
              profile: AtmosphericProfile;
            }> = [];

            for (const site of userSites) {
              if (userSettings.siteNotifications[site.id]?.enabled === false) continue;

              try {
                const atmosphericResult = await getAtmosphericProfile(
                  site.latitude,
                  site.longitude,
                  1,
                );

                const siteObj = site;

                const analysis = analyzeFlyingDay(atmosphericResult.profile, siteObj, todayStr);
                if (analysis) {
                  siteAnalyses.push({
                    site: siteObj,
                    analysis,
                    profile: atmosphericResult.profile,
                  });
                }
              } catch (error) {
                console.error(`Error analyzing site ${site.id} for digest:`, error);
              }
            }

            if (siteAnalyses.length > 0) {
              const digestNotification = generateMorningDigest(siteAnalyses, todayStr);
              const payload = JSON.stringify(digestNotification);

              for (const subscription of subscriptions) {
                try {
                  await sendPush(
                    { endpoint: subscription.endpoint, keys: subscription.keys },
                    payload,
                  );
                  totalNotificationsSent++;
                } catch (error: unknown) {
                  console.error(`Failed to send digest to ${subscription.endpoint}:`, error);
                  if (
                    error &&
                    typeof error === 'object' &&
                    'statusCode' in error &&
                    error.statusCode === 410
                  ) {
                    await db
                      .delete(pushSubscriptions)
                      .where(eq(pushSubscriptions.endpoint, subscription.endpoint));
                  }
                  totalErrors++;
                }
              }

              // Send email digest (Cloudflare Email Sending; skipped if the binding is absent)
              if (env.EMAIL && user.email) {
                // Imported here, not at the top: react-email takes hundreds of
                // ms to initialize, and Cloudflare caps the Worker's startup CPU
                const { describeEmailError, sendMorningDigestEmail } =
                  await import('~/emails/send');
                try {
                  const dateLabel = new Date(todayStr + 'T12:00:00').toLocaleDateString('en-US', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  });

                  const emailSites = siteAnalyses.map(({ site, analysis }) => ({
                    name: site.name,
                    url: siteUrls.get(site.id),
                    status: analysis.status,
                    headline: analysis.headline,
                    detail:
                      analysis.verdict === 'no' ? analysis.limitingFactor : highlightText(analysis),
                    concern:
                      analysis.verdict === 'go'
                        ? analysis.hazard
                        : analysis.verdict === 'marginal'
                          ? analysis.limitingFactor
                          : null,
                  }));

                  await sendMorningDigestEmail(env.EMAIL, {
                    to: user.email,
                    date: dateLabel,
                    sites: emailSites,
                  });
                  totalNotificationsSent++;
                } catch (emailError) {
                  console.error(
                    `Failed to send email digest to ${user.email}: ${describeEmailError(emailError)}`,
                  );
                  totalErrors++;
                }
              }

              continue;
            }
          } catch (error) {
            console.error(`Error generating morning digest for user ${user.id}:`, error);
            totalErrors++;
          }
        }

        // Individual site notifications
        if (subscriptions.length === 0) continue;
        for (const site of userSites) {
          if (userSettings.siteNotifications[site.id]?.enabled === false) continue;

          try {
            const atmosphericResult = await getAtmosphericProfile(
              site.latitude,
              site.longitude,
              Math.min(userSettings.daysAhead + 1, PROFILE_DAYS),
            );

            const siteObj = site;

            // By the evening run today is over: look from tomorrow
            const firstDay = isMorningRun ? 0 : 1;
            for (
              let dayOffset = firstDay;
              dayOffset < firstDay + userSettings.daysAhead;
              dayOffset++
            ) {
              const dateStr = addDays(todayStr, dayOffset);

              const analysis = analyzeFlyingDay(atmosphericResult.profile, siteObj, dateStr);

              // A go: flyable, with the flight the pilot's goal for the site asks for
              if (analysis?.status === 'go') {
                const payload = JSON.stringify(
                  generateNotification(
                    siteObj,
                    analysis,
                    siteUrls.get(site.id) ?? '/dashboard',
                    todayStr,
                  ),
                );

                for (const subscription of subscriptions) {
                  try {
                    await sendPush(
                      { endpoint: subscription.endpoint, keys: subscription.keys },
                      payload,
                    );
                    totalNotificationsSent++;
                  } catch (error: unknown) {
                    console.error(
                      `Failed to send notification to ${subscription.endpoint}:`,
                      error,
                    );
                    if (
                      error &&
                      typeof error === 'object' &&
                      'statusCode' in error &&
                      error.statusCode === 410
                    ) {
                      await db
                        .delete(pushSubscriptions)
                        .where(eq(pushSubscriptions.endpoint, subscription.endpoint));
                    }
                    totalErrors++;
                  }
                }

                break; // One notification per site
              }
            }
          } catch (error) {
            console.error(`Error checking site ${site.id}:`, error);
            totalErrors++;
          }
        }
      } catch (error) {
        console.error(`Error processing user ${user.id}:`, error);
        totalErrors++;
      }
    }

    return Response.json({
      success: true,
      notificationsSent: totalNotificationsSent,
      errors: totalErrors,
    });
  } catch (error) {
    console.error('Error in notification check:', error);
    return Response.json({ error: 'Failed to check notifications' }, { status: 500 });
  }
}
