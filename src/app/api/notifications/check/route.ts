import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { users, sites, pushSubscriptions, settings as settingsTable } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getForecast } from '@/lib/weather';
import { calculateDailyScores, scoreToLabel } from '@/lib/scoring';
import webpush from 'web-push';

// Configure web-push with VAPID keys
const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails('mailto:notifications@soarcast.app', vapidPublicKey, vapidPrivateKey);
}

export async function POST(request: NextRequest) {
  try {
    // Verify cron secret for security
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!vapidPublicKey || !vapidPrivateKey) {
      console.error('VAPID keys not configured');
      return NextResponse.json({ error: 'Push notifications not configured' }, { status: 500 });
    }

    // Get all users with push subscriptions
    const allUsers = await db.select().from(users);

    let totalNotificationsSent = 0;
    let totalErrors = 0;

    for (const user of allUsers) {
      try {
        // Get user's settings
        const [userSettings] = await db
          .select()
          .from(settingsTable)
          .where(eq(settingsTable.userId, user.id))
          .limit(1);

        if (!userSettings) {
          continue; // Skip users without settings
        }

        // Get user's push subscriptions
        const subscriptions = await db
          .select()
          .from(pushSubscriptions)
          .where(eq(pushSubscriptions.userId, user.id));

        if (subscriptions.length === 0) {
          continue; // Skip users without push subscriptions
        }

        // Get user's sites
        const userSites = await db.select().from(sites).where(eq(sites.userId, user.id));

        if (userSites.length === 0) {
          continue; // Skip users without sites
        }

        // Check each site for good flying days
        for (const site of userSites) {
          // Check if notifications are enabled for this site
          const siteNotifications = userSettings.siteNotifications as Record<string, boolean>;
          const isSiteEnabled = siteNotifications[site.id] ?? true;

          if (!isSiteEnabled) {
            continue; // Skip sites with notifications disabled
          }

          try {
            // Fetch forecast for the site
            const forecast = await getForecast(
              site.id,
              parseFloat(site.latitude),
              parseFloat(site.longitude),
            );

            // Calculate scores for all days in the forecast
            const dailyScores = calculateDailyScores(forecast, {
              id: site.id,
              name: site.name,
              latitude: parseFloat(site.latitude),
              longitude: parseFloat(site.longitude),
              elevation: site.elevation,
              idealWindDirections: site.idealWindDirections as number[],
              maxWindSpeed: site.maxWindSpeed,
              notes: site.notes ?? undefined,
              createdAt: site.createdAt.toISOString(),
              updatedAt: site.updatedAt.toISOString(),
            });

            // Get today's date
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            // Check next N days based on user settings
            for (let dayOffset = 0; dayOffset < userSettings.daysAhead; dayOffset++) {
              const checkDate = new Date(today);
              checkDate.setDate(checkDate.getDate() + dayOffset);
              const dateStr = checkDate.toISOString().split('T')[0];

              // Find score for this date
              const dayScore = dailyScores.find((score) => score.date === dateStr);

              // Check if score meets threshold
              if (dayScore && dayScore.overallScore >= userSettings.minScoreThreshold) {
                const scoreLabel = scoreToLabel(dayScore.overallScore);

                // Send push notification to all user's subscriptions
                const payload = JSON.stringify({
                  title: `${scoreLabel} Flying Day: ${site.name}`,
                  body: `${dateStr}: Score ${Math.round(dayScore.overallScore)}/100`,
                  url: `/sites/${site.id}`,
                  siteId: site.id,
                  tag: `site-${site.id}-${dateStr}`,
                });

                for (const subscription of subscriptions) {
                  try {
                    await webpush.sendNotification(
                      {
                        endpoint: subscription.endpoint,
                        keys: subscription.keys,
                      },
                      payload,
                    );
                    totalNotificationsSent++;
                  } catch (error: unknown) {
                    console.error(
                      `Failed to send notification to ${subscription.endpoint}:`,
                      error,
                    );

                    // If subscription is invalid (410 Gone), delete it
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

                // Only send one notification per site (for the first qualifying day)
                break;
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

    return NextResponse.json({
      success: true,
      notificationsSent: totalNotificationsSent,
      errors: totalErrors,
    });
  } catch (error) {
    console.error('Error in notification check:', error);
    return NextResponse.json({ error: 'Failed to check notifications' }, { status: 500 });
  }
}
