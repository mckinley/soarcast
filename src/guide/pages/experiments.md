---
title: Experiments
summary: Ideas SoarCast is still testing, what each one shows, and what testing has found.
order: 5
covers:
  - src/lib/flown-winds.ts
  - src/components/flown-winds.tsx
  - app/lib/experiments.server.ts
  - src/lib/season-build/core.ts
---

Experiments are ideas SoarCast is still testing. Some look promising. Some didn't hold up in a test, but still show something worth seeing. None of them changes a day's rating.

## Turning them on

Experiments are off until you turn them on. Sign in, open [Settings](/settings#experiments) and switch on Show experiments. They then show under Experiments at the foot of each site page.

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
