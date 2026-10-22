import { useState, useEffect } from 'react';
import { Link, useSubmit } from 'react-router';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import type { Settings, SiteGoal, SiteKind } from '@/types';
import { SiteGoalSelect, SiteKindSelect } from '@/components/site-goal-picker';
import { AreaHeader, SiteAreaSelect, type SettingsArea } from '@/components/area-controls';
import { DEFAULT_MAX_WIND_KMH } from '@/lib/forecast-engine';
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
}

interface SettingsClientProps {
  initialSettings: Settings;
  sites: SettingsSite[];
  /** The places sites are grouped by, the one first saved in first */
  areas?: SettingsArea[];
  vapidPublicKey?: string;
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
    return (
      <div key={site.id} className="rounded-lg border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {alerting ? (
              <Bell className="h-5 w-5 text-primary" />
            ) : (
              <BellOff className="h-5 w-5 text-muted-foreground" />
            )}
            <div>
              <div className="font-medium">{site.name}</div>
              <div className="text-sm text-muted-foreground">
                {site.latitude.toFixed(4)}, {site.longitude.toFixed(4)} • {site.elevation}m
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
        <div className="flex flex-wrap items-center gap-4 sm:pl-8">
          <div className="flex flex-wrap items-center gap-2">
            <Label
              htmlFor={`goal-${site.id}`}
              className="text-sm text-muted-foreground whitespace-nowrap"
            >
              Worth going when:
            </Label>
            <SiteGoalSelect
              id={`goal-${site.id}`}
              target={{ siteId: site.id, source: site.custom ? 'custom' : 'launch' }}
              goal={site.goal}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Label
              htmlFor={`kind-${site.id}`}
              className="text-sm text-muted-foreground whitespace-nowrap"
            >
              What it gives:
            </Label>
            <SiteKindSelect
              id={`kind-${site.id}`}
              target={{ siteId: site.id, source: site.custom ? 'custom' : 'launch' }}
              kind={site.kind}
              listedKind={site.listedKind}
            />
          </div>
          {site.custom ? (
            <div className="text-sm text-muted-foreground">
              Wind limit {site.defaultMaxWind} km/h •{' '}
              <Link to={`/sites/custom/${site.id}/edit`} className="underline">
                Edit site
              </Link>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Label className="text-sm text-muted-foreground whitespace-nowrap">
                Wind limit (km/h):
              </Label>
              <Input
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
                className="w-[80px] h-8"
              />
            </div>
          )}
          {areas.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <Label
                htmlFor={`area-${site.id}`}
                className="text-sm text-muted-foreground whitespace-nowrap"
              >
                Area:
              </Label>
              <SiteAreaSelect
                id={`area-${site.id}`}
                siteKey={site.key}
                areaId={site.areaId}
                areas={areas}
              />
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="mt-2 text-muted-foreground">
          When and how SoarCast tells you a site is flyable.
        </p>
      </div>

      {/* Push Notifications */}
      <Card>
        <CardHeader>
          <CardTitle>Push Notifications</CardTitle>
          <CardDescription>
            Receive browser notifications when good flying conditions are forecasted.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {pushError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{pushError}</AlertDescription>
            </Alert>
          )}

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Enable Push Notifications</Label>
              <p className="text-sm text-muted-foreground">
                {pushEnabled
                  ? 'On for this browser. Alerts come at your digest time and at 6 PM, your time.'
                  : 'Get a notification on this device when a favorite site looks flyable.'}
              </p>
            </div>
            {pushEnabled ? (
              <Button
                onClick={handleDisablePushNotifications}
                disabled={pushLoading}
                variant="outline"
              >
                {pushLoading ? 'Disabling...' : 'Disable'}
              </Button>
            ) : (
              <Button
                onClick={handleEnablePushNotifications}
                disabled={pushLoading || !swRegistration}
              >
                {pushLoading ? 'Enabling...' : 'Enable'}
              </Button>
            )}
          </div>

          {pushEnabled && (
            <div className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
              <p>
                ✓ Push notifications are on. You&apos;ll get an alert when a day is a go at one of
                your sites. Each site&apos;s goal is set below.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Global Notification Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Notification Preferences</CardTitle>
          <CardDescription>How far ahead to look for days worth an alert.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-sm text-muted-foreground">
            Alerts come for days that are a go at a site. A go means flyable, with the flight you
            want from it. Set what each site is worth going for under Favorites below.
          </p>

          {/* Days Ahead Window */}
          <div className="space-y-2">
            <Label htmlFor="daysAhead">
              Notification Window
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                (1-7 days, default: 2)
              </span>
            </Label>
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
              className="max-w-xs"
            />
            <p className="text-sm text-muted-foreground">
              How many days ahead to check. For example, 2 means today and tomorrow.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Email Morning Digest */}
      <Card>
        <CardHeader>
          <CardTitle>Email Morning Digest</CardTitle>
          <CardDescription>An email each morning, at the hour you choose.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="email-digest">Enable Email Digest</Label>
              <p className="text-sm text-muted-foreground mt-1">
                It lists which favorite sites are flyable today, and when.
              </p>
            </div>
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
          </div>
          {settings.emailDigest.enabled && (
            <div className="mt-4 space-y-2">
              <Label htmlFor="digest-time">Delivery Time</Label>
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
                className="max-w-[140px]"
              />
              <p className="text-sm text-muted-foreground">
                Local time. The email goes out at the start of that hour.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Favorites, by area: each site's goal, kind, wind limit and alerts */}
      <Card id="areas" className="scroll-mt-20">
        <CardHeader>
          <CardTitle>Favorites</CardTitle>
          <CardDescription>
            Sites are grouped into areas by where they are. The dashboard shows one area at a time.
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
                        the morning digest.
                      </p>
                    )}
                    <div className="space-y-4">
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
            <Link to="/guide/experiments" className="underline underline-offset-2">
              What each one is and how it tested
            </Link>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <Label htmlFor="experiments">Show experiments</Label>
            <Switch
              id="experiments"
              checked={settings.experiments}
              onCheckedChange={(checked) => {
                setSettings({ ...settings, experiments: checked });
                save('experiments', { intent: 'toggleExperiments', enabled: String(checked) });
              }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card className="bg-muted/50">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <Bell className="mt-0.5 h-5 w-5 text-muted-foreground" />
            <div className="text-sm text-muted-foreground">
              <p className="font-medium text-foreground mb-1">How Notifications Work</p>
              <p>
                SoarCast checks your sites each morning at your digest time and again at 6 PM, in
                your local time. You&apos;ll get a push notification for each site with a go day in
                the notification window.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
