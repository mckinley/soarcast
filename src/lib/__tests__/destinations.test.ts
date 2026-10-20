import { describe, it, expect } from 'vitest';
import { AREAS, AREA_RADIUS_KM, DESTINATIONS } from '../destinations';
import { calculateDistance } from '../site-utils';

describe('flying areas', () => {
  it('keeps every launch within reach of its area’s middle', () => {
    for (const area of AREAS) {
      for (const l of area.launches) {
        const km = calculateDistance(area.latitude, area.longitude, l.latitude, l.longitude);
        expect(km, `${l.slug} in ${area.slug}`).toBeLessThanOrEqual(AREA_RADIUS_KM);
      }
    }
  });

  it('has unique slugs', () => {
    expect(new Set(AREAS.map((a) => a.slug)).size).toBe(AREAS.length);
    expect(new Set(DESTINATIONS.map((d) => d.slug)).size).toBe(DESTINATIONS.length);
  });
});
