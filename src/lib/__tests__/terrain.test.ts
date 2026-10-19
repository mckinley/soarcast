import { describe, it, expect } from 'vitest';
import {
  offsetPoint,
  samplePoints,
  suggestLaunchDirections,
  terrainFaces,
  SAMPLE_DISTANCES,
} from '../terrain';
import { calculateDistance } from '../site-utils';

// Elevations in samplePoints order for a pin at `center`, where `drop`
// gives how far the ground has fallen at each distance towards a bearing.
function elevationsAround(center: number, drop: (bearing: number, distance: number) => number) {
  const out = [center];
  for (const bearing of [0, 45, 90, 135, 180, 225, 270, 315]) {
    for (const d of SAMPLE_DISTANCES) out.push(center - drop(bearing, d));
  }
  return out;
}

describe('offsetPoint and samplePoints', () => {
  it('moves the given distance along the bearing', () => {
    const p = offsetPoint(47.4881, -121.7235, 90, 300);
    expect(calculateDistance(47.4881, -121.7235, p.latitude, p.longitude) * 1000).toBeCloseTo(
      300,
      -1,
    );
    expect(p.latitude).toBeCloseTo(47.4881, 6);
    expect(p.longitude).toBeGreaterThan(-121.7235);
  });

  it('lists the pin first, then each compass point outwards', () => {
    const points = samplePoints(47.4881, -121.7235);
    expect(points).toHaveLength(1 + 8 * SAMPLE_DISTANCES.length);
    expect(points[0]).toEqual({ latitude: 47.4881, longitude: -121.7235 });
    expect(points[1].latitude).toBeGreaterThan(points[0].latitude); // north first
  });
});

describe('suggestLaunchDirections', () => {
  it('suggests the steep west face of a ridge as good and its shoulders as possible', () => {
    // A west-facing slope: steep to the W, less to the SW and NW, flat or rising elsewhere
    const slopeByBearing: Record<number, number> = { 270: 0.5, 225: 0.3, 315: 0.28, 180: 0.05 };
    const faces = terrainFaces(
      elevationsAround(1200, (bearing, d) => (slopeByBearing[bearing] ?? -0.1) * d),
    );
    expect(suggestLaunchDirections(faces)).toEqual({ good: [270], ok: [225, 315] });
  });

  it('suggests every steep face of a summit', () => {
    const faces = terrainFaces(
      elevationsAround(1400, (bearing, d) => (bearing % 90 === 0 ? 0.45 : 0.4) * d),
    );
    expect(suggestLaunchDirections(faces).good).toEqual([0, 45, 90, 135, 180, 225, 270, 315]);
  });

  it('suggests nothing on flat ground', () => {
    const faces = terrainFaces(elevationsAround(50, (_, d) => 0.05 * d));
    expect(suggestLaunchDirections(faces)).toEqual({ good: [], ok: [] });
  });

  it("doesn't count a drop that rises again as a launch", () => {
    // Steep for 150 m to the south, then back up: a bench, not a slope
    const faces = terrainFaces(
      elevationsAround(1000, (bearing, d) => (bearing === 180 ? (d === 150 ? 80 : 20) : 0)),
    );
    expect(faces.find((f) => f.direction === 180)!.slope).toBeCloseTo(20 / 300);
    expect(suggestLaunchDirections(faces).good).toEqual([]);
  });
});
