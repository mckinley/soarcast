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
import { getIdealWindDirections, getOkWindDirections } from '~/lib/site-utils';
import { DEFAULT_MAX_WIND_KMH } from '~/lib/forecast-engine';
import { addDays, dueAlertRun, localDate, resolveTimeZone } from '~/lib/alert-schedule';
import { getAtmosphericProfile, setProfileDb } from '~/lib/weather-profile';
import { analyzeFlyingDay, generateNotification, generateMorningDigest } from '~/lib/notifications';
import type { DayAnalysis } from '~/lib/notifications';
import type { AtmosphericProfile } from '~/lib/weather-profile';
import type { Site } from '~/types';
import webpush from 'web-push';
import { sendPush } from '~/lib/push-send';

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
        const [userSettings] = await db
          .select()
          .from(settingsTable)
          .where(eq(settingsTable.userId, user.id))
          .limit(1);

        if (!userSettings) continue;

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
          .select({
            id: launchSites.id,
            name: launchSites.name,
            latitude: launchSites.latitude,
            longitude: launchSites.longitude,
            altitude: launchSites.altitude,
            windN: launchSites.windN,
            windNe: launchSites.windNe,
            windE: launchSites.windE,
            windSe: launchSites.windSe,
            windS: launchSites.windS,
            windSw: launchSites.windSw,
            windW: launchSites.windW,
            windNw: launchSites.windNw,
            maxWindSpeed: launchSites.maxWindSpeed,
            customMaxWind: userFavoriteSites.customMaxWind,
            createdAt: launchSites.createdAt,
            updatedAt: launchSites.updatedAt,
          })
          .from(userFavoriteSites)
          .innerJoin(launchSites, eq(userFavoriteSites.siteId, launchSites.id))
          .where(eq(userFavoriteSites.userId, user.id));

        const customSitesResult = await db
          .select()
          .from(customSites)
          .where(eq(customSites.userId, user.id));

        // Map both to Site interface
        const userSites: Site[] = [
          ...favoriteSitesResult.map((s) => ({
            id: s.id,
            name: s.name,
            latitude: s.latitude as number,
            longitude: s.longitude as number,
            elevation: s.altitude || 0,
            idealWindDirections: getIdealWindDirections(s),
            okWindDirections: getOkWindDirections(s),
            maxWindSpeed: s.customMaxWind || s.maxWindSpeed || DEFAULT_MAX_WIND_KMH,
            createdAt: new Date((s.createdAt as unknown as number) * 1000).toISOString(),
            updatedAt: new Date((s.updatedAt as unknown as number) * 1000).toISOString(),
          })),
          ...customSitesResult.map((s) => ({
            id: s.id,
            name: s.name,
            latitude: parseFloat(s.latitude),
            longitude: parseFloat(s.longitude),
            elevation: s.elevation || 0,
            idealWindDirections: (s.idealWindDirections as number[]) || [],
            maxWindSpeed: s.maxWindSpeed || DEFAULT_MAX_WIND_KMH,
            createdAt: new Date((s.createdAt as unknown as number) * 1000).toISOString(),
            updatedAt: new Date((s.updatedAt as unknown as number) * 1000).toISOString(),
          })),
        ];
        if (userSites.length === 0) continue;

        // Morning digest
        if (isMorningRun && userSettings.morningDigestEnabled) {
          try {
            const siteAnalyses: Array<{
              site: Site;
              analysis: DayAnalysis;
              profile: AtmosphericProfile;
            }> = [];

            for (const site of userSites) {
              const sitePrefs = (
                userSettings.siteNotifications as Record<
                  string,
                  { enabled?: boolean; minRating?: 'Good' | 'Great' | 'Epic' }
                >
              )[site.id];

              if (sitePrefs?.enabled === false) continue;

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

                  const emailSites = siteAnalyses.map(
                    ({ site, analysis, profile: siteProfile }) => {
                      const todayHours = siteProfile.hours.filter((h) =>
                        h.time.startsWith(todayStr),
                      );
                      const peakWStar =
                        todayHours.reduce((max, h) => {
                          const ws = h.derived.wStar;
                          return ws !== null && ws > max ? ws : max;
                        }, 0) || null;

                      let topConcern: string | null = null;
                      if (analysis.concerns.length > 0) {
                        const concern = analysis.concerns[0];
                        if (
                          concern.toLowerCase().includes('overdevelopment') ||
                          concern.toLowerCase().includes('storm')
                        ) {
                          topConcern = 'OD Risk';
                        } else if (concern.toLowerCase().includes('shear')) {
                          topConcern = 'High wind shear';
                        } else if (
                          concern.toLowerCase().includes('upper') ||
                          concern.toLowerCase().includes('850')
                        ) {
                          topConcern = 'Strong upper winds';
                        } else {
                          topConcern = concern;
                        }
                      }

                      const ceilingMatch = analysis.topOfLift?.match(/(\d[\d,]*)\s*ft/);
                      const peakCeilingFt = ceilingMatch
                        ? parseInt(ceilingMatch[1].replace(',', ''))
                        : null;

                      return {
                        name: site.name,
                        score: Math.round(analysis.score),
                        label: analysis.rating as 'Epic' | 'Great' | 'Good' | 'Fair' | 'Poor',
                        wStar: peakWStar,
                        bestWindow: analysis.bestWindow,
                        topConcern,
                        peakCeilingFt,
                      };
                    },
                  );

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
          const siteNotifications = userSettings.siteNotifications as Record<
            string,
            { enabled?: boolean; minRating?: 'Good' | 'Great' | 'Epic'; notifyTime?: string }
          >;
          const sitePrefs = siteNotifications[site.id];
          if (sitePrefs?.enabled === false) continue;

          const minRatingMap: Record<string, number> = { Good: 51, Great: 71, Epic: 86 };
          const siteMinScore = sitePrefs?.minRating
            ? minRatingMap[sitePrefs.minRating]
            : userSettings.minScoreThreshold;

          try {
            const atmosphericResult = await getAtmosphericProfile(
              site.latitude,
              site.longitude,
              userSettings.daysAhead,
            );

            const siteObj = site;

            for (let dayOffset = 0; dayOffset < userSettings.daysAhead; dayOffset++) {
              const dateStr = addDays(todayStr, dayOffset);

              const analysis = analyzeFlyingDay(atmosphericResult.profile, siteObj, dateStr);

              if (analysis && analysis.score >= siteMinScore) {
                const payload = JSON.stringify(generateNotification(siteObj, analysis));

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
