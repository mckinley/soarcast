import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  LayerGroup,
  Marker,
  Popup,
  TileLayer,
  WMSTileLayer,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import L, { type ControlPosition } from 'leaflet';
import { Layers, X } from 'lucide-react';
import { useRouteLoaderData } from 'react-router';
import {
  AIRSPACE_ATTRIBUTION,
  EUMETSAT_ATTRIBUTION,
  KK7_ATTRIBUTION,
  NASA_GIBS_ATTRIBUTION,
  NOAA_LIGHTNING_ATTRIBUTION,
  RAINVIEWER_ATTRIBUTION,
  WINDS_MOBI_ATTRIBUTION,
} from '@/components/data-credits';
import {
  freshStations,
  readingText,
  WIND_ARROW_PATH,
  windColor,
  withinQuery,
  type WindStation,
} from '@/lib/wind-now';
import {
  AIRSPACE_MAX_ZOOM,
  AIRSPACE_MIN_ZOOM,
  KK7_SEASONS,
  KK7_TIMES,
  LIGHTNING_SOURCES,
  MAP_NOW_REFRESH_MINUTES,
  RAINVIEWER_MAPS,
  RAINVIEWER_MAX_ZOOM,
  ageText,
  cloudImageryAt,
  gibsProbeUrl,
  gibsTileUrl,
  kk7TileUrl,
  layerCapabilitiesUrl,
  lightningSourcesAt,
  newestRain,
  newestWmsTime,
  workspaceWmsUrl,
  type Imagery,
  type Kk7Season,
  type Kk7Time,
} from '@/lib/map-layers';

// The map's layer panel: kk7's thermal maps (by time of year and of day),
// rain, clouds and lightning now, and airspace once openAIP's key is set.
// Sources and rules are in src/lib/map-layers.ts. A pilot's choices are kept
// in this browser.

type LayerId = 'thermals' | 'skyways' | 'wind' | 'rain' | 'clouds' | 'lightning' | 'airspace';

const LAYER_IDS: LayerId[] = [
  'thermals',
  'skyways',
  'wind',
  'rain',
  'clouds',
  'lightning',
  'airspace',
];
const STORAGE_KEY = 'soarcast.map-layers';
const REFRESH_MS = MAP_NOW_REFRESH_MINUTES * 60 * 1000;

interface Choices {
  on: LayerId[];
  season: Kk7Season;
  time: Kk7Time;
}

function loadChoices(fallback: Choices): Choices {
  try {
    const saved = JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? 'null',
    ) as Partial<Choices> | null;
    if (!saved || !Array.isArray(saved.on)) return fallback;
    return {
      on: saved.on.filter((id): id is LayerId => LAYER_IDS.includes(id as LayerId)),
      season: KK7_SEASONS.some((s) => s.id === saved.season) ? (saved.season as Kk7Season) : 'all',
      time: KK7_TIMES.some((t) => t.id === saved.time) ? (saved.time as Kk7Time) : 'all',
    };
  } catch {
    return fallback;
  }
}

function saveChoices(choices: Choices) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(choices));
  } catch {
    // A private window or blocked storage: the choice lasts this page only
  }
}

/** A Leaflet control whose contents React draws. */
function MapControl({ position, children }: { position: ControlPosition; children: ReactNode }) {
  const map = useMap();
  const [el] = useState(() => {
    const div = L.DomUtil.create('div', 'leaflet-control');
    L.DomEvent.disableClickPropagation(div);
    L.DomEvent.disableScrollPropagation(div);
    return div;
  });
  useEffect(() => {
    const Control = L.Control.extend({ onAdd: () => el, onRemove: () => undefined });
    const control = new Control({ position });
    control.addTo(map);
    return () => {
      control.remove();
    };
  }, [map, el, position]);
  return createPortal(children, el);
}

