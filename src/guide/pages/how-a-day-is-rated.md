---
title: How a day is rated
summary: How SoarCast decides whether a day at a site is a Go, Flyable, Marginal or Not flyable.
order: 2
covers:
  - src/lib/forecast-engine/gates.ts
  - src/lib/forecast-engine/evaluate.ts
  - src/lib/forecast-engine/index.ts
  - src/lib/forecast-engine/launch-conditions.ts
  - src/lib/site-goals.ts
  - src/lib/verdict-display.ts
  - src/lib/weather-profile.ts
  - src/components/site-goal-picker.tsx
  - src/components/windgram/flyability-summary.tsx
  - src/components/xc-snapshot-panel.tsx
  - src/components/settings-client.tsx
  - app/routes/api.notifications.check.tsx
---

SoarCast rates a day in two steps. First it checks each hour to see if you can launch safely. Then it looks at what flight those hours give. A day is a Go when that flight is worth going for at this site.

## The four day words

| Word        | What it means                                                                                                                                                                            |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Go          | You can launch safely for at least {{windowHours}} hours in a row. The day also gives the flight this site is worth going for.                                                           |
| Flyable     | You can launch safely for at least {{windowHours}} hours in a row. But the flight falls short of what the site is worth going for. One example is a sled ride at a site set to Soarable. |
| Marginal    | No {{windowHours}} hours in a row pass every check. But at least one hour does, or {{windowHours}} hours in a row have nothing that rules them out. Fly with care.                       |
| Not flyable | No part of the day is flyable.                                                                                                                                                           |

A day shows its word with the flight and the time, such as "Go: thermals 12:00-16:00". Below that, it says what limits the rest of the day.

Push alerts only go out for days that are a Go. You can turn alerts off for one site, or for a whole [area](/guide/favorites-and-areas).

## Launch checks, hour by hour

SoarCast runs eight checks on each hour at the launch. Each check passes, is marginal or fails. The hour takes its worst result, so one failed check rules out the hour.

| Check          | Fails when                                                                                                                              | Marginal when                                                                                                                        |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Wind           | The wind is over the site's wind limit.                                                                                                 | The wind is over {{windNearLimitPercent}}% of the limit.                                                                             |
| Gusts          | Gusts are more than {{gustOverLimitKmh}} km/h over the limit. Or gusts are more than {{gustSpreadFailKmh}} km/h above the average wind. | Gusts are over the site's wind limit. Or gusts are more than {{gustSpreadMarginalKmh}} km/h above the average wind.                  |
| Wind direction | The wind is off the launch.                                                                                                             | The wind is cross on the launch.                                                                                                     |
| Rain           | The hour has {{rainFailMm}} mm of rain or more. Or the chance of rain is {{rainFailChance}}% or more.                                   | The hour has any rain. Or the chance of rain is {{rainMarginalChance}}% or more.                                                     |
| Storms         | The air is very unstable, with showers in the forecast within {{rainSoonHours}} hours.                                                  | The air is unstable, with showers in the forecast within {{rainSoonHours}} hours. Or the air is very unstable, with no showers near. |
| Cloud          | The launch is in cloud.                                                                                                                 | Cloud base is less than {{cloudClearanceM}} m above launch.                                                                          |
| Visibility     | You can see less than {{fogKm}} km. The day shows this as Fog.                                                                          | You can see less than {{hazeKm}} km. The day shows this as Haze.                                                                     |
| Daylight       | It is dark.                                                                                                                             | Sunrise or sunset falls inside the hour.                                                                                             |

### Wind and gusts

SoarCast reads the wind at the launch's own height, not at the forecast's ground. Gusts are only forecast near the ground, so SoarCast adds them to the wind at launch height. At a launch high above the forecast's ground, it adds less of them. [Data sources](/guide/data-sources#what-it-cant-tell-you) explains how.

Each site has a wind limit. It comes from the site's listing, or it is {{defaultWindLimitKmh}} km/h when the listing has none. You can set your own limit for each site in Settings, under Favorites. A private site's limit is set on the site itself.

In an hour with thermals strong enough to climb in, the gusts are mostly the thermals themselves. So in those hours, only the gusts' top speed counts. Their gap above the average wind doesn't.

### Wind direction

Each launch lists the wind directions it works in. A listed site's directions come from Paragliding Earth, marked Preferred or Possible. On a private site, "works well" counts as Preferred and "works cross" as Possible.

- The check passes when the wind is within {{sectorDegrees}}° of a Preferred direction.
- The wind is cross on the launch when it is within {{sectorDegrees}}° of a Possible direction. It is also cross when it is within {{crossDegrees}}° of a Preferred one.
- Any other wind is off the launch.
- In wind under {{lightCrossKmh}} km/h, a cross wind passes in an hour with thermals. Thermals draw air up the slope, which helps on launch.
- In wind under {{nilWindKmh}} km/h, the direction doesn't matter. You can launch facing any way.
- A launch with no directions listed passes in any wind direction.

### Rain and storms

Rain counts both the amount forecast for the hour and the chance of rain.

In the tropics, forecasts call for rain on far more days than it falls. Within {{tropicsLatitude}}° of the equator, only showers of {{showerMm}} mm an hour or more count. They make the hour marginal, never a fail. When SoarCast sets rain aside, the day says so.

