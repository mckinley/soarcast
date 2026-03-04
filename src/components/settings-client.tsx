'use client';

import { useState, useTransition } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { updateSettings, toggleSiteNotifications } from '@/app/settings/actions';
import type { Settings, Site } from '@/types';
import { Bell, BellOff } from 'lucide-react';

interface SettingsClientProps {
  initialSettings: Settings;
  sites: Site[];
}

export function SettingsClient({ initialSettings, sites }: SettingsClientProps) {
  const [isPending, startTransition] = useTransition();
  const [settings, setSettings] = useState(initialSettings);

  const handleUpdateThreshold = (value: string) => {
    const threshold = parseInt(value, 10);
    if (isNaN(threshold) || threshold < 0 || threshold > 100) return;

    startTransition(async () => {
      const updated = await updateSettings({ minScoreThreshold: threshold });
      setSettings(updated);
    });
  };

  const handleUpdateDaysAhead = (value: string) => {
    const days = parseInt(value, 10);
    if (isNaN(days) || days < 1 || days > 7) return;

    startTransition(async () => {
      const updated = await updateSettings({ daysAhead: days });
      setSettings(updated);
    });
  };

  const handleToggleSiteNotifications = (siteId: string, enabled: boolean) => {
    startTransition(async () => {
      await toggleSiteNotifications(siteId, enabled);
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
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="mt-2 text-muted-foreground">
          Configure notification preferences for flying day alerts.
        </p>
      </div>

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
              You'll be notified when a day's XC score meets or exceeds this threshold.
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

      {/* Per-Site Notification Toggles */}
      <Card>
        <CardHeader>
          <CardTitle>Site Notifications</CardTitle>
          <CardDescription>
            Enable or disable notifications for individual sites.
          </CardDescription>
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
                  <div
                    key={site.id}
                    className="flex items-center justify-between rounded-lg border p-4"
                  >
                    <div className="flex items-center gap-3">
                      {isEnabled ? (
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
                      onCheckedChange={(checked) =>
                        handleToggleSiteNotifications(site.id, checked)
                      }
                      disabled={isPending}
                    />
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
              <p className="font-medium text-foreground mb-1">About Notifications</p>
              <p>
                Actual notification delivery (email, push, etc.) is not implemented in v1. These
                settings control visual indicators on the dashboard that show which days meet your
                criteria for good flying conditions.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
