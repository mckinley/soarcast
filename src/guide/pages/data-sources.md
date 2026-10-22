---
title: Data sources
summary: Where the forecasts, sites, flown days, comps and maps come from, and how often each one updates.
order: 1
covers:
  - src/lib/weather-profile.ts
  - app/lib/forecast-refresh.server.ts
  - src/lib/forecast-engine/gates.ts
  - src/lib/forecast-engine/launch-conditions.ts
  - src/lib/track-record.ts
  - app/lib/track-record.server.ts
  - src/components/forecast-track-record.tsx
  - src/lib/seasons.ts
  - src/lib/flown-days.ts
  - app/lib/flown-days.server.ts
  - src/components/flown-here.tsx
  - jobs/season-build.ts
  - jobs/index.ts
  - src/lib/season-build/core.ts
  - src/lib/season-build/era5.ts
  - src/lib/season-build/era5-profile.ts
  - src/components/season-card.tsx
  - src/lib/destinations.ts
  - src/lib/pgsites-client.ts
  - src/components/sites-browse-client.tsx
  - app/routes/sites.browse.tsx
  - src/lib/launch-sites.ts
  - app/lib/launch-sites.server.ts
  - src/lib/terrain.ts
  - src/components/map-picker.tsx
  - src/lib/comps.ts
  - app/lib/comps.server.ts
  - src/components/thermal-overlays.tsx
  - src/components/vector-basemap.tsx
  - src/lib/basemap.ts
  - src/components/data-credits.tsx
  - src/lib/custom-sites.ts
  - app/lib/custom-sites.server.ts
---

SoarCast does not make its own weather forecasts or write its own site guide. It brings together data from the public sources below. Each section says what SoarCast uses, how often it updates and what it can't tell you.

## Weather forecasts

