---
title: Experiments
summary: Ideas SoarCast is still testing, what each one shows, and what testing has found.
order: 5
covers:
  - src/lib/ensembles.ts
  - src/components/how-sure.tsx
  - jobs/ensembles.ts
  - src/lib/flown-winds.ts
  - src/components/flown-winds.tsx
  - app/lib/experiments.server.ts
  - src/lib/season-build/core.ts
  - src/lib/terrain-study/index.ts
  - src/lib/terrain-study/dem.ts
  - app/lib/terrain-study.server.ts
  - src/components/terrain-study.tsx
---

Experiments are ideas SoarCast is still testing. Some look promising. Some didn't hold up in a test, but still show something worth seeing. None of them changes a day's rating.

## Turning them on

Experiments are off until you turn them on. Sign in, open [Settings](/settings#experiments) and switch on Show experiments. They then show under Experiments at the foot of each site page.

## How sure

This card shows how sure the next {{ensembleDays}} days are at the launch. ECMWF, the European weather centre, runs its forecast {{ensembleRuns}} times at once. Each run starts from slightly different weather, since small errors in the starting weather grow over the days. When most runs agree, the day is easier to call. When they split, the forecast can still change a lot.

SoarCast rates each run at the launch the way it rates the main forecast. A bar shows how many runs give a flyable window that day. Green is a window, amber is marginal and grey is none. Beside each day is the main forecast's word for it, for the {{forecastDays}} days it covers. On a day where fewer than half the runs give a window, the card names what holds most of the others back.

The card also counts the days where the runs and the main forecast agree. They agree when the main forecast says Go or Flyable and at least half the runs give a window. They also agree when it says Marginal or Not flyable and fewer than half do.

SoarCast fetches the runs each morning for Favorites and private sites. A site added to Favorites shows the card the next day.

### What it can't tell you

- The runs describe squares about {{ensembleGridKm}} km across, coarser than the main forecast. Peaks, valleys and local winds get smoothed out.
- The runs have wind, gusts, rain and storm energy, but no thermal height. So they say whether the launch is flyable, not how good the soaring is.
- Their wind is known near the ground, 100 m above it and about 1,500 m above sea level. At a launch high above the square's ground, the wind at launch height is read between those.
- Runs that agree can still all be wrong together. They share the same model and its blind spots.

### What testing found

It hasn't been tested yet. SoarCast keeps what the runs said each day. Once enough flown days pile up, they will show whether days the runs agreed on were flown more often.

## Wind on flown days

This card shows which wind directions pilots really fly a launch in. It takes each of the eight compass directions in turn. It counts the days the wind came from there, and how many of those days pilots flew from the launch.

The wind is read at one hour each day: the hour most flights from the launch started. It is the wind at the launch's height. Wind under {{calmKmh}} km/h counts as calm, since such light wind has no real direction.

Flown days come from pilots' live trackers on [Syncing Pilots](https://syncingpilots.com), the same days as the Flown here card. A flight counts when it takes off within {{flownRadiusKm}} km of the launch. The wind comes from ERA5, a record of past weather (see [Data sources](/guide/data-sources)). The card covers the last {{seasonMonths}} whole months.

"Listed" marks the directions the site is listed for. These are the directions the rating checks. Below the bars, the card says how many flown days had wind from a direction the listing doesn't name.

The card needs at least {{minWindFlownDays}} flown days. SoarCast keeps the wind for it at Favorites, private sites and the launches on [Planning](/planning). A site added to Favorites shows it within a day.

### What testing found

The idea was to learn each launch's wind directions from the days pilots flew there. The rating would then use them in place of the listed ones. A test tried this at 41 launches with two years of flown days. Each year was rated with what the other year taught, so no day helped rate itself.

It didn't hold up. A direction that worked at a launch one year mostly failed there the next. The days it would have turned into a Go were flown about half as often as other Go days.

The listed directions did well. Days the direction check holds back are flown about a third as often as Go days, close to Marginal days. So the rating keeps the listed directions, and this card shows the record beside them.

### What it can't tell you

- A day nobody flew may still have been good. Few launches are flown on every good day.
- The wind is for a square about 30 km across. A valley, a lee or a sea breeze can turn the wind at the launch.
- ERA5 has wind only near its ground and 100 m above it. At a launch high above its ground, the wind at launch height is a guess.
- A flown day with wind from an unlisted direction may have been a short flight, or a launch from a spot nearby.
- A direction with only a few days says little.

## Terrain around the launch

This card reads the ground round a launch from satellite heights. It shows which way the slope at the pin faces and the higher ground upwind for each wind direction. It also shows when the sun shines on the launch. SoarCast reads the heights once for each pin and keeps what it found.

The heights come from the Copernicus elevation model, which has a height about every 30 m. Ground near the pin is read at that detail. Ground out to {{terrainFarKm}} km is read every 60 m.

### The slope

SoarCast fits a flat surface to the ground within {{faceRadiusM}} m of the pin. The way that surface tilts down is the way the slope faces. A slope suits wind blowing up it, so a slope facing southwest suits a southwest wind.

The card says whether the slope fits the listed wind. It fits when it faces within {{fitsDegrees}}° of a listed direction. Where no wind is listed, the card names the directions the slope suits. Ground flatter than {{flatSlopeDegrees}}° says little about a launch, so then the card gives only its slope. When the ground at the pin is far from the listed height, the card says the pin may be off the launch.

### Higher ground upwind

For each of the eight compass directions, SoarCast looks upwind for ground higher than the launch. Air that crosses a ridge or a peak tumbles on its far side. This rough air is the lee, or rotor. It reaches about 5 to 10 times the ridge's height downwind, and farther in strong wind.

The card lists ground at least {{leeMinHeightM}} m higher than the launch that lies closer than {{leeRatio}} times that height. "Listed" marks a direction the launch is listed for. The slope above a launch counts too: wind from behind comes over it.

### Sun on the launch

The card gives the hours the sun shines on the launch, today and on the 15th of each month. The sun counts once it stands above the skyline and shines onto the slope. Sun that only grazes the slope doesn't count. A slope in the sun warms first, so thermals there tend to start sooner.

The skyline is read from {{horizonFromM}} m out. Nearer ground at a launch is often trees round the clearing.

### What testing found

A test compared the slope at the pin with the listed wind at 250 listed launches in 18 flying areas round the world. The slope faced within {{fitsDegrees}}° of a listed direction at 84% of them. A random direction would do so at about half of them. Where the slope is {{flatSlopeDegrees}}° or steeper, it fitted at 87% to 91% of launches. On flatter ground it fitted at only 59%.

The higher ground upwind and the sun on the launch haven't been tested against flown days yet.

### What it can't tell you

- The heights are of the surface the satellite saw, trees and buildings included.
- A pin a few hundred meters off the launch reads the wrong slope. Listed pins are often near a launch rather than on it.
- A launch can face another way than the ground round it, like a cut in a ridge.
- The lee rule is rough. How far rough air reaches depends on the wind's strength, the layers of the air and the ridge's shape.
- The sun hours leave out clouds and haze.
