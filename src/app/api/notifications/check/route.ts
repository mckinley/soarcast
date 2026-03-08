import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { users, sites, pushSubscriptions, settings as settingsTable } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getForecast } from '@/lib/weather';
import { calculateDailyScores, scoreToLabel } from '@/lib/scoring';
import { getAtmosphericProfile, type AtmosphericProfile } from '@/lib/weather-profile';
import { analyzeFlyingDay, generateNotification, generateMorningDigest } from '@/lib/notifications';
import type { DayAnalysis } from '@/lib/notifications';
import type { Site } from '@/types';
import webpush from 'web-push';
import { Resend } from 'resend';
import { render } from '@react-email/components';
import { MorningDigestEmail } from '@/emails/morning-digest';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

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

    // Determine if this is a morning digest run (check current hour in UTC)
    const now = new Date();
    const currentHour = now.getUTCHours();
    const isMorningRun = currentHour >= 6 && currentHour < 8; // 6-8 AM UTC window

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

        // Handle morning digest if enabled
        if (isMorningRun && userSettings.morningDigestEnabled) {
          try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const todayStr = today.toISOString().split('T')[0];

            // Collect analyses for all favorited sites
            const siteAnalyses: Array<{ site: Site; analysis: DayAnalysis; profile: AtmosphericProfile }> = [];

            for (const site of userSites) {
              const sitePrefs = (
                userSettings.siteNotifications as Record<
                  string,
                  {
                    enabled?: boolean;
                    minRating?: 'Good' | 'Great' | 'Epic';
                  }
                >
              )[site.id];

              // Skip disabled sites
              if (sitePrefs?.enabled === false) {
                continue;
              }

              try {
                const atmosphericResult = await getAtmosphericProfile(
                  parseFloat(site.latitude),
                  parseFloat(site.longitude),
                  1, // Only need today for morning digest
                );

                const analysis = analyzeFlyingDay(
                  atmosphericResult.profile,
                  {
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
                  },
                  todayStr,
                );

                if (analysis) {
                  siteAnalyses.push({
                    site: {
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
                    },
                    analysis,
                    profile: atmosphericResult.profile,
                  });
                }
              } catch (error) {
                console.error(`Error analyzing site ${site.id} for digest:`, error);
              }
            }

            // Generate and send digest notification
            if (siteAnalyses.length > 0) {
              const digestNotification = generateMorningDigest(siteAnalyses, todayStr);
              const payload = JSON.stringify(digestNotification);

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
                    `Failed to send digest notification to ${subscription.endpoint}:`,
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

              // Send email digest if user has email + resend configured
              if (resend && user.email) {
                try {
                  const dateLabel = new Date(todayStr + 'T12:00:00').toLocaleDateString('en-US', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  });

                  const emailSites = siteAnalyses.map(({ site, analysis, profile: siteProfile }) => {
                    // Compute peak wStar from profile hours for today
                    const todayHours = siteProfile.hours.filter((h) => h.time.startsWith(todayStr));
                    const peakWStar = todayHours.reduce((max, h) => {
                      const ws = h.derived.wStar;
                      return ws !== null && ws > max ? ws : max;
                    }, 0) || null;
                    // Determine top concern from analysis
                    let topConcern: string | null = null;
                    if (analysis.concerns.length > 0) {
                      const concern = analysis.concerns[0];
                      if (concern.toLowerCase().includes('overdevelopment') || concern.toLowerCase().includes('storm')) {
                        topConcern = 'OD Risk';
                      } else if (concern.toLowerCase().includes('shear')) {
                        topConcern = 'High wind shear';
                      } else if (concern.toLowerCase().includes('upper') || concern.toLowerCase().includes('850')) {
                        topConcern = 'Strong upper winds';
                      } else {
                        topConcern = concern;
                      }
                    }

                    // Parse ceiling from topOfLift string (e.g., "~8000ft MSL")
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
                  });

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
            }

            // Skip individual site notifications when digest is enabled
            continue;
          } catch (error) {
            console.error(`Error generating morning digest for user ${user.id}:`, error);
            totalErrors++;
            // Fall through to individual notifications on digest failure
          }
        }

        // Check each site for good flying days (individual notifications)
        for (const site of userSites) {
          // Check if notifications are enabled for this site
          const siteNotifications = userSettings.siteNotifications as Record<
            string,
            {
              enabled?: boolean;
              minRating?: 'Good' | 'Great' | 'Epic';
              notifyTime?: 'morning' | 'evening' | 'both';
            }
          >;

          const sitePrefs = siteNotifications[site.id];
          const isSiteEnabled = sitePrefs?.enabled ?? true;

          if (!isSiteEnabled) {
            continue; // Skip sites with notifications disabled
          }

          // Get minimum rating threshold for this site (default to global threshold)
          const minRatingMap: Record<string, number> = {
            Good: 51,
            Great: 71,
            Epic: 86,
          };
          const siteMinScore = sitePrefs?.minRating
            ? minRatingMap[sitePrefs.minRating]
            : userSettings.minScoreThreshold;

          try {
            // Fetch both basic forecast and atmospheric profile
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

            // Calculate basic scores for all days (fallback if atmospheric analysis fails)
            const dailyScores = calculateDailyScores(forecastResult.forecast, {
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

              // Try to use atmospheric profile analysis (enhanced notifications)
              const analysis = analyzeFlyingDay(
                atmosphericResult.profile,
                {
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
                },
                dateStr,
              );

              // Fallback to basic scoring if atmospheric analysis unavailable
              const dayScore = dailyScores.find((score) => score.date === dateStr);

              const score = analysis?.score ?? dayScore?.overallScore ?? 0;

              // Check if score meets site-specific threshold
              if (score >= siteMinScore) {
                let payload: string;

                if (analysis) {
                  // Use rich notification with atmospheric analysis
                  const notification = generateNotification(
                    {
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
                    },
                    analysis,
                  );

                  payload = JSON.stringify(notification);
                } else {
                  // Fallback to basic notification
                  const scoreLabel = scoreToLabel(score);
                  payload = JSON.stringify({
                    title: `${scoreLabel} Flying Day: ${site.name}`,
                    body: `${dateStr}: Score ${Math.round(score)}/100`,
                    url: `/sites/${site.id}`,
                    siteId: site.id,
                    tag: `site-${site.id}-${dateStr}`,
                  });
                }

                // Send push notification to all user's subscriptions
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