Storms grow in unstable air. That is air that keeps rising on its own once it starts. Unstable air builds thermals, and with enough of it, storm clouds. The forecast says how much energy the air holds for this.

Unstable air alone often gives a good thermal day. A storm also needs something to set it off, and showers in the forecast are the sign of that. So SoarCast looks for showers in the hour and the {{rainSoonHours}} hours after it.

- Unstable air with showers near makes the hour marginal. Very unstable air with showers near fails it.
- Very unstable air with no showers near makes the hour marginal.
- Unstable air with no showers near passes. The day then says the air is unstable, so you know to watch the clouds.

In the tropics, rain from {{rainFailMm}} mm an hour counts as showers near. The chance of rain doesn't count there.

### Cloud and visibility

Cloud base is where thermal clouds form. SoarCast estimates it from how dry the air is near the ground. The dew point is the temperature at which the air's moisture turns to cloud. Each °C between the temperature and the dew point puts cloud base about {{cloudBasePerDegreeM}} m higher.

Cloud base only counts when at least {{lowCloudPercent}}% of the sky has low cloud. Under a clear sky, the launch can't be in cloud.

## The flyable window

SoarCast looks for the longest run of hours that pass every check. That run is the day's window. A day needs a window of at least {{windowHours}} hours to be a Go or Flyable.

On a Marginal day, the window is the longest run of hours with nothing that rules them out.

The day also says what limits the hours outside the window. For example, "Outside 11:00-17:00: Wind 31 km/h (limit 25), 17:00-19:00".

## What flight the day gives

Next, SoarCast looks for the best flight the window gives. It also counts the marginal hours next to the window. So one gusty hour doesn't cut a long flight short.

It checks for each flight in this order and takes the first one that fits.

| Flight        | What it takes                                                                                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| XC day        | Thermals of at least {{xcClimbMs}} m/s that reach at least {{xcHeightM}} m above launch, for {{xcHours}} hours in a row. The risk of overdevelopment can't be high. |
| Thermals      | Thermals of at least {{thermalClimbMs}} m/s that reach at least {{soarHeightM}} m above launch, for {{soarHours}} hours in a row.                                   |
| Ridge soaring | Wind of at least {{ridgeWindKmh}} km/h within {{sectorDegrees}}° of a Preferred direction, for {{soarHours}} hours in a row.                                        |
| Sled ride     | Anything less. The day says why, such as "thermals too weak to climb".                                                                                              |

These are the two thermal numbers:

- **Thermal strength** is how fast a typical thermal rises, in m/s. SoarCast estimates it from how strong the sun is and how high the warmed air mixes. A paraglider sinks at about {{thermalClimbMs}} m/s, so weaker thermals can't hold one up.
- **Top of lift** is where thermals stop. It is the top of the warmed air, or cloud base when that is lower.

Over mountains, the warmed air reaches higher over a peak than over the valley floor. It doesn't rise by the peak's whole height, though. A forecast's ground is smoothed, so a launch on a peak often sits well above it. For such a launch, SoarCast raises the top of lift by {{terrainLiftPercent}}% of that difference, up to cloud base.

Both are estimates. Real thermals change a lot from hour to hour and from one slope to the next.

### What a site gives

Each site has a kind, shown as "What it gives". The kind limits which flights a day can give there.

| What it gives      | Flights it can give              |
| ------------------ | -------------------------------- |
| Thermals           | XC days, thermals and sled rides |
| Ridge soaring      | Ridge soaring and sled rides     |
| Thermals and ridge | Any flight                       |
| Sled rides only    | Sled rides                       |

The kind comes from the site's Paragliding Earth tags. A site tagged for thermals or cross-country gives thermals. A site tagged for soaring gives ridge soaring. A site with no tags can give any flight. You can change the kind in Settings, under Favorites.

Ridge soaring also needs the launch's wind directions. Without them, SoarCast can't tell which wind blows onto the ridge.

## When a day is a Go

Each site has a goal, shown as "Worth going when". It decides whether a flyable day is a Go or only Flyable.

| Worth going when      | A day is a Go when it gives                                                                                          |
| --------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Safe launch is enough | Any flight, even a sled ride.                                                                                        |
| Soarable              | Thermals, ridge soaring or an XC day.                                                                                |
| Only a great day      | An XC day. At a site that gives ridge soaring only, ridge soaring for {{greatRidgeHours}} hours or more also counts. |

Most sites start at Soarable. Sites that give sled rides only start at Safe launch is enough. So do hike-and-fly sites with no tags, and private sites with no kind set.

You can change the goal on the site's page once it is in Favorites. It is also in Settings, under Favorites. The Season card and Favorites on the Planning page use the same goal when they count Go days.

## Hazards shown with the day

Two more risks are shown with the day. Neither one makes a day Not flyable.

- **Overdevelopment** is the risk that thermal clouds grow into showers or storms. It is higher when the air holds a lot of storm energy, when cloud base is low and in the afternoon. A day with a high risk can't be an XC day.
- **Wind shear** is wind speed changing fast with height. It can make the air rough. SoarCast rates it from None to High.

## What the rating can't know

- Local winds, such as valley winds and sea breezes. Forecasts often miss them.
- How good the forecast is at this site. The card "How far to trust the forecast here" on each site page shows how it did.
- Site rules, closures and the state of the landing field.
- Your own skill and wing. Set a wind limit that fits you.

The rating is a starting point. Check the sky and the wind on launch before you fly.
