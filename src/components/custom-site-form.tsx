import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Form, Link, useNavigation } from 'react-router';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  DirectionLegend,
  LaunchDirectionPicker,
  type DirectionRating,
} from '@/components/launch-direction-picker';
import type { MapFocus } from '@/components/map-picker';
import { COMPASS_POINTS } from '@/lib/site-utils';
import { DEFAULT_MAX_WIND_KMH } from '@/lib/forecast-engine';
import {
  MAX_NAME_LENGTH,
  MAX_NOTES_LENGTH,
  MAX_WIND_LIMIT,
  MIN_WIND_LIMIT,
  type CustomSiteErrors,
  type CustomSiteField,
  type CustomSiteInput,
} from '@/lib/custom-sites';
import type { TerrainResponse } from '~/app/routes/api.terrain';
import {
  GOAL_HINT,
  GOAL_LABEL,
  SITE_GOALS,
  SITE_KIND_LABEL,
  SITE_KINDS,
  defaultGoal,
} from '@/lib/site-goals';
import type { SiteGoal, SiteKind } from '@/types';

const SELECT_CLASS =
  'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring dark:bg-input/30';

// Leaflet needs window, so the map only renders in the browser
const MapPicker = lazy(() =>
  // Never rendered on the server: leaving the import out of the server build
  // keeps Leaflet and MapLibre (about 2 MB) out of the Worker.
  import.meta.env.SSR
    ? new Promise<never>(() => {})
    : import('@/components/map-picker').then((mod) => ({ default: mod.MapPicker })),
);

function MapPlaceholder() {
  return (
    <div className="h-[320px] sm:h-[400px] rounded-md border bg-muted animate-pulse flex items-center justify-center">
      <p className="text-sm text-muted-foreground">Loading map…</p>
    </div>
  );
}

type Ratings = Record<number, DirectionRating>;

function ratingsFrom(good: number[], ok: number[]): Ratings {
  return Object.fromEntries(
    COMPASS_POINTS.map(({ degrees }) => [
      degrees,
      good.includes(degrees) ? 2 : ok.includes(degrees) ? 1 : 0,
    ]),
  );
}

function rated(ratings: Ratings, rating: DirectionRating): number[] {
  return COMPASS_POINTS.map((p) => p.degrees).filter((d) => (ratings[d] ?? 0) === rating);
}

