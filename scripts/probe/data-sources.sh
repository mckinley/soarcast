#!/usr/bin/env bash
# Checks which forecast, history and live-data sources answer for Tiger
# Mountain, and which variables come back non-empty. Read-only; prints a
# compact summary for planning. Run from GitHub Actions (needs open egress).
set -u
LAT=47.4875; LNG=-121.9913
UA='SoarCast data probe (github.com/mckinley/soarcast)'

# TEMP: why the track record for Cartago (SKGO) failed
for st in "4.758 -75.956" "4.455 -75.766" "47.49512 -122.21443"; do
  set -- $st
  url="https://previous-runs-api.open-meteo.com/v1/forecast?latitude=$1&longitude=$2&hourly=precipitation_previous_day1,wind_speed_10m_previous_day1,wind_direction_10m_previous_day1&start_date=2025-10-20&end_date=2026-10-19&timezone=auto"
  echo "== previous runs $st"
  curl -sS --max-time 60 -A "$UA" -o pr.json -w 'HTTP %{http_code} %{size_download} bytes %{time_total}s\n' "$url"
  head -c 300 pr.json; echo
done

# Prints, per hourly variable, how many of its values are non-null
counts() { jq -c '(.error // empty), (.reason // empty), (.hourly // {} | to_entries | map(select(.key != "time")) | map({(.key): (.value | map(select(. != null)) | length)}) | add)' 2>/dev/null; }

probe() {
  local label=$1 url=$2
  echo "== $label"
  curl -sS --max-time 60 -A "$UA" "$url" | counts
}

OM=https://api.open-meteo.com/v1/forecast
probe "HRRR: wind aloft, BL height, CAPE" \
  "$OM?latitude=$LAT&longitude=$LNG&models=ncep_hrrr_conus&forecast_days=2&hourly=wind_speed_850hPa,wind_direction_850hPa,wind_speed_900hPa,temperature_850hPa,boundary_layer_height,cape,lifted_index,convective_inhibition,visibility"
probe "HRDPS continental: does it cover Washington?" \
  "$OM?latitude=$LAT&longitude=$LNG&models=gem_hrdps_continental&forecast_days=2&hourly=wind_speed_10m,wind_speed_850hPa,temperature_850hPa,cape,boundary_layer_height"
probe "NBM: gusts, precipitation probability, CAPE" \
  "$OM?latitude=$LAT&longitude=$LNG&models=ncep_nbm_conus&forecast_days=7&hourly=wind_speed_10m,wind_gusts_10m,precipitation_probability,cape,visibility"
probe "ECMWF IFS 9 km and 0.25: BL height, pressure levels" \
  "$OM?latitude=$LAT&longitude=$LNG&models=ecmwf_ifs,ecmwf_ifs025&forecast_days=3&hourly=boundary_layer_height,wind_speed_850hPa,cape"
probe "Five models in one call: 10 m wind" \
  "$OM?latitude=$LAT&longitude=$LNG&models=ncep_hrrr_conus,gfs_seamless,ecmwf_ifs025,gem_seamless,icon_seamless&forecast_days=3&hourly=wind_speed_10m"
probe "Several locations in one call (Tiger, Mt Si, Chelan)" \
  "$OM?latitude=$LAT,47.5053,47.81&longitude=$LNG,-121.744,-120.07&forecast_days=1&hourly=wind_speed_10m" 
echo "   (multi-location answers come back as an array:)"
curl -sS --max-time 60 "$OM?latitude=$LAT,47.5053,47.81&longitude=$LNG,-121.744,-120.07&forecast_days=1&hourly=wind_speed_10m" | jq -c 'if type == "array" then {locations: length, elevations: map(.elevation)} else . end'

probe "Historical, ERA5: BL height, gusts, CAPE, low cloud (June 2024)" \
  "https://archive-api.open-meteo.com/v1/archive?latitude=$LAT&longitude=$LNG&start_date=2024-06-01&end_date=2024-06-02&models=era5&hourly=boundary_layer_height,wind_speed_10m,wind_gusts_10m,cape,cloud_cover_low,wind_speed_100m"
probe "Historical, ERA5-Land: wind and gusts" \
  "https://archive-api.open-meteo.com/v1/archive?latitude=$LAT&longitude=$LNG&start_date=2024-06-01&end_date=2024-06-02&models=era5_land&hourly=wind_speed_10m,wind_gusts_10m,temperature_2m"
