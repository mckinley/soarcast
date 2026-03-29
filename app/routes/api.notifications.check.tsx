import type { ActionFunctionArgs } from 'react-router';
import { getDb } from '~/app/lib/db.server';
import { users, sites, pushSubscriptions, settings as settingsTable } from '~/db/schema';
import { eq } from 'drizzle-orm';
import { getForecast, setWeatherDb } from '~/lib/weather';
import { calculateDailyScores, scoreToLabel } from '~/lib/scoring';
import { getAtmosphericProfile, setProfileDb } from '~/lib/weather-profile';
import { analyzeFlyingDay, generateNotification, generateMorningDigest } from '~/lib/notifications';
import type { DayAnalysis } from '~/lib/notifications';
import type { AtmosphericProfile } from '~/lib/weather-profile';
import type { Site } from '~/types';
import webpush from 'web-push';
import { Resend } from 'resend';
import { render } from '@react-email/components';
import { MorningDigestEmail } from '~/emails/morning-digest';

export async function action({ request, context }: ActionFunctionArgs) {
  const env = context.cloudflare.env as Env;

  try {
    // Verify cron secret
    const authHeader = request.headers.get('authorization');
    if (env.CRON_SECRET && authHeader !== `Bearer ${env.CRON_SECRET}`) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = getDb(env);
    setWeatherDb(db);
    setProfileDb(db);

    // Configure VAPID keys
    if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
      console.error('VAPID keys not configured');
      return Response.json({ error: 'Push notifications not configured' }, { status: 500 });
    }

    webpush.setVapidDetails(
      'mailto:notifications@soarcast.app',
      env.VAPID_PUBLIC_KEY,
      env.VAPID_PRIVATE_KEY,
    );

    const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

    const allUsers = await db.select().from(users);
    let totalNotificationsSent = 0;
    let totalErrors = 0;

    const now = new Date();
    const currentHour = now.getUTCHours();
    const isMorningRun = currentHour >= 6 && currentHour < 8;

    for (const user of allUsers) {
      try {
        const [userSettings] = await db
          .select()
          .from(settingsTable)
          .where(eq(settingsTable.userId, user.id))
          .limit(1);

        if (!userSettings) continue;

        const subscriptions = await db
          .select()
          .from(pushSubscriptions)
          .where(eq(pushSubscriptions.userId, user.id));

        if (subscriptions.length === 0) continue;

        const userSites = await db.select().from(sites).where(eq(sites.userId, user.id));
        if (userSites.length === 0) continue;

        // Morning digest
        if (isMorningRun && userSettings.morningDigestEnabled) {
          try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const todayStr = today.toISOString().split('T')[0];

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
                  parseFloat(site.latitude),
                  parseFloat(site.longitude),
                  1,
                );

                const siteObj: Site = {
                  id: site.id,
                  name: site.name,
                  latitude: parseFloat(site.latitude),
                  longitude: parseFloat(site.longitude),
                  elevation: site.elevation,
                  idealWindDirections: site.idealWindDirections as number[],
                  maxWindSpeed: site.maxWindSpeed || 40,
                  notes: site.notes ?? undefined,
                  createdAt: new Date(site.createdAt).toISOString(),
                  updatedAt: new Date(site.updatedAt).toISOString(),
                };

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
                  await webpush.sendNotification(
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

              // Send email digest
              if (resend && user.email) {
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

                  const html = await render(
                    MorningDigestEmail({ date: dateLabel, sites: emailSites }),
                  );

                  await resend.emails.send({
                    from: 'SoarCast <digest@soarcast.app>',
                    to: user.email,
                    subject: `Your SoarCast Morning Digest - ${dateLabel}`,
                    html,
                  });
                  totalNotificationsSent++;
                } catch (emailError) {
                  console.error(`Failed to send email digest to ${user.email}:`, emailError);
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
            const forecastResult = await getForecast(
              site.id,
              parseFloat(site.latitude),
              parseFloat(site.longitude),
            );

            const atmosphericResult = await getAtmosphericProfile(
              parseFloat(site.latitude),
              parseFloat(site.longitude),
              userSettings.daysAhead,
            );

            const siteObj: Site = {
              id: site.id,
              name: site.name,
              latitude: parseFloat(site.latitude),
              longitude: parseFloat(site.longitude),
              elevation: site.elevation,
              idealWindDirections: site.idealWindDirections as number[],
              maxWindSpeed: site.maxWindSpeed || 40,
              notes: site.notes ?? undefined,
              createdAt: new Date(site.createdAt).toISOString(),
              updatedAt: new Date(site.updatedAt).toISOString(),
            };

            const dailyScores = calculateDailyScores(forecastResult.forecast, siteObj);

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            for (let dayOffset = 0; dayOffset < userSettings.daysAhead; dayOffset++) {
              const checkDate = new Date(today);
              checkDate.setDate(checkDate.getDate() + dayOffset);
              const dateStr = checkDate.toISOString().split('T')[0];

              const analysis = analyzeFlyingDay(atmosphericResult.profile, siteObj, dateStr);
              const dayScore = dailyScores.find((score) => score.date === dateStr);
              const score = analysis?.score ?? dayScore?.overallScore ?? 0;

              if (score >= siteMinScore) {
                let payload: string;
                if (analysis) {
                  const notification = generateNotification(siteObj, analysis);
                  payload = JSON.stringify(notification);
                } else {
                  const scoreLabel = scoreToLabel(score);
                  payload = JSON.stringify({
                    title: `${scoreLabel} Flying Day: ${site.name}`,
                    body: `${dateStr}: Score ${Math.round(score)}/100`,
                    url: `/sites/${site.id}`,
                    siteId: site.id,
                    tag: `site-${site.id}-${dateStr}`,
                  });
                }

                for (const subscription of subscriptions) {
                  try {
                    await webpush.sendNotification(
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
