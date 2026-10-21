---
title: Favorites and areas
summary: How saved sites are grouped into areas, and which area the dashboard shows.
order: 4
covers:
  - src/lib/site-areas.ts
  - app/lib/site-areas.server.ts
  - src/components/area-controls.tsx
  - src/components/dashboard-client.tsx
  - app/routes/_auth.dashboard.tsx
---

SoarCast groups saved sites into areas by where they are. An area is a place you fly, like home or a trip. On any day you are in one place, so the dashboard shows one area at a time.

## Saving a site

There are two ways to save a site. Add a listed site to Favorites from its page or from Browse Sites. Or add a private site for a launch that isn't listed. Both kinds go into areas the same way.

## How a site gets its area

A new site joins the area of the nearest saved site, if that site is within {{areaJoinKm}} km. That is about a long day trip. If no saved site is that close, the new site starts an area of its own.

A new area takes the name of the flying area on [Planning](/planning) that it falls in. Otherwise it is called "Around" followed by the site's name.

## Changing areas

In [Settings](/settings), under Favorites, sites are listed by area. There you can:

- Rename an area, for example to "Home".
- Move a site to another area, or to a new area of its own.
- Join one area into another.
- Turn alerts off for a whole area.

A site stays in its area until you move it. An area with no sites left goes away.

## The dashboard

With more than one area, the dashboard shows a button for each area at the top. Tap one to see its sites.

All areas shows one row per area. Each day in a row shows the area's best site that day. So an area is a Go on any day one of its sites is.

The dashboard opens on the area nearest to you. SoarCast guesses where you are from your internet connection, without asking for your location. The guess is often right to within tens of km. It can be far off on a VPN or some mobile networks. SoarCast uses it only to pick the area and to list sites near you, and doesn't keep it.

When no saved site is within {{areaJoinKm}} km of you, the dashboard also lists a few listed sites near you.

## Saving a flying area from Planning

On Planning, open a flying area in Where to fly. Save this area adds its launches to Favorites, together in one area with the same name.

## Alerts

Alerts and the morning digest leave out every site in an area with alerts off. Each site also has its own alerts switch. A site sends alerts only when both are on.

## What areas can't do

- A site sits in one area at a time.
- Areas go by distance only. Two valleys that are close on the map but far apart by road share an area until you split them.
- The location guess can pick the wrong area. Tap the one you want.
