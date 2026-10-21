import { useFetcher } from 'react-router';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AREA_NAME_MAX } from '@/lib/site-areas';

/** An area as Settings shows it. */
export interface SettingsArea {
  id: string;
  name: string;
  alerts: boolean;
}

// Each control saves through its own fetcher on the settings route, which
// then reloads the page: a joined area or a moved site shows in its new place.

/** An area's name, its alerts switch, and a way to join it into another area. */
export function AreaHeader({ area, areas }: { area: SettingsArea; areas: SettingsArea[] }) {
  const rename = useFetcher({ key: `area-name:${area.id}` });
  const alerts = useFetcher({ key: `area-alerts:${area.id}` });
  const join = useFetcher({ key: `area-join:${area.id}` });
  const pendingAlerts = alerts.formData?.get('enabled');
  const alertsOn = pendingAlerts != null ? pendingAlerts === 'true' : area.alerts;
  const others = areas.filter((a) => a.id !== area.id);

  const commitName = (value: string) => {
    const name = value.trim();
    if (!name || name === area.name) return;
    rename.submit(
      { intent: 'renameArea', areaId: area.id, name },
      { method: 'post', action: '/settings' },
    );
  };

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <Input
        // A new key resets the field when the saved name changes
        key={area.name}
        defaultValue={area.name}
        aria-label="Area name"
        maxLength={AREA_NAME_MAX}
        onBlur={(e) => commitName(e.currentTarget.value)}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        className="h-9 w-60 max-w-full text-base font-semibold"
      />
      <div className="flex items-center gap-2">
        <Switch
          id={`area-alerts-${area.id}`}
          checked={alertsOn}
          onCheckedChange={(checked) =>
            alerts.submit(
              { intent: 'setAreaAlerts', areaId: area.id, enabled: String(checked) },
              { method: 'post', action: '/settings' },
            )
          }
        />
        <Label htmlFor={`area-alerts-${area.id}`} className="text-sm text-muted-foreground">
          Alerts
        </Label>
      </div>
      {others.length > 0 && (
        <Select
          value=""
          onValueChange={(into) =>
            join.submit(
              { intent: 'joinArea', areaId: area.id, into },
              { method: 'post', action: '/settings' },
            )
          }
        >
          <SelectTrigger size="sm" aria-label={`Join ${area.name} into another area`}>
            <SelectValue placeholder="Join into…" />
          </SelectTrigger>
          <SelectContent>
            {others.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

/** Which area a saved site is in, with a choice to start a new area for it. */
export function SiteAreaSelect({
  siteKey,
  areaId,
  areas,
  id,
}: {
  siteKey: string;
  areaId: string | null;
  areas: SettingsArea[];
  id?: string;
}) {
  const move = useFetcher({ key: `site-area:${siteKey}` });
  const pending = move.formData?.get('areaId');
  const value = typeof pending === 'string' ? pending : (areaId ?? '');
  return (
    <Select
      value={value}
      onValueChange={(next) =>
        move.submit(
          { intent: 'moveSite', siteKey, areaId: next },
          { method: 'post', action: '/settings' },
        )
      }
    >
      <SelectTrigger id={id} size="sm" className="w-[200px] max-w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {areas.map((a) => (
          <SelectItem key={a.id} value={a.id}>
            {a.name}
          </SelectItem>
        ))}
        <SelectItem value="new">New area</SelectItem>
      </SelectContent>
    </Select>
  );
}