/** "W", "W and NW", "SW, W and NW" */
function compassList(degrees: number[]): string {
  const labels = COMPASS_POINTS.filter((p) => degrees.includes(p.degrees)).map((p) => p.label);
  return labels.length <= 1
    ? (labels[0] ?? '')
    : `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}

function parseCoordinates(text: string): MapFocus | null {
  const match = text.match(/^\s*(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (!match) return null;
  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  return Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 ? { latitude, longitude } : null;
}

type TerrainState =
  | { status: 'idle' | 'loading' | 'error' }
  | { status: 'ready'; data: TerrainResponse };

interface CustomSiteFormProps {
  /** Saved values when editing; omit to add a new site */
  initial?: CustomSiteInput;
  errors?: CustomSiteErrors;
  submitLabel: string;
  cancelHref: string;
}

export function CustomSiteForm({ initial, errors, submitLabel, cancelHref }: CustomSiteFormProps) {
  const navigation = useNavigation();
  const submitting = navigation.state === 'submitting';
  const editing = initial !== undefined;

  const [isClient, setIsClient] = useState(false);
  useEffect(() => setIsClient(true), []);

  const [name, setName] = useState(initial?.name ?? '');
  const [pin, setPin] = useState<MapFocus | null>(
    initial ? { latitude: initial.latitude, longitude: initial.longitude } : null,
  );
  const [focus, setFocus] = useState<MapFocus | null>(null);
  const [coordsText, setCoordsText] = useState('');
  const [elevation, setElevation] = useState(
    initial?.elevation != null ? String(initial.elevation) : '',
  );
  const [ratings, setRatings] = useState<Ratings>(
    ratingsFrom(initial?.goodDirections ?? [], initial?.okDirections ?? []),
  );
  const [maxWind, setMaxWind] = useState(String(initial?.maxWindSpeed ?? DEFAULT_MAX_WIND_KMH));
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [share, setShare] = useState(initial?.share ?? false);
  const [kind, setKind] = useState<SiteKind | ''>(initial?.kind ?? '');
  const [goal, setGoal] = useState<SiteGoal>(
    initial?.goal ?? defaultGoal(initial?.kind ?? null, true),
  );
  const [terrain, setTerrain] = useState<TerrainState>({ status: 'idle' });

  // A field's error from the last submit goes away once the pilot changes it
  const [shownErrors, setShownErrors] = useState<CustomSiteErrors>(errors ?? {});
  useEffect(() => setShownErrors(errors ?? {}), [errors]);
  const clearError = (field: CustomSiteField) =>
    setShownErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));

  // Terrain fills in elevation and directions until the pilot sets them.
  // Moving the pin re-reads the elevation; directions, once touched, stay.
  const elevationTouched = useRef(editing);
  const directionsTouched = useRef(editing);

  useEffect(() => {
    setCoordsText(pin ? `${pin.latitude.toFixed(5)}, ${pin.longitude.toFixed(5)}` : '');
    if (!pin) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setTerrain({ status: 'loading' });
      try {
        const response = await fetch(
          `/api/terrain?lat=${pin.latitude.toFixed(5)}&lng=${pin.longitude.toFixed(5)}`,
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error(`Terrain answered ${response.status}`);
        const data = (await response.json()) as TerrainResponse;
        setTerrain({ status: 'ready', data });
        if (!elevationTouched.current) setElevation(String(data.elevation));
        if (!directionsTouched.current) {
          setRatings(ratingsFrom(data.suggestion.good, data.suggestion.ok));
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error('Terrain lookup failed:', error);
          setTerrain({ status: 'error' });
        }
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [pin]);

  const placePin = (latitude: number, longitude: number) => {
    clearError('location');
    elevationTouched.current = false;
    setPin({ latitude, longitude });
  };

  const commitCoordinates = () => {
    const parsed = parseCoordinates(coordsText);
    if (parsed) {
      placePin(parsed.latitude, parsed.longitude);
      setFocus(parsed);
    }
  };

  const good = rated(ratings, 2);
  const ok = rated(ratings, 1);
  const suggestion = terrain.status === 'ready' ? terrain.data.suggestion : null;
  const followsSuggestion =
    suggestion !== null &&
    suggestion.good.join() === good.join() &&
    suggestion.ok.join() === ok.join();

  return (
    <Form method="post" className="space-y-6">
      <input type="hidden" name="intent" value="save" />
      <input type="hidden" name="latitude" value={pin?.latitude.toFixed(6) ?? ''} />
      <input type="hidden" name="longitude" value={pin?.longitude.toFixed(6) ?? ''} />
      <input type="hidden" name="good" value={good.join(',')} />
      <input type="hidden" name="ok" value={ok.join(',')} />

      <div className="grid gap-2">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          name="name"
          value={name}
          maxLength={MAX_NAME_LENGTH}
          onChange={(e) => {
            clearError('name');
            setName(e.target.value);
          }}
          placeholder="e.g. Mailbox Peak"
        />
        {shownErrors.name && <p className="text-sm text-red-500">{shownErrors.name}</p>}
      </div>

      <div className="grid gap-2">
        <Label>Launch location</Label>
        {isClient ? (
          <Suspense fallback={<MapPlaceholder />}>
            <MapPicker
              latitude={pin?.latitude ?? null}
              longitude={pin?.longitude ?? null}
              onLocationSelect={placePin}
              focus={focus}
            />
          </Suspense>
        ) : (
          <MapPlaceholder />
        )}
        <div className="grid gap-1">
          <Label htmlFor="coordinates" className="text-xs text-muted-foreground font-normal">
            Or paste coordinates (latitude, longitude)
          </Label>
          <Input
            id="coordinates"
            value={coordsText}
            onChange={(e) => setCoordsText(e.target.value)}
            onBlur={commitCoordinates}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitCoordinates();
              }
            }}
            placeholder="47.48810, -121.72350"
            inputMode="decimal"
          />
        </div>
        {shownErrors.location && <p className="text-sm text-red-500">{shownErrors.location}</p>}
      </div>

      {terrain.status === 'ready' && terrain.data.nearby.length > 0 && (
        <Card className="p-4 text-sm space-y-2 border-sky-300 bg-sky-50 dark:border-sky-800 dark:bg-sky-950/30">
          <p className="font-medium">Already listed nearby</p>
          <ul className="space-y-1">
            {terrain.data.nearby.map((site) => (
              <li key={site.slug}>
                <a
                  href={`/sites/${site.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="underline hover:text-primary"
                >
                  {site.name}
                </a>{' '}
                <span className="text-muted-foreground">{site.distanceKm} km away</span>
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground">
            If one of these is your launch, you can follow it instead of adding it again.
          </p>
        </Card>
      )}

      <div className="grid gap-2 sm:max-w-xs">
        <Label htmlFor="elevation">Launch elevation (m)</Label>
        <Input
          id="elevation"
          name="elevation"
          type="number"
          inputMode="numeric"
          min={0}
          value={elevation}
          onChange={(e) => {
            elevationTouched.current = true;
            clearError('elevation');
            setElevation(e.target.value);
          }}
          placeholder={terrain.status === 'loading' ? 'Looking up…' : ''}
        />
        <p className="text-xs text-muted-foreground">
          {terrain.status === 'error'
            ? "Couldn't look up the terrain here. Enter the launch height."
            : terrain.status === 'ready' && elevation === String(terrain.data.elevation)
              ? 'From terrain data at the pin. Correct it if you know the launch height.'
              : 'SoarCast reads the wind at this height, so the launch height matters.'}
        </p>
        {shownErrors.elevation && <p className="text-sm text-red-500">{shownErrors.elevation}</p>}
      </div>

      <div className="grid gap-3">
        <div>
          <Label>Wind directions the launch works in</Label>
          <p className="text-xs text-muted-foreground mt-1">
            Tap a direction the wind comes from to cycle: works well, works cross, off.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <LaunchDirectionPicker
            ratings={ratings}
            onChange={(degrees, rating) => {
              directionsTouched.current = true;
              setRatings({ ...ratings, [degrees]: rating });
            }}
          />
          <div className="space-y-3 text-sm sm:max-w-xs">
            <DirectionLegend />
            {suggestion &&
              (suggestion.good.length > 0 ? (
                <p className="text-muted-foreground">
                  The ground falls away steeply to the {compassList(suggestion.good)}
                  {suggestion.ok.length > 0 && (
                    <>, and less steeply to the {compassList(suggestion.ok)}</>
                  )}
                  .
                </p>
              ) : (
                <p className="text-muted-foreground">
                  The terrain here is too gentle to suggest a direction.
                </p>
              ))}
            {suggestion && suggestion.good.length > 0 && !followsSuggestion && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  directionsTouched.current = true;
                  setRatings(ratingsFrom(suggestion.good, suggestion.ok));
                }}
              >
                Use the terrain suggestion
              </Button>
            )}
            {good.length === 0 && ok.length === 0 && (
              <p className="text-muted-foreground">
                With no directions set, SoarCast treats the launch as working in any wind direction.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-2 sm:max-w-xs">
        <Label htmlFor="maxWindSpeed">Wind limit (km/h)</Label>
        <Input
          id="maxWindSpeed"
          name="maxWindSpeed"
          type="number"
          inputMode="numeric"
          min={MIN_WIND_LIMIT}
          max={MAX_WIND_LIMIT}
          value={maxWind}
          onChange={(e) => {
            clearError('maxWindSpeed');
            setMaxWind(e.target.value);
          }}
        />
        <p className="text-xs text-muted-foreground">
          Hours with more wind than this at launch height count as unflyable.
        </p>
        {shownErrors.maxWindSpeed && (
          <p className="text-sm text-red-500">{shownErrors.maxWindSpeed}</p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="kind">What the launch gives</Label>
          <select
            id="kind"
            name="kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as SiteKind | '')}
            className={SELECT_CLASS}
          >
            <option value="">Not sure: go by the weather</option>
            {SITE_KINDS.map((k) => (
              <option key={k} value={k}>
                {SITE_KIND_LABEL[k]}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            A ridge-only launch never counts as a thermal day, and a sled-only one never soars.
          </p>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="goal">Worth going when</Label>
          <select
            id="goal"
            name="goal"
            value={goal}
            onChange={(e) => setGoal(e.target.value as SiteGoal)}
            className={SELECT_CLASS}
          >
            {SITE_GOALS.map((g) => (
              <option key={g} value={g}>
                {GOAL_LABEL[g]}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            {GOAL_HINT[goal]} Those days show as a go, and alerts come for them.
          </p>
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="notes">Notes</Label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          maxLength={MAX_NOTES_LENGTH}
          value={notes}
          onChange={(e) => {
            clearError('notes');
            setNotes(e.target.value);
          }}
          placeholder="Trail, landing, hazards"
          className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring"
        />
        {shownErrors.notes && <p className="text-sm text-red-500">{shownErrors.notes}</p>}
      </div>

      <div className="grid gap-1">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            name="share"
            checked={share}
            onChange={(e) => {
              clearError('share');
              setShare(e.target.checked);
            }}
            className="h-4 w-4"
          />
          Share with other pilots
        </label>
        <p className="text-xs text-muted-foreground">
          Other pilots can then find this launch in Browse Sites and follow it. They see its name,
          place, height, wind directions and what it gives. Notes, the wind limit and the goal stay
          private.
        </p>
        {shownErrors.share && <p className="text-sm text-red-500">{shownErrors.share}</p>}
      </div>

      <div className="flex gap-3">
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : submitLabel}
        </Button>
        <Button type="button" variant="outline" asChild>
          <Link to={cancelHref}>Cancel</Link>
        </Button>
      </div>
    </Form>
  );
}