probe "Historical forecast, HRRR (July 2022): pressure levels, BL height, CAPE" \
  "https://historical-forecast-api.open-meteo.com/v1/forecast?latitude=$LAT&longitude=$LNG&start_date=2022-07-01&end_date=2022-07-02&models=ncep_hrrr_conus&hourly=wind_speed_850hPa,temperature_850hPa,boundary_layer_height,cape,wind_speed_10m"
probe "Historical forecast, GFS (July 2022): pressure levels" \
  "https://historical-forecast-api.open-meteo.com/v1/forecast?latitude=$LAT&longitude=$LNG&start_date=2022-07-01&end_date=2022-07-02&models=gfs_seamless&hourly=wind_speed_850hPa,temperature_700hPa,boundary_layer_height,cape"
echo "== Ensemble, GFS 0.25: members returned for 10 m wind"
curl -sS --max-time 60 "https://ensemble-api.open-meteo.com/v1/ensemble?latitude=$LAT&longitude=$LNG&models=gfs025&forecast_days=2&hourly=wind_speed_10m,cape,wind_speed_850hPa" | jq -c '(.error // empty), (.reason // empty), (.hourly // {} | keys | {series: length, sample: .[0:6]})'
probe "Previous runs: today's forecast vs the one from 1 and 3 days earlier" \
  "https://previous-runs-api.open-meteo.com/v1/forecast?latitude=$LAT&longitude=$LNG&past_days=3&forecast_days=1&models=gfs_seamless&hourly=wind_speed_10m,wind_speed_10m_previous_day1,wind_speed_10m_previous_day3"
probe "Air quality: PM2.5 and US AQI" \
  "https://air-quality-api.open-meteo.com/v1/air-quality?latitude=$LAT&longitude=$LNG&forecast_days=3&hourly=pm2_5,us_aqi"

echo "== NWS: nearest observation stations to Tiger"
stations=$(curl -sS --max-time 60 -A "$UA" "https://api.weather.gov/points/$LAT,$LNG" | jq -r '.properties.observationStations // empty')
if [ -n "$stations" ]; then
  curl -sS --max-time 60 -A "$UA" "$stations" | jq -r '.features[0:12][] | "\(.properties.stationIdentifier)  \(.properties.name)  elev \(.properties.elevation.value)m  \(.geometry.coordinates | map(. * 1000 | round / 1000))"'
  first=$(curl -sS --max-time 60 -A "$UA" "$stations" | jq -r '.features[0].properties.stationIdentifier')
  echo "-- latest at $first"
  curl -sS --max-time 60 -A "$UA" "https://api.weather.gov/stations/$first/observations/latest" | jq -c '.properties | {timestamp, windSpeed: .windSpeed.value, windGust: .windGust.value, windDirection: .windDirection.value}'
fi
echo "== NWS: soaring forecast products (Spokane SRG)"
curl -sS --max-time 60 -A "$UA" "https://api.weather.gov/products/types/SRG/locations" | jq -c '.locations // . | tostring | .[0:400]'
echo "== aviationweather.gov METARs near launches"
curl -sS --max-time 60 -A "$UA" "https://aviationweather.gov/api/data/metar?ids=KRNT,KSMP,KEAT,KS52&format=json" | jq -c '.[] | {icaoId, reportTime, wdir, wspd, wgst, name}'
echo "== winds.mobi stations within 60 km of Tiger"
curl -sS --max-time 60 "https://winds.mobi/api/2.3/stations/?near-lat=$LAT&near-lon=$LNG&near-distance=60000&limit=15" | jq -r '.[] | "\(._id)  \(.short // .name)  \(.alt)m"'
echo "== kk7 thermal map tiles over Tiger (z8: TMS y 166, XYZ y 89)"
for path in thermals_all_all/8/41/166 thermals_all_all/8/41/89 skyways_all_all/8/41/166 thermals_jul_07/8/41/166; do
  curl -sS --max-time 60 -A "$UA" -o /dev/null -w "$path: %{http_code} %{content_type} %{size_download} bytes\n" \
    "https://thermal.kk7.ch/tiles/$path.png?src=soarcast.mckinleyaviation.com"
done