Forecasts come from [Open-Meteo](https://open-meteo.com), a free service that collects forecasts from national weather services.

### Which forecast

Open-Meteo chooses the forecast for each place. It starts from three global forecasts. They come from Germany's weather service, the US weather service (NOAA) and the European weather centre (ECMWF). Where a more detailed local forecast covers the place, that one comes first. In the United States this is NOAA's HRRR. Many European countries have their own.

Detailed forecasts only reach a day or two ahead. Later days come from the global forecasts. [Open-Meteo's documentation](https://open-meteo.com/en/docs) lists which forecasts it uses where.

### What SoarCast uses

For every hour of the next {{forecastDays}} days, SoarCast takes:

- Wind speed and direction near the ground, and at heights up to about 5,500 m.
- Gusts near the ground.
- Temperature and humidity at the same heights. These show how strong thermals are and where clouds form.
- How high the air warmed by the ground mixes. Thermals rarely climb above this height.
- Sunshine, which heats the ground and starts thermals.
- Cloud cover, rain, the chance of rain and visibility.
- Storm risk: how much energy the air holds for building storm clouds.
- Sunrise and sunset.

### How fresh

Weather services make new forecasts every one to six hours. SoarCast keeps a place's forecast for {{forecastRefreshHours}} hours. Saved sites get a new one about every two hours, before their copy runs out, so their pages never wait for it. Any other place gets a new one the next time a page or alert needs it.

### What it can't tell you

- A forecast describes a square of ground, not one spot. Detailed forecasts use squares 1 to 3 km wide. Global ones use squares about 10 to 25 km wide.
- The forecast's ground is the average height of its square. Peaks, ridges and valleys get smoothed out.
- A launch on a peak or ridge often sits well above that ground. SoarCast reads the wind and temperature at the launch's real height from the forecast's upper levels. It raises the top of lift there too. [How a day is rated](/guide/how-a-day-is-rated#what-flight-the-day-gives) explains how.
- Gusts are only forecast near the ground. SoarCast adds the same extra gust speed to the wind at launch height. At a launch more than {{gustFadeStartM}} m above the forecast's ground, it adds less. At {{gustFadeFullM}} m or more above, it adds {{gustFadeSharePercent}}%. On days pilots flew from such launches, the whole gust made them look gustier than they were.
- Small local winds are often missed. These include valley winds, sea breezes and wind bending around a single ridge.
- In the tropics, forecasts call for rain on far more days than it falls. Within {{tropicsLatitude}}° of the equator, the rain check only counts rain of {{showerMm}} mm an hour or more. When it sets rain aside, the day says so.

## Forecast track record

Each site page has a card called "How far to trust the forecast here". It compares the forecast made the day before with what the nearest airport reported. It covers the last {{trackRecordDays}} days and rates rain and wind as Good, Fair or Poor.

- **Past forecasts** come from Open-Meteo's archive of earlier forecasts. They are chosen the same way as the forecasts above.
- **What happened** comes from airport weather reports. Most airports send one every hour. SoarCast gets them from the [Iowa Environmental Mesonet](https://mesonet.agron.iastate.edu) at Iowa State University, which keeps reports from airports worldwide.
- **The list of airports** comes from the US [Aviation Weather Center](https://aviationweather.gov).

The airport must be within {{trackRecordRadiusKm}} km of the site. SoarCast rebuilds each record every {{trackRecordRebuildDays}} days.

An airport usually sits on flat ground or in a valley. Its weather can differ from the launch's. The record only checks rain and wind.

## Seasons

The Season card on site pages and the Planning page show how often each month was good for flying.

SoarCast rates each day of the last {{seasonYears}} years the same way it rates today's forecast. The weather for those days comes from [ERA5](https://climate.copernicus.eu/climate-reanalysis), a record of past weather from the European weather centre (ECMWF) and the EU's Copernicus program. ERA5 combines weather measurements from around the world into a picture of every hour. SoarCast reads it from [Open-Meteo's open copy](https://registry.opendata.aws/open-meteo/).

A record of {{seasonYears}} years shows how a month usually goes, and how much it changes from year to year. On the Season card, a line on each month spans the middle half of years. A quarter of years had more go days than the top of the line, and a quarter had fewer than the bottom.

A season shows what the weather was, as SoarCast rates it, not what pilots flew. [Flown days](#flown-days) show what pilots flew.

SoarCast builds seasons twice a day. A site gets its seasons within a day of being added to Favorites or as a private site. Each site's seasons are rebuilt every few months to take in the latest months. They are also rebuilt when SoarCast changes how it rates a day.

The flying areas on the Planning page are SoarCast's own list of places pilots travel to. Each area is a few launches within {{areaRadiusKm}} km of its middle.

### What a season can't tell you

- ERA5 describes the weather over squares about 30 km wide. That is coarser than a forecast, so peaks, ridges and valleys get smoothed out even more.
- SoarCast reads its wind near the ground and 100 m above it, but nothing higher up. At a launch high above ERA5's ground, the wind at launch height is a guess.
- The copy SoarCast reads has no measure of storms or fog. So storms and fog never hold a past day back, and a season can show Go on days a forecast would have held back.
- Some hours are missing from the copy. A day with too few hours left isn't rated.


## Flown days

The "Flown here" card on a site page lists the latest days pilots flew from the site. When the site has a season, the card also says how SoarCast rated the days pilots flew in the last {{seasonMonths}} months. The Season card then shows how often pilots flew in each month.

These days come from [Syncing Pilots](https://syncingpilots.com). It follows the live maps that pilots share from their Garmin inReach and SPOT trackers. SoarCast only gets counts for each day: how many pilots launched, and how many flights were glides down, soaring flights or cross-country flights. It gets no names, tracks or positions.

- A flight counts when it takes off within {{flownRadiusKm}} km of the launch.
- A soaring flight stays up a good while or climbs above the launch. A cross-country flight lands far from the launch. Anything else counts as a glide down.
- Most trackers send a position only every few minutes. A short glide down can fall between two positions. It still counts when the tracker shows the pilot at the launch and then well below it soon after.

SoarCast checks Syncing Pilots again every {{flownRefreshHours}} hours. Flown days don't change how a day is rated.

### What it can't tell you

- Only some pilots carry a live tracker and share its map. A day with no tracked flight may still have been flown.
- Busy sites have many tracked pilots. Quiet sites may have few or none, so their numbers say little.
- A pilot who drives down from a launch can now and then look like a glide down.
- Two launches less than {{flownRadiusKm}} km apart show the same flights.

## Sites

Listed sites come from [Paragliding Earth](https://www.paraglidingearth.com), a site guide written by pilots.

SoarCast uses each site's name and place, its launch and landing heights, and the wind directions its launch works in. It also uses the site's description and its tags for thermals, ridge soaring and cross-country flying.

SoarCast keeps a copy of every Paragliding Earth site and checks for changes every day. It also copies each country's full list again every month. A site in Favorites has its details refreshed from that copy every {{siteRefreshDays}} days.

### Finding a site

Browse Sites finds a site by its name or by another name pilots use for it. Accents, dashes and spaces don't matter, so "penon" finds "El Peñón". A search for a town also lists the sites near it. Town names come from [GeoNames](https://www.geonames.org), through Open-Meteo's place search.

The sites most pilots fly come first. Browse Sites shows how many pilots [Syncing Pilots](https://syncingpilots.com) tracked flying from each site in the last year. Like [flown days](#flown-days), this only counts pilots who share a live tracker.

Pilots write these pages, so details can be missing, old or wrong. Check the site's rules and ask the local club before flying. To fix a site, edit it on Paragliding Earth. SoarCast picks up the change within a day, or within {{siteRefreshDays}} days for a site in Favorites.

### Launches found from flights

Some busy launches are missing from Paragliding Earth. SoarCast finds them from the flights [Syncing Pilots](https://syncingpilots.com) tracked. A spot where at least 5 different pilots took off in the last two years becomes a launch, unless a listed site already covers it. Browse Sites marks these launches "Found from flights". SoarCast looks for new ones every week.

- The name comes from [OpenStreetMap](https://www.openstreetmap.org). It is the peak or hill the launch is on, or else a listed site or town nearby.
- The wind directions are the directions pilots took off in. Pilots take off into the wind, so this is a good guess. It can miss a direction that works but is rarely flown.
- These launches have no description, landing or site rules. Ask local pilots before flying there.

### Takeoffs from OpenStreetMap

[OpenStreetMap](https://www.openstreetmap.org) is a world map anyone can edit. Pilots and flying clubs map takeoffs there too. A mapped takeoff becomes a launch when no listed site covers it and it has a name and the directions it faces. Browse Sites marks these launches "From OpenStreetMap". SoarCast checks OpenStreetMap every week.

- The wind directions are the ones mapped in OpenStreetMap. Check them with local pilots.
- A closed or private takeoff, or one only for hang gliders, is left out. A takeoff with no directions is left out too, since SoarCast can't rate it.
- Most of these launches have no description, landing or site rules. Ask local pilots before flying there.

### Launches pilots shared

A pilot who adds a [private site](#private-sites) can share it with other pilots. Anyone can then find it in Browse Sites and add it to Favorites. Browse Sites marks these launches "Shared by a pilot".

- Other pilots see the launch's name, place, height, wind directions and what it gives. The pilot's notes, wind limit and goal stay private.
- The wind directions are the ones the pilot set. Check them with local pilots.
- A launch that a listed site already covers can't be shared. SoarCast names that site, so the pilot can add it to Favorites instead.
- When the pilot changes the site, the shared launch changes too. Pilots who follow it see the change within {{siteRefreshDays}} days.
- When the pilot stops sharing it, no one else can find it any more. Pilots who already follow it keep it.
- These launches have no description, landing or site rules. Ask local pilots before flying there.

## Private sites

A pilot can add a private site that is missing from the list. Only that pilot can see it, unless they [share it](#launches-pilots-shared). To share a site, it needs at least one wind direction.

When a pilot drops a pin, SoarCast looks up the height of the ground there. It also looks at the slopes around the pin to suggest which way the launch faces. The heights come from the European Union's Copernicus elevation map, which has a height every 90 m. SoarCast gets them through Open-Meteo.

The place search uses [OpenStreetMap](https://www.openstreetmap.org). SoarCast also lists the sites it knows near the pin, so a pilot can add one of those to Favorites instead.

## Comps

Comps come from the [FAI sporting calendar](https://www.fai.org/commission/civl). FAI is the world air sports federation. SoarCast lists its Category 1 and Category 2 paragliding comps.

- Category 1 comps are the world and continental championships.
- Category 2 comps include national championships, World Cup rounds and other comps FAI approves.

World Cup rounds and a few races that FAI doesn't list are added by hand from [the Paragliding World Cup site](https://pwca.org).

SoarCast checks the calendar once a week. It holds comps from 2015 to two years ahead. Most comps link to their own page, usually on Airtribune, CIVL Comps or the World Cup site. Those pages have the final dates, entry and results.

A comp's spot on the map comes from its place name, so it can be a little off. A comp within {{compRadiusKm}} km of a site counts as held there. Comps don't change how a day is rated.

## Maps

The base map uses [OpenStreetMap](https://www.openstreetmap.org) data, drawn with [Protomaps](https://protomaps.com).

The Thermal hotspots and Skyways layers come from [kk7 thermal maps](https://thermal.kk7.ch). kk7 builds them from millions of flight tracks that pilots uploaded. Thermal hotspots shows where pilots often found thermals. Skyways shows the lines pilots often fly between them. Both show where thermals have been in past seasons, not where they are today.

## Credits

| Data                                         | Licence                                                               |
| -------------------------------------------- | --------------------------------------------------------------------- |
| Forecasts from Open-Meteo                    | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)             |
| Past weather: ERA5 from Copernicus           | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)             |
| Sites from Paragliding Earth                 | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/)       |
| Place names from GeoNames                    | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)             |
| Thermal maps from kk7                        | [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) |
| Map data and launch names from OpenStreetMap | [ODbL](https://www.openstreetmap.org/copyright)                       |
