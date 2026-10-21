---
title: Reading the windgram
summary: What the colors, barbs and lines on a site's windgram mean, and what to look for.
order: 3
covers:
  - src/components/windgram/windgram-d3.tsx
  - src/components/windgram/windgram-data.ts
  - src/components/windgram/windgram-legend.tsx
  - src/components/windgram/lapse-rate-utils.ts
  - src/components/windgram/wind-barb-utils.ts
  - src/components/windgram/windgram-interactive.tsx
  - src/components/windgram-section.tsx
---

Each site page has a windgram. It shows the air above the site for one day, from the ground up, hour by hour. Pick a day with the buttons above it. On a phone, you can also swipe to change days.

Hover over the chart, or tap it, to see the exact numbers at any hour and height.

## How the chart is laid out

- Across the bottom are the daylight hours, in the site's local time.
- Up the side is height. Feet are on the left and meters on the right.
- The dashed line is the launch height.
- The dark band at the bottom is the forecast's ground, labeled "Model ground". The forecast smooths out hills, so its ground is often well below a launch on a peak. [Data sources](/guide/data-sources#what-it-cant-tell-you) explains why.
- Every day of the week uses the same heights, so you can compare days at a glance.
- The row above the chart, "Lift m/s", is thermal strength for each hour. Darker yellow means stronger thermals.

## The colors: how fast the air cools

Air cools as it rises. Dry air cools about 3 °C for every 1000 ft it climbs. A thermal keeps rising while it is warmer than the air around it. So the faster the air around it cools with height, the better thermals climb.

The background color shows how fast the air cools with height, in °C per 1000 ft. The colors are the same as on RASP windgrams, a soaring forecast many pilots use.

| Color                     | Cooling per 1000 ft                | What it means                               |
| ------------------------- | ---------------------------------- | ------------------------------------------- |
| Red                       | {{lapseRedC}} °C or more           | Unstable air. Thermals rise freely.         |
| Orange, pink and lavender | {{lapseGoodC}} to {{lapseRedC}} °C | Good for thermals. Orange is the strongest. |
| Tan                       | {{lapseTanC}} to {{lapseGoodC}} °C | Weak thermals                               |
| Blue                      | {{lapseBlueC}} to {{lapseTanC}} °C | Stable air. Thermals stop here.             |
| Grey                      | The air gets warmer with height    | An inversion. Thermals stop here.           |

Thermals climb through red, orange, pink and lavender. They fade in tan and stop where the color turns blue or grey.

## Wind barbs

Each barb shows the wind at one height and hour.

- The feathered end points to where the wind comes from.
- The feathers give the speed in km/h. A long feather is {{barbLongKmh}}, a short one is {{barbShortKmh}} and a flag is {{barbFlagKmh}}. Two long feathers and a short one make {{barbExampleKmh}} km/h.
- Speeds are rounded to the nearest {{barbShortKmh}} km/h. A small circle means calm.
- Red barbs are stronger than the site's wind limit.

## Thermals and clouds

- **The yellow line** is the top of lift. Thermals climb up to it. It shows only in hours with thermals of at least {{thermalClimbMs}} m/s.
- **A cloud** on the yellow line marks cloud base. It shows when thermals reach cloud base, so expect cumulus clouds there.
- **Hatching** marks heights where the forecast has {{modelCloudPercent}}% cloud cover or more. Hatching at the launch line means the launch may be in cloud.
- **Thin blue lines** are temperatures, every {{isothermStepC}} °C. The dashed blue line is freezing, 0 °C.

[How a day is rated](/guide/how-a-day-is-rated) explains how thermal strength and the top of lift are worked out.

## What to look for

1. Read the barbs at the launch line. That is the wind you launch in. Check its direction against the launch and its speed against the limit.
2. Look at the barbs higher up. Wind that gets much stronger with height makes thermals rough and drifts you downwind.
3. Look for warm colors above the launch. The higher they reach, the higher thermals can go. A blue or grey layer just above launch can stop thermals early.
4. Look at the yellow line and the Lift row. The higher the line sits above launch, and the darker the row, the better the thermals.
5. Look for hatching low on the chart. It means low cloud, which can cover the launch or block the sun.

The windgram has the same limits as the forecast behind it. [Data sources](/guide/data-sources#what-it-cant-tell-you) lists them.
