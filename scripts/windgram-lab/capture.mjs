// Captures raw Open-Meteo responses for a few windgram reference sites, so
// windgram changes can be checked against real forecasts offline. Run on a
// GitHub runner (Open-Meteo is rate limited on shared dev machines):
//   node scripts/windgram-lab/capture.mjs out-dir
import { mkdirSync, writeFileSync } from 'node:fs';

const out = process.argv[2] ?? 'windgram-lab-out';
mkdirSync(`${out}/raw`, { recursive: true });

const SITES = [
  // Same points as the PNW forecast's TigerHikeLookout and Poo_Poo_Point
  { key: 'tiger', lat: 47.508, lon: -121.985 },
  { key: 'poo-poo', lat: 47.49927, lon: -122.00819 },
  { key: 'chelan', lat: 47.81, lon: -120.07 },
  // canadarasp's Woodside windgram
  { key: 'woodside', lat: 49.24624, lon: -121.89889 },
];
const MODELS = {
  tiger: ['best_match', 'ncep_hrrr_conus', 'gfs_seamless', 'gem_hrdps_continental'],
  'poo-poo': ['best_match'],
  chelan: ['best_match'],
  woodside: ['best_match', 'gem_hrdps_continental'],
};

const SURFACE = [
  'temperature_2m', 'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m', 'cloud_cover',
  'cape', 'precipitation_probability', 'boundary_layer_height', 'convective_inhibition',
  'lifted_index', 'shortwave_radiation', 'dew_point_2m', 'precipitation', 'cloud_cover_low',
  'visibility',
  // Candidates: are these available, and from which models?
  'sensible_heat_flux', 'latent_heat_flux', 'freezing_level_height', 'surface_pressure',
  'temperature_80m', 'temperature_120m', 'temperature_180m',
  'wind_speed_80m', 'wind_direction_80m', 'wind_speed_120m', 'wind_direction_120m',
  'wind_speed_180m', 'wind_direction_180m', 'updraft',
];
const LEVELS = [1000, 975, 950, 925, 900, 875, 850, 825, 800, 775, 750, 725, 700, 650, 600, 550, 500];
const LEVEL_PARAMS = ['temperature', 'wind_speed', 'wind_direction', 'relative_humidity', 'geopotential_height', 'cloud_cover'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const summary = [];

for (const site of SITES) {
  for (const model of MODELS[site.key]) {
    let vars = [...SURFACE, ...LEVEL_PARAMS.flatMap((p) => LEVELS.map((l) => `${p}_${l}hPa`))];
    const dropped = [];
    let data = null;
    for (let attempt = 0; attempt < 12; attempt++) {
      const params = new URLSearchParams({
        latitude: String(site.lat),
        longitude: String(site.lon),
        hourly: vars.join(','),
        daily: 'sunrise,sunset',
        forecast_days: '7',
        timezone: 'auto',
        elevation: 'nan',
      });
      if (model !== 'best_match') params.set('models', model);
      const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
      const body = await res.json().catch(() => ({ error: true, reason: `HTTP ${res.status}` }));
      if (!body.error) {
        data = body;
        break;
      }
      const bad = vars.find((v) => String(body.reason).includes(v));
      console.log(`${site.key}/${model}: ${body.reason}`);
      if (!bad) {
        if (res.status === 429) {
          await sleep(20000);
          continue;
        }
        break;
      }
      dropped.push(bad);
      vars = vars.filter((v) => v !== bad);
      await sleep(500);
    }
    if (!data) continue;
    writeFileSync(`${out}/raw/${site.key}-${model}.json`, JSON.stringify(data));
    const nonNull = Object.fromEntries(
      Object.entries(data.hourly)
        .filter(([k]) => k !== 'time')
        .map(([k, v]) => [k, v.filter((x) => x !== null).length]),
    );
    const empty = Object.entries(nonNull).filter(([, n]) => n === 0).map(([k]) => k);
    const levelsWithData = LEVELS.filter((l) => nonNull[`temperature_${l}hPa`] > 0);
    summary.push({
      site: site.key, model, elevation: data.elevation, timezone: data.timezone,
      hours: data.hourly.time.length, dropped, levelsWithData,
      emptySurface: empty.filter((k) => !k.includes('hPa')),
      partial: Object.entries(nonNull).filter(([, n]) => n > 0 && n < data.hourly.time.length).map(([k, n]) => `${k}:${n}`),
    });
    console.log(JSON.stringify(summary.at(-1)));
    await sleep(1500);
  }
}
writeFileSync(`${out}/summary.json`, JSON.stringify(summary, null, 2));
