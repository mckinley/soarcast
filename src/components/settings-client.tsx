import { useState, useEffect, type ReactNode } from 'react';
import { Link, useSubmit } from 'react-router';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import type { Settings, SiteGoal, SiteKind, SiteTerrain } from '@/types';
import { SiteGoalSelect, SiteKindSelect, SiteTerrainSelect } from '@/components/site-goal-picker';
import { AreaHeader, SiteAreaSelect, type SettingsArea } from '@/components/area-controls';
import { DEFAULT_MAX_WIND_KMH, MOUNTAIN_MAX_WIND_KMH } from '@/lib/forecast-engine';
import { EVENING_ALERT_HOUR } from '@/lib/alert-schedule';
import { heightText } from '@/components/site-page';
import { Bell, BellOff, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface SettingsSite {
  id: string;
  /** "launch:<id>" or "custom:<id>" */
  key: string;
  /** The area the site is in */
  areaId: string | null;
  name: string;
  latitude: number;
  longitude: number;
  elevation: number;
  customMaxWind?: number | null;
  defaultMaxWind?: number | null;
  /** The user's own site: its wind limit is edited on the site itself */
  custom?: boolean;
  /** What makes a day a go here: theirs, or the default for the site */
  goal: SiteGoal;
  /** What the pilot says the site gives; null uses the listing */
  kind: SiteKind | null;
  /** What the listing says it gives (listed sites) */
  listedKind?: SiteKind | null;
  /** The pilot's say on the ground round it; null goes by the measure */
  terrain: SiteTerrain | null;
  /** The terrain measured from the map, null until it has been */
  measuredTerrain: SiteTerrain | null;
}

interface SettingsClientProps {
  initialSettings: Settings;
  sites: SettingsSite[];
  /** The places sites are grouped by, the one first saved in first */
  areas?: SettingsArea[];
  vapidPublicKey?: string;
}

/** "6 PM": when the evening alerts go out, in each pilot's own time. */
const EVENING_TIME = new Date(Date.UTC(2000, 0, 1, EVENING_ALERT_HOUR)).toLocaleTimeString(
  'en-US',
  { hour: 'numeric', timeZone: 'UTC' },
);

/**
 * One setting: its name with its control on the right, and a line on what it
 * does. The line runs under both on a phone, under the name on a computer.
 */
function SettingRow({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 py-3.5 first:pt-0 last:pb-0">
      {htmlFor ? (
        <Label htmlFor={htmlFor} className="text-[15px] font-medium">
          {label}
        </Label>
      ) : (
        <p className="text-[15px] font-medium">{label}</p>
      )}
      <div className="col-start-2 row-start-1 sm:row-span-2">{children}</div>
      {hint && <p className="col-span-2 text-sm text-muted-foreground sm:col-span-1">{hint}</p>}
    </div>
  );
}

/** One of a favorite site's choices, its name above it. */
function SiteField({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-1.5">
      {htmlFor ? (
        <Label htmlFor={htmlFor} className="text-xs font-medium text-muted-foreground">
          {label}
        </Label>
      ) : (
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
      )}
      {children}
    </div>
  );
}

// Sent with digest changes so the digest arrives at the user's local time.
function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function SettingsClient({
  initialSettings,
  sites,
  areas = [],
  vapidPublicKey,
}: SettingsClientProps) {
  const submit = useSubmit();
  // Each control saves through its own fetcher, so saving one never cancels
  // another, and nothing is disabled while a save is in flight.
  const save = (key: string, data: Record<string, string>) =>
    submit(data, { method: 'POST', navigate: false, fetcherKey: `settings:${key}` });
  const [settings, setSettings] = useState(initialSettings);
  const [daysAheadInput, setDaysAheadInput] = useState(
    String(initialSettings.notifications.daysAhead),
  );
  const [siteCustomWinds, setSiteCustomWinds] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      sites.filter((s) => s.customMaxWind != null).map((s) => [s.id, String(s.customMaxWind)]),
    ),
  );
  const [pushEnabled, setPushEnabled] = useState(initialSettings.notifications.enabled);
  const [pushLoading, setPushLoading] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [swRegistration, setSwRegistration] = useState<ServiceWorkerRegistration | null>(null);

  // Register service worker on mount
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
          console.log('Service Worker registered:', registration);
          setSwRegistration(registration);
        })
        .catch((error) => {
          console.error('Service Worker registration failed:', error);
          setPushError('Failed to register service worker');
        });
    } else {
      setPushError('Push notifications are not supported in this browser');
    }
  }, []);

  // Saved when the field is left, so typing "2" on the way to "12" saves nothing
  const commitDaysAhead = () => {
    const days = parseInt(daysAheadInput, 10);
    if (isNaN(days) || days < 1 || days > 7) {
      setDaysAheadInput(String(settings.notifications.daysAhead));
      return;
    }
    if (days === settings.notifications.daysAhead) return;
    setSettings({ ...settings, notifications: { ...settings.notifications, daysAhead: days } });
    save('daysAhead', { intent: 'updateSettings', daysAhead: String(days) });
  };

  const commitCustomWind = (siteId: string) => {
    const value = siteCustomWinds[siteId] ?? '';
    const num = parseInt(value, 10);
    if (value !== '' && (isNaN(num) || num < 10 || num > 100)) return;
    save(`wind:${siteId}`, {
      intent: 'updateSiteCustomMaxWind',
      siteId,
      customMaxWind: value === '' ? '' : String(num),
    });
  };

  const handleToggleSiteNotifications = (siteId: string, enabled: boolean) => {
    // Update local state immediately for responsive UI
    setSettings({
      ...settings,
      notifications: {
        ...settings.notifications,
        sitePreferences: {
          ...settings.notifications.sitePreferences,
          [siteId]: enabled,
        },
      },
    });
    save(`site:${siteId}`, {
      intent: 'toggleSiteNotifications',
      siteId,
      enabled: String(enabled),
    });
  };

  const handleEnablePushNotifications = async () => {
    setPushLoading(true);
    setPushError(null);

    try {
      if (!swRegistration) {
        throw new Error('Service worker not registered');
      }

      // Request notification permission
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        throw new Error('Notification permission denied');
      }

      // Subscribe to push notifications
      // vapidPublicKey is passed as a prop from the route loader
      if (!vapidPublicKey) {
        throw new Error('VAPID public key not configured');
      }

      // Convert base64 VAPID key to Uint8Array
      const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);

      const subscription = await swRegistration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });

      // Send subscription to server
      const response = await fetch('/api/notifications/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          endpoint: subscription.endpoint,
          keys: {
            p256dh: arrayBufferToBase64(subscription.getKey('p256dh')!),
            auth: arrayBufferToBase64(subscription.getKey('auth')!),
          },
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save subscription');
      }

      setPushEnabled(true);
    } catch (error: unknown) {
      console.error('Error enabling push notifications:', error);
      setPushError(error instanceof Error ? error.message : 'Failed to enable push notifications');
    } finally {
      setPushLoading(false);
    }
  };

  const handleDisablePushNotifications = async () => {
    setPushLoading(true);
    setPushError(null);

    try {
      if (!swRegistration) {
        throw new Error('Service worker not registered');
      }

      // Get current subscription
      const subscription = await swRegistration.pushManager.getSubscription();
      if (subscription) {
        // Unsubscribe from push
        await subscription.unsubscribe();

        // Remove subscription from server
        await fetch('/api/notifications/subscribe', {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            endpoint: subscription.endpoint,
          }),
        });
      }

      setPushEnabled(false);
    } catch (error: unknown) {
      console.error('Error disabling push notifications:', error);
      setPushError(error instanceof Error ? error.message : 'Failed to disable push notifications');
    } finally {
      setPushLoading(false);
    }
  };

  // Helper function to convert ArrayBuffer to base64
  function arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  // Helper function to convert base64 string to Uint8Array
  function urlBase64ToUint8Array(base64String: string): BufferSource {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  // One site's row: its alerts switch, goal, kind, wind limit and area
  const renderSite = (site: SettingsSite, areaAlertsOn: boolean) => {
    // A site alerts when both its own switch and its area's are on
    const isEnabled = settings.notifications.sitePreferences[site.id] ?? true;
    const alerting = isEnabled && areaAlertsOn;
    const target = { siteId: site.id, source: site.custom ? 'custom' : 'launch' } as const;
    return (
      <div key={site.id} className="space-y-4 rounded-xl border bg-background p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {alerting ? (
              <Bell className="size-5 shrink-0 text-primary" />
            ) : (
              <BellOff className="size-5 shrink-0 text-muted-foreground" />
            )}
            <div className="min-w-0">
              <div className="truncate font-semibold">{site.name}</div>
              <div className="text-sm text-muted-foreground">
                {site.custom ? 'Private site · ' : ''}
                {heightText(site.elevation)}
              </div>
            </div>
          </div>
          <Switch
            checked={isEnabled}
            disabled={!areaAlertsOn}
            aria-label={`Alerts for ${site.name}`}
            onCheckedChange={(checked) => handleToggleSiteNotifications(site.id, checked)}
          />
        </div>
        <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <SiteField label="Worth going when" htmlFor={`goal-${site.id}`}>
            <SiteGoalSelect id={`goal-${site.id}`} target={target} goal={site.goal} />
          </SiteField>
          <SiteField label="What it gives" htmlFor={`kind-${site.id}`}>
            <SiteKindSelect
              id={`kind-${site.id}`}
              target={target}
              kind={site.kind}
              listedKind={site.listedKind}
            />
          </SiteField>
          {/* The terrain only changes the rating with wider margins on */}
          {settings.mountainMargins && (
            <SiteField label="Terrain" htmlFor={`terrain-${site.id}`}>
              <SiteTerrainSelect
                id={`terrain-${site.id}`}
                target={target}
                terrain={site.terrain}
                measuredTerrain={site.measuredTerrain}
              />
            </SiteField>
          )}
          {site.custom ? (
            <SiteField label="Wind limit">
              <p className="flex h-8 items-center text-sm">
                {site.defaultMaxWind} km/h ·{' '}
                <Link
                  to={`/sites/custom/${site.id}/edit`}
                  className="ml-1 font-medium text-primary hover:underline"
                >
                  Edit site
                </Link>
              </p>
            </SiteField>
          ) : (
            <SiteField label="Wind limit (km/h)" htmlFor={`wind-${site.id}`}>
              <Input
                id={`wind-${site.id}`}
                type="number"
                min="10"
                max="100"
                placeholder={
                  site.defaultMaxWind ? String(site.defaultMaxWind) : String(DEFAULT_MAX_WIND_KMH)
                }
                inputMode="numeric"
                value={siteCustomWinds[site.id] ?? ''}
                onChange={(e) =>
                  setSiteCustomWinds((prev) => ({
                    ...prev,
                    [site.id]: e.target.value,
                  }))
                }
                onBlur={() => commitCustomWind(site.id)}
                onKeyDown={(e) => e.key === 'Enter' && commitCustomWind(site.id)}
                className="h-8 w-24"
              />
            </SiteField>
          )}
          {areas.length > 0 && (
            <SiteField label="Area" htmlFor={`area-${site.id}`}>
              <SiteAreaSelect
                id={`area-${site.id}`}
                siteKey={site.key}
                areaId={site.areaId}
                areas={areas}
              />
            </SiteField>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-3xl space-y-6">
      <header>
        <h1 className="text-[26px] leading-tight font-semibold tracking-tight md:text-[30px]">
          Settings
        </h1>
        <p className="mt-1.5 text-muted-foreground">
          When SoarCast alerts you, and how it rates each favorite site.
        </p>
      </header>

      {/* Alerts: push on this device, the morning email, the hour and how far ahead */}
      <Card id="alerts" className="scroll-mt-20">
        <CardHeader>
          <CardTitle>Alerts</CardTitle>
          <CardDescription>
            A push or an email when a favorite site has a go day coming. A go means flyable, with
            the flight you want from that site. Set what each site is worth going for under
            Favorites.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {pushError && (
            <Alert variant="destructive" className="mb-3">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{pushError}</AlertDescription>
            </Alert>
          )}
          <div className="divide-y">
            <SettingRow
              label="Push notifications"
              hint={
                pushEnabled
                  ? 'On for this browser.'
                  : 'A notification on this device when a favorite site has a go day.'
              }
            >
              {pushEnabled ? (
                <Button
                  onClick={handleDisablePushNotifications}
                  disabled={pushLoading}
                  variant="outline"
                  size="sm"
                >
                  {pushLoading ? 'Turning off' : 'Turn off'}
                </Button>
              ) : (
                <Button
                  onClick={handleEnablePushNotifications}
                  disabled={pushLoading || !swRegistration}
                  size="sm"
                >
                  {pushLoading ? 'Turning on' : 'Turn on'}
                </Button>
              )}
            </SettingRow>
            <SettingRow
              label="Morning email"
              htmlFor="email-digest"
              hint="Lists which favorite sites are flyable today, and when."
            >
              <Switch
                id="email-digest"
                checked={settings.emailDigest.enabled}
                onCheckedChange={(checked) => {
                  setSettings({
                    ...settings,
                    emailDigest: { ...settings.emailDigest, enabled: checked },
                  });
                  save('digest', {
                    intent: 'toggleEmailDigest',
                    enabled: String(checked),
                    timeZone: browserTimeZone(),
                  });
                }}
              />
            </SettingRow>
            <SettingRow
              label="Morning alerts at"
              htmlFor="digest-time"
              hint={`Your local time. The morning push and email go out at the start of that hour. Evening alerts come at ${EVENING_TIME}.`}
            >
              <Input
                id="digest-time"
                type="time"
                value={settings.emailDigest.digestTime}
                onChange={(e) => {
                  const time = e.target.value;
                  setSettings({
                    ...settings,
                    emailDigest: { ...settings.emailDigest, digestTime: time },
                  });
                  if (!/^\d{2}:\d{2}$/.test(time)) return;
                  save('digestTime', {
                    intent: 'updateDigestTime',
                    digestTime: time,
                    timeZone: browserTimeZone(),
                  });
                }}
                className="h-9 w-36"
              />
            </SettingRow>
            <SettingRow
              label="Days ahead"
              htmlFor="daysAhead"
              hint="How many days to check, from 1 to 7. For example, 2 means today and tomorrow."
            >
              <Input
                id="daysAhead"
                type="number"
                min="1"
                max="7"
                inputMode="numeric"
                value={daysAheadInput}
                onChange={(e) => setDaysAheadInput(e.target.value)}
                onBlur={commitDaysAhead}
                onKeyDown={(e) => e.key === 'Enter' && commitDaysAhead()}
                className="h-9 w-20"
              />
            </SettingRow>
          </div>
        </CardContent>
      </Card>

      {/* Wider margins in big mountains: a stricter rating there, off by default */}
      <Card id="mountain-margins" className="scroll-mt-20">
        <CardHeader>
          <CardTitle>Big mountains</CardTitle>
          <CardDescription>
            Wind, rotor and storms are harder to fly among deep valleys and high ridges. With wider
            margins on, a site in big mountains gets a wind limit of {MOUNTAIN_MAX_WIND_KMH} km/h,
            not {DEFAULT_MAX_WIND_KMH} km/h. The wind higher up counts too, and unstable air counts
            even with no showers near. Ridge soaring sites keep the usual limit.{' '}
            <Link
              to="/guide/how-a-day-is-rated#big-mountains"
              className="font-medium text-primary hover:underline"
            >
              How it works
            </Link>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SettingRow
            label="Wider margins in big mountains"
            htmlFor="mountain-margins-switch"
            hint="When it is off, every site gets the usual rules. These margins hold back some days that most pilots fly."
          >
            <Switch
              id="mountain-margins-switch"
              checked={settings.mountainMargins}
              onCheckedChange={(checked) => {
                setSettings({ ...settings, mountainMargins: checked });
                save('mountainMargins', {
                  intent: 'toggleMountainMargins',
                  enabled: String(checked),
                });
              }}
            />
          </SettingRow>
        </CardContent>
      </Card>

      {/* Favorites, by area: each site's goal, kind, wind limit and alerts */}
      <Card id="areas" className="scroll-mt-20">
        <CardHeader>
          <CardTitle>Favorites</CardTitle>
          <CardDescription>
            Sites are grouped into areas by where they are. Forecast shows one area at a time.
            Rename an area, join two, or move a site to another area. For each site, set what it
            gives, what makes a day worth going there, and whether to alert you about it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sites.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No sites yet. Add a site to Favorites, or add a private site, to set it up here.
            </p>
          ) : (
            <div className="space-y-8">
              {(areas.length > 0 ? areas : [null]).map((area) => {
                const areaSites = area ? sites.filter((s) => s.areaId === area.id) : sites;
                const areaAlertsOn = area?.alerts ?? true;
                return (
                  <section key={area?.id ?? 'all'} className="space-y-3">
                    {area && <AreaHeader area={area} areas={areas} />}
                    {!areaAlertsOn && (
                      <p className="text-sm text-muted-foreground">
                        Alerts are off for this area. Its sites send no alerts and are left out of
                        the morning email.
                      </p>
                    )}
                    <div className="space-y-3">
                      {areaSites.map((site) => renderSite(site, areaAlertsOn))}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Experiments: ideas still being tested, at the foot of site pages */}
      <Card id="experiments" className="scroll-mt-20">
        <CardHeader>
          <CardTitle>Experiments</CardTitle>
          <CardDescription>
            Ideas still being tested, shown at the foot of site pages. They never change a
            day&apos;s rating.{' '}
            <Link to="/guide/experiments" className="font-medium text-primary hover:underline">
              What each one is and how it tested
            </Link>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SettingRow label="Show experiments" htmlFor="experiments">
            <Switch
              id="experiments"
              checked={settings.experiments}
              onCheckedChange={(checked) => {
                setSettings({ ...settings, experiments: checked });
                save('experiments', { intent: 'toggleExperiments', enabled: String(checked) });
              }}
            />
          </SettingRow>
        </CardContent>
      </Card>
    </div>
  );
}