/** A value fetched while `on`, again every few minutes. */
function usePolled<T>(on: boolean, key: string, load: () => Promise<T | null>): T | null {
  const [value, setValue] = useState<{ key: string; value: T | null } | null>(null);
  useEffect(() => {
    if (!on) return;
    let live = true;
    const run = () =>
      load()
        .catch(() => null)
        .then((v) => {
          if (live) setValue({ key, value: v });
        });
    run();
    const timer = setInterval(run, REFRESH_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
    // `key` names what `load` fetches, so a new `load` alone fetches nothing
  }, [on, key]);
  return value && value.key === key ? value.value : null;
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status}`);
  return res.text();
}

/** The newest picture time (ms) a satellite picture offers. */
async function newestImageryTime(imagery: Imagery): Promise<number | null> {
  if (imagery.kind === 'gibs') {
    const res = await fetch(gibsProbeUrl(imagery), { method: 'HEAD' });
    const t = Date.parse(res.headers.get('layer-time-actual') ?? '');
    return Number.isFinite(t) ? t : null;
  }
  return newestWmsTime(
    await fetchText(layerCapabilitiesUrl(imagery.root, imagery.workspace, imagery.layer)),
  );
}

/** WMS times as the services name them, to the second. */
const wmsTime = (ms: number) => new Date(ms).toISOString().replace('.000Z', 'Z');

/** The map's centre, kept up to date as the pilot pans. */
function useCenter(): { lat: number; lng: number } {
  const map = useMap();
  const [center, setCenter] = useState(() => map.getCenter());
  useMapEvents({ moveend: () => setCenter(map.getCenter()) });
  return center;
}

function Check({
  label,
  checked,
  onChange,
  note,
}: {
  label: string;
  checked: boolean;
  onChange: (on: boolean) => void;
  note?: string | null;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2 py-0.5">
      <input
        type="checkbox"
        className="mt-0.5"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        {label}
        {note && <span className="block text-[11px] text-muted-foreground">{note}</span>}
      </span>
    </label>
  );
}

export function MapLayers({ hotspotsOn = false }: { hotspotsOn?: boolean }) {
  const root = useRouteLoaderData('root') as { airspace?: boolean } | undefined;
  const airspaceReady = Boolean(root?.airspace);
  const [open, setOpen] = useState(false);
  const [choices, setChoices] = useState<Choices>(() =>
    loadChoices({ on: hotspotsOn ? ['thermals'] : [], season: 'all', time: 'all' }),
  );
  const center = useCenter();
  const [windNote, setWindNote] = useState<string | null>('Loading');
  const src = typeof window === 'undefined' ? 'soarcast' : window.location.hostname;

  const update = (next: Partial<Choices>) => {
    setChoices((prev) => {
      const merged = { ...prev, ...next };
      saveChoices(merged);
      return merged;
    });
  };
  const isOn = (id: LayerId) => choices.on.includes(id) && (id !== 'airspace' || airspaceReady);
  const toggle = (id: LayerId, on: boolean) =>
    update({
      on: on ? [...choices.on.filter((x) => x !== id), id] : choices.on.filter((x) => x !== id),
    });

  // Rain now: RainViewer's newest radar picture
  const rain = usePolled(isOn('rain'), 'rain', async () =>
    newestRain(JSON.parse(await fetchText(RAINVIEWER_MAPS))),
  );

  // Clouds now: the satellite that sees the map's middle, visible light by day
  const clouds = cloudImageryAt(center.lat, center.lng, Date.now());
  const cloudKey = `${clouds.satellite.id}:${clouds.visible ? 'day' : 'night'}`;
  const cloudTime = usePolled(isOn('clouds'), cloudKey, () => newestImageryTime(clouds.imagery));

  // Lightning now: the sources that cover the map's middle, and their newest time
  const lightningTimes = usePolled(isOn('lightning'), 'lightning', async () => {
    const times = await Promise.all(
      LIGHTNING_SOURCES.map((s) =>
        fetchText(layerCapabilitiesUrl(s.root, s.workspace, s.layer))
          .then(newestWmsTime)
          .catch(() => null),
      ),
    );
    return Object.fromEntries(LIGHTNING_SOURCES.map((s, i) => [s.id, times[i]])) as Record<
      string,
      number | null
    >;
  });
  const lightningHere = lightningSourcesAt(center.lat, center.lng);

  const now = Date.now();
  const rainNote = isOn('rain') ? (rain ? `Radar ${ageText(rain.at, now)}` : 'Loading') : null;
  const cloudNote = isOn('clouds')
    ? cloudTime
      ? `${clouds.satellite.name}, ${clouds.visible ? 'daylight' : 'infrared'}, ${ageText(cloudTime, now)}`
      : 'Loading'
    : null;
  const newestLightning = lightningHere
    .map((s) => lightningTimes?.[s.id] ?? null)
    .filter((t): t is number => t != null)
    .sort((a, b) => b - a)[0];
  const lightningNote = isOn('lightning')
    ? lightningHere.length === 0
      ? 'No lightning data here'
      : newestLightning
        ? `Updated ${ageText(newestLightning, now)}`
        : 'Loading'
    : null;

  const thermalsShown = isOn('thermals') || isOn('skyways');

  return (
    <>
      <MapControl position="topright">
        {open ? (
          <div className="w-56 max-h-[260px] overflow-y-auto rounded-md border bg-background p-2 text-xs text-foreground shadow-md">
            <div className="mb-1 flex items-center justify-between">
              <span className="font-semibold">Map layers</span>
              <button
                type="button"
                className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                onClick={() => setOpen(false)}
                aria-label="Close map layers"
              >
                <X className="size-4" />
              </button>
            </div>
            <Check
              label="Thermal hotspots"
              checked={isOn('thermals')}
              onChange={(v) => toggle('thermals', v)}
            />
            <Check
              label="Skyways"
              checked={isOn('skyways')}
              onChange={(v) => toggle('skyways', v)}
            />
            {thermalsShown && (
              <div className="mb-1 ml-5 grid gap-1">
                <select
                  className="rounded border bg-background px-1 py-0.5"
                  value={choices.season}
                  onChange={(e) => update({ season: e.target.value as Kk7Season })}
                  aria-label="Time of year"
                >
                  {KK7_SEASONS.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
                <select
                  className="rounded border bg-background px-1 py-0.5"
                  value={choices.time}
                  onChange={(e) => update({ time: e.target.value as Kk7Time })}
                  aria-label="Time of day"
                >
                  {KK7_TIMES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <Check
              label="Wind now"
              checked={isOn('wind')}
              onChange={(v) => toggle('wind', v)}
              note={isOn('wind') ? windNote : null}
            />
            <Check
              label="Rain now"
              checked={isOn('rain')}
              onChange={(v) => toggle('rain', v)}
              note={rainNote}
            />
            <Check
              label="Clouds now"
              checked={isOn('clouds')}
              onChange={(v) => toggle('clouds', v)}
              note={cloudNote}
            />
            <Check
              label="Lightning now"
              checked={isOn('lightning')}
              onChange={(v) => toggle('lightning', v)}
              note={lightningNote}
            />
            {airspaceReady && (
              <Check
                label="Airspace"
                checked={isOn('airspace')}
                onChange={(v) => toggle('airspace', v)}
              />
            )}
            <a
              href="/guide/data-sources#maps"
              className="mt-1 block text-[11px] text-muted-foreground underline"
            >
              About these layers
            </a>
          </div>
        ) : (
          <button
            type="button"
            className="flex size-9 items-center justify-center rounded-md border bg-background text-foreground shadow-md"
            onClick={() => setOpen(true)}
            aria-label="Map layers"
            title="Map layers"
          >
            <Layers className="size-5" />
          </button>
        )}
      </MapControl>

      {isOn('clouds') && cloudTime && (
        <CloudLayer imagery={clouds.imagery} credit={clouds.satellite.credit} at={cloudTime} />
      )}
      {isOn('rain') && rain && (
        <TileLayer
          key={rain.url}
          url={rain.url}
          maxNativeZoom={RAINVIEWER_MAX_ZOOM}
          opacity={0.7}
          zIndex={2}
          pane="overlayPane"
          attribution={RAINVIEWER_ATTRIBUTION}
        />
      )}
      {isOn('thermals') && (
        <TileLayer
          url={kk7TileUrl('thermals', choices.season, choices.time, src)}
          tms
          maxNativeZoom={12}
          opacity={0.75}
          zIndex={3}
          pane="overlayPane"
          attribution={KK7_ATTRIBUTION}
        />
      )}
      {isOn('skyways') && (
        <TileLayer
          url={kk7TileUrl('skyways', choices.season, choices.time, src)}
          tms
          maxNativeZoom={13}
          opacity={0.75}
          zIndex={4}
          pane="overlayPane"
          attribution={KK7_ATTRIBUTION}
        />
      )}
      {isOn('airspace') && (
        <TileLayer
          url="/api/airspace/{z}/{x}/{y}"
          minNativeZoom={AIRSPACE_MIN_ZOOM}
          maxNativeZoom={AIRSPACE_MAX_ZOOM}
          opacity={0.8}
          zIndex={5}
          pane="overlayPane"
          attribution={AIRSPACE_ATTRIBUTION}
        />
      )}
      {isOn('wind') && <WindStationsLayer onNote={setWindNote} />}
      {isOn('lightning') &&
        lightningHere.map((s) => {
          const at = lightningTimes?.[s.id];
          return at ? (
            <LightningLayer
              key={s.id}
              url={workspaceWmsUrl(s.root, s.workspace)}
              layer={s.layer}
              at={at}
              credit={s.credit}
            />
          ) : null;
        })}
    </>
  );
}

function CloudLayer({
  imagery,
  credit,
  at,
}: {
  imagery: Imagery;
  credit: 'nasa' | 'eumetsat';
  at: number;
}) {
  const attribution = credit === 'nasa' ? NASA_GIBS_ATTRIBUTION : EUMETSAT_ATTRIBUTION;
  const params = useMemo(
    () =>
      imagery.kind === 'wms'
        ? {
            layers: imagery.layer,
            format: 'image/png',
            transparent: true,
            version: '1.3.0',
            time: wmsTime(at),
          }
        : null,
    [imagery, at],
  );
  if (imagery.kind === 'gibs') {
    return (
      <TileLayer
        key={`${imagery.layer}:${at}`}
        url={gibsTileUrl(imagery, wmsTime(at))}
        maxNativeZoom={imagery.maxNativeZoom}
        opacity={0.75}
        zIndex={1}
        pane="overlayPane"
        attribution={attribution}
      />
    );
  }
  return (
    <WMSTileLayer
      key={imagery.layer}
      url={workspaceWmsUrl(imagery.root, imagery.workspace)}
      params={params!}
      maxNativeZoom={imagery.maxNativeZoom}
      opacity={0.75}
      zIndex={1}
      pane="overlayPane"
      attribution={attribution}
    />
  );
}

function LightningLayer({
  url,
  layer,
  at,
  credit,
}: {
  url: string;
  layer: string;
  at: number;
  credit: 'noaa' | 'eumetsat';
}) {
  const params = useMemo(
    () => ({
      layers: layer,
      format: 'image/png',
      transparent: true,
      version: '1.3.0',
      time: wmsTime(at),
    }),
    [layer, at],
  );
  return (
    <WMSTileLayer
      url={url}
      params={params}
      opacity={0.9}
      zIndex={6}
      pane="overlayPane"
      attribution={credit === 'noaa' ? NOAA_LIGHTNING_ATTRIBUTION : EUMETSAT_ATTRIBUTION}
    />
  );
}

const WIND_COLORS = { green: '#16a34a', amber: '#d97706', red: '#dc2626' } as const;

/** A station's arrow (pointing the way the wind blows) and its average speed. */
function windIcon(s: WindStation): L.DivIcon {
  const speed = Math.round(s.speed);
  return L.divIcon({
    className: '',
    iconSize: [28, 36],
    iconAnchor: [14, 13],
    html: `<div style="display:flex;flex-direction:column;align-items:center;gap:1px">
      <svg width="26" height="26" viewBox="0 0 24 24" style="transform:rotate(${s.direction + 180}deg);filter:drop-shadow(0 0 1px #fff)">
        <path d="${WIND_ARROW_PATH}" fill="${WIND_COLORS[windColor(s)]}" stroke="#fff" stroke-width="1"/>
      </svg>
      <span style="font:600 10px system-ui,sans-serif;line-height:12px;color:#111;background:rgba(255,255,255,.85);border-radius:3px;padding:0 2px">${speed}</span>
    </div>`,
  });
}

/** The fresh stations inside the map's view, as arrows, again on each pan and every few minutes. */
function WindStationsLayer({ onNote }: { onNote: (note: string | null) => void }) {
  const map = useMap();
  const [view, setView] = useState(() => map.getBounds());
  useMapEvents({ moveend: () => setView(map.getBounds()) });
  const round = (x: number) => Math.round(x * 20) / 20;
  const box = [view.getSouth(), view.getWest(), view.getNorth(), view.getEast()].map(round);
  const stations = usePolled(true, box.join(','), async () =>
    freshStations(
      JSON.parse(await fetchText(withinQuery(box[0], box[1], box[2], box[3]))),
      Math.floor(Date.now() / 1000),
    ),
  );
  useEffect(() => {
    onNote(
      stations == null
        ? 'Loading'
        : stations.length === 0
          ? 'No station here has a fresh reading'
          : `${stations.length} ${stations.length === 1 ? 'station' : 'stations'} in view`,
    );
  }, [stations, onNote]);
  const now = Date.now();
  return (
    <LayerGroup attribution={WINDS_MOBI_ATTRIBUTION}>
      {(stations ?? []).map((s) => (
        <Marker key={s.id} position={[s.latitude, s.longitude]} icon={windIcon(s)}>
          <Popup>
            <div className="space-y-0.5 text-xs">
              <p className="font-semibold">
                {s.url ? (
                  <a href={s.url} target="_blank" rel="noreferrer">
                    {s.name}
                  </a>
                ) : (
                  s.name
                )}
              </p>
              <p>
                {readingText(s)}, {ageText(s.at * 1000, now)}
              </p>
              <p className="text-muted-foreground">
                {s.altitude != null ? `${s.altitude} m, ` : ''}from {s.provider}
              </p>
            </div>
          </Popup>
        </Marker>
      ))}
    </LayerGroup>
  );
}
