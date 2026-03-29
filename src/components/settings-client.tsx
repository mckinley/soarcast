import { useState, useEffect } from 'react';
import { useFetcher } from 'react-router';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Settings } from '@/types';
import { Bell, BellOff, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface SettingsSite {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  elevation: number;
  customMaxWind?: number | null;
  defaultMaxWind?: number | null;
}

interface SettingsClientProps {
  initialSettings: Settings;
  sites: SettingsSite[];
  vapidPublicKey?: string;
}

export function SettingsClient({ initialSettings, sites, vapidPublicKey }: SettingsClientProps) {
  const fetcher = useFetcher();
  const isPending = fetcher.state !== 'idle';
  const [settings, setSettings] = useState(initialSettings);
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

  const handleUpdateThreshold = (value: string) => {
    const threshold = parseInt(value, 10);
    if (isNaN(threshold) || threshold < 0 || threshold > 100) return;

    setSettings({
      ...settings,
      notifications: { ...settings.notifications, minScoreThreshold: threshold },
    });
    fetcher.submit(
      { intent: 'updateSettings', minScoreThreshold: String(threshold) },
      { method: 'POST' },
    );
  };

  const handleUpdateDaysAhead = (value: string) => {
    const days = parseInt(value, 10);
    if (isNaN(days) || days < 1 || days > 7) return;

    setSettings({ ...settings, notifications: { ...settings.notifications, daysAhead: days } });
    fetcher.submit({ intent: 'updateSettings', daysAhead: String(days) }, { method: 'POST' });
  };

  const handleUpdateCustomWind = (siteId: string, value: string) => {
    setSiteCustomWinds((prev) => ({ ...prev, [siteId]: value }));
    const num = parseInt(value, 10);
    const customMaxWind = value === '' ? null : isNaN(num) ? null : num;
    if (value !== '' && (isNaN(num) || num < 10 || num > 100)) return;
    fetcher.submit(
      {
        intent: 'updateSiteCustomMaxWind',
        siteId,
        customMaxWind: customMaxWind == null ? '' : String(customMaxWind),
      },
      { method: 'POST' },
    );
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
    fetcher.submit(
      { intent: 'toggleSiteNotifications', siteId, enabled: String(enabled) },
      { method: 'POST' },
    );
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="mt-2 text-muted-foreground">
          Configure notification preferences for flying day alerts.
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
                  ? 'You will receive notifications at 6 AM and 6 PM UTC daily'
                  : 'Click enable to start receiving notifications'}
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
                ✓ Push notifications are enabled. You&apos;ll be notified when any of your sites
                have conditions that meet your minimum score threshold.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Global Notification Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Notification Preferences</CardTitle>
          <CardDescription>
            Set thresholds for when you want to be alerted about good flying conditions.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Minimum Score Threshold */}
          <div className="space-y-2">
            <Label htmlFor="threshold">
              Minimum Score Threshold
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                (0-100, default: 70)
              </span>
            </Label>
            <Input
              id="threshold"
              type="number"
              min="0"
              max="100"
              value={settings.notifications.minScoreThreshold}
              onChange={(e) => handleUpdateThreshold(e.target.value)}
              disabled={isPending}
              className="max-w-xs"
            />
            <p className="text-sm text-muted-foreground">
              You&apos;ll be notified when a day&apos;s XC score meets or exceeds this threshold.
            </p>
          </div>

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
              value={settings.notifications.daysAhead}
              onChange={(e) => handleUpdateDaysAhead(e.target.value)}
              disabled={isPending}
              className="max-w-xs"
            />
            <p className="text-sm text-muted-foreground">
              How far in advance to check for qualifying days (e.g., 2 = today and tomorrow).
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Email Morning Digest */}
      <Card>
        <CardHeader>
          <CardTitle>Email Morning Digest</CardTitle>
          <CardDescription>
            Receive a daily email at ~7 AM showing today&apos;s flyability for your sites.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="email-digest">Enable Email Digest</Label>
              <p className="text-sm text-muted-foreground mt-1">
                Sent each morning with today&apos;s flyability scores for all your sites.
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
                fetcher.submit(
                  { intent: 'toggleEmailDigest', enabled: String(checked) },
                  { method: 'POST' },
                );
              }}
              disabled={isPending}
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
                  fetcher.submit(
                    { intent: 'updateDigestTime', digestTime: time },
                    { method: 'POST' },
                  );
                }}
                disabled={isPending}
                className="max-w-[140px]"
              />
              <p className="text-sm text-muted-foreground">
                When to receive your morning digest (your local time).
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Per-Site Notification Toggles */}
      <Card>
        <CardHeader>
          <CardTitle>Site Notifications</CardTitle>
          <CardDescription>Enable or disable notifications for individual sites.</CardDescription>
        </CardHeader>
        <CardContent>
          {sites.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No sites configured yet. Add sites to enable per-site notifications.
            </p>
          ) : (
            <div className="space-y-4">
              {sites.map((site) => {
                const isEnabled = settings.notifications.sitePreferences[site.id] ?? true; // default to enabled
                return (
                  <div key={site.id} className="rounded-lg border p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {isEnabled ? (
                          <Bell className="h-5 w-5 text-primary" />
                        ) : (
                          <BellOff className="h-5 w-5 text-muted-foreground" />
                        )}
                        <div>
                          <div className="font-medium">{site.name}</div>
                          <div className="text-sm text-muted-foreground">
                            {site.latitude.toFixed(4)}, {site.longitude.toFixed(4)} •{' '}
                            {site.elevation}m
                          </div>
                        </div>
                      </div>
                      <Switch
                        checked={isEnabled}
                        onCheckedChange={(checked) =>
                          handleToggleSiteNotifications(site.id, checked)
                        }
                        disabled={isPending}
                      />
                    </div>
                    {isEnabled && (
                      <div className="flex flex-wrap items-center gap-4 pl-8">
                        <div className="flex items-center gap-2">
                          <Label className="text-sm text-muted-foreground whitespace-nowrap">
                            Min rating:
                          </Label>
                          <Select
                            value={settings.notifications.siteMinRatings[site.id] ?? 'any'}
                            onValueChange={(value) => {
                              const rating =
                                value === 'any' ? undefined : (value as 'Good' | 'Great' | 'Epic');
                              setSettings({
                                ...settings,
                                notifications: {
                                  ...settings.notifications,
                                  siteMinRatings: {
                                    ...settings.notifications.siteMinRatings,
                                    [site.id]: rating,
                                  },
                                },
                              });
                              fetcher.submit(
                                {
                                  intent: 'updateSiteMinRating',
                                  siteId: site.id,
                                  rating: rating ?? '',
                                },
                                { method: 'POST' },
                              );
                            }}
                            disabled={isPending}
                          >
                            <SelectTrigger className="w-[120px] h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="any">Any</SelectItem>
                              <SelectItem value="Good">Good+</SelectItem>
                              <SelectItem value="Great">Great+</SelectItem>
                              <SelectItem value="Epic">Epic</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex items-center gap-2">
                          <Label className="text-sm text-muted-foreground whitespace-nowrap">
                            Wind limit (km/h):
                          </Label>
                          <Input
                            type="number"
                            min="10"
                            max="100"
                            placeholder={site.defaultMaxWind ? String(site.defaultMaxWind) : '40'}
                            value={siteCustomWinds[site.id] ?? ''}
                            onChange={(e) => handleUpdateCustomWind(site.id, e.target.value)}
                            disabled={isPending}
                            className="w-[80px] h-8"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
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
                Notifications are checked twice daily (6 AM and 6 PM UTC). You&apos;ll receive a
                push notification for each site where the forecast meets your minimum score
                threshold within your notification window.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
