"""Pull day-ahead (previous_day1) forecasts for many models at airport stations, plus their METARs from IEM."""
import sys, json, os, urllib.request, urllib.parse; sys.path.insert(0, '.')
from om import fetch_many
OUT = os.environ.get('VERIFY_OUT', 'verify-out')
GLOBAL = "best_match ecmwf_ifs025 ecmwf_ifs ecmwf_aifs025_single gfs_global gfs_graphcast025 icon_global gem_global ukmo_global_deterministic_10km jma_gsm meteofrance_arpege_world cma_grapes_global bom_access_global kma_gdps".split()
US = "gfs_hrrr ncep_nbm_conus gem_hrdps_continental ncep_nam_conus ncep_aigfs025".split()
VARS = "precipitation wind_speed_10m wind_direction_10m wind_gusts_10m cloud_cover cape".split()
# station, lat, lon, tz, region, [(start, end)]
STATIONS = [
    ('SKGO', 4.7582, -75.9557, 'America/Bogota', 'Colombia', [('2024-12-01', '2025-03-31'), ('2025-12-01', '2026-03-31')]),
    ('SKCL', 3.5432, -76.3816, 'America/Bogota', 'Colombia', [('2024-12-01', '2025-03-31'), ('2025-12-01', '2026-03-31')]),
    ('SKPE', 4.8127, -75.7395, 'America/Bogota', 'Colombia', [('2024-12-01', '2025-03-31'), ('2025-12-01', '2026-03-31')]),
    ('VIGG', 32.1651, 76.2634, 'Asia/Kolkata', 'India', [('2025-10-01', '2025-11-30'), ('2026-03-01', '2026-05-31')]),
    ('VTPH', 12.6362, 99.9515, 'Asia/Bangkok', 'Thailand', [('2025-11-01', '2026-03-31')]),
    ('RNT', 47.4931, -122.2158, 'America/Los_Angeles', 'Washington', [('2026-04-01', '2026-09-30')]),
    ('EAT', 47.3989, -120.2068, 'America/Los_Angeles', 'Washington', [('2026-04-01', '2026-09-30')]),
    ('S52', 48.4249, -120.1458, 'America/Los_Angeles', 'Washington', [('2026-04-01', '2026-09-30')]),
]
# Rainy seasons, to check a rain rule still catches the days it really rains
WET = [
    ('SKGO', 4.7582, -75.9557, 'America/Bogota', 'Colombia', [('2025-04-01', '2025-05-31'), ('2025-10-01', '2025-11-30')]),
    ('SKCL', 3.5432, -76.3816, 'America/Bogota', 'Colombia', [('2025-04-01', '2025-05-31'), ('2025-10-01', '2025-11-30')]),
    ('SKPE', 4.8127, -75.7395, 'America/Bogota', 'Colombia', [('2025-04-01', '2025-05-31'), ('2025-10-01', '2025-11-30')]),
    ('VIGG', 32.1651, 76.2634, 'Asia/Kolkata', 'India', [('2025-07-01', '2025-08-31')]),
    ('VTPH', 12.6362, 99.9515, 'Asia/Bangkok', 'Thailand', [('2025-06-01', '2025-10-31')]),
]
WET_MODELS = "best_match ecmwf_ifs ecmwf_ifs025 icon_global gfs_global".split()
WHICH = os.environ.get('VERIFY_SET', 'dry')
base = 'https://previous-runs-api.open-meteo.com/v1/forecast'
jobs, keys = [], []
for sid, lat, lon, tz, region, periods in (WET if WHICH == 'wet' else STATIONS):
    models = WET_MODELS if WHICH == 'wet' else GLOBAL + (US if region == 'Washington' else [])
    for (s, e) in periods:
        for m in models:
            jobs.append((base, dict(latitude=lat, longitude=lon, hourly=','.join(v + '_previous_day1' for v in VARS),
                                    start_date=s, end_date=e, models=m, timezone=tz, wind_speed_unit='kmh')))
            keys.append((sid, s, m))
print(len(jobs), 'forecast requests', flush=True)
res = fetch_many(jobs, workers=6)
data = {}
for (sid, s, m), r in zip(keys, res):
    if isinstance(r, Exception):
        print('ERR', sid, s, m, str(r)[:120]); continue
    h = r['hourly']
    d = data.setdefault(sid, {}).setdefault(m, {})
    for i, t in enumerate(h['time']):
        d[t] = {v: h.get(v + '_previous_day1', [None] * len(h['time']))[i] for v in VARS}
json.dump(data, open(os.path.join(OUT, 'forecasts.json'), 'w'))
print('forecasts saved', flush=True)

