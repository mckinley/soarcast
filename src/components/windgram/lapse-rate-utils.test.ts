import { describe, it, expect } from 'vitest';
import {
  calculateLapseRateBetweenLevels,
  lapseRateToColor,
  bilinearInterpolate,
  getLapseRateLegend,
} from './lapse-rate-utils';

describe('calculateLapseRateBetweenLevels', () => {
  it('should calculate lapse rate correctly for typical thermal layer', () => {
    // Example: 850 hPa at 1500m, 15°C vs 700 hPa at 3000m, 5°C
    const lapseRate = calculateLapseRateBetweenLevels(15, 5, 1500, 3000);
    expect(lapseRate).not.toBeNull();
    expect(lapseRate).toBeCloseTo(2.03, 1); // ~2°C/1000ft (dry adiabatic)
  });

  it('should return null for invalid heights', () => {
    const lapseRate = calculateLapseRateBetweenLevels(15, 5, 3000, 1500); // Upper < Lower
    expect(lapseRate).toBeNull();
  });

  it('should detect inversion (negative lapse rate)', () => {
    const lapseRate = calculateLapseRateBetweenLevels(5, 15, 1500, 3000); // Warmer aloft
    expect(lapseRate).not.toBeNull();
    expect(lapseRate).toBeLessThan(0);
  });

  it('should calculate unstable lapse rate (> 3°C/1000ft)', () => {
    // Strong heating: 20°C at surface, 0°C at 1500m
    const lapseRate = calculateLapseRateBetweenLevels(20, 0, 0, 1500);
    expect(lapseRate).not.toBeNull();
    expect(lapseRate).toBeGreaterThan(3); // Very unstable
  });
});

describe('lapseRateToColor', () => {
  it('should return warm colors for unstable conditions (high lapse rate)', () => {
    const color = lapseRateToColor(4.0, false); // Very unstable
    expect(color).toMatch(/rgb\(\s*255/); // Should have high red component (fully opaque)
  });

  it('should return cool colors for stable conditions (low lapse rate)', () => {
    const color = lapseRateToColor(0.5, false); // Stable
    expect(color).toMatch(/rgb\(/);
    // Should be purplish/lavender (higher blue component)
    const matches = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    expect(matches).not.toBeNull();
    const [, r, , b] = matches!.map(Number);
    expect(b).toBeGreaterThan(r); // Blue > Red for stable
  });

  it('should return neutral colors for dry adiabatic lapse rate (~2°C/1000ft)', () => {
    const color = lapseRateToColor(2.0, false); // Neutral
    expect(color).toMatch(/rgb\(/);
    // Should be light/pale yellow/cream
    const matches = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    expect(matches).not.toBeNull();
    const [, r, g] = matches!.map(Number);
    expect(r).toBeGreaterThan(200); // Light colors
    expect(g).toBeGreaterThan(200);
  });

  it('should return deep purple/blue for inversion', () => {
    const color = lapseRateToColor(-1.0, false); // Inversion
    expect(color).toMatch(/rgb\(/);
    const matches = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    expect(matches).not.toBeNull();
    const [, r, , b] = matches!.map(Number);
    expect(b).toBeGreaterThan(r); // Blue dominant for inversion
  });

  it('should handle null lapse rate gracefully', () => {
    const colorLight = lapseRateToColor(null, false);
    const colorDark = lapseRateToColor(null, true);
    expect(colorLight).toMatch(/rgba\(/);
    expect(colorDark).toMatch(/rgba\(/);
    expect(colorLight).toContain('0.5'); // Lower alpha for null values
  });

  it('should adapt colors for dark theme', () => {
    const lightTheme = lapseRateToColor(0.5, false);
    const darkTheme = lapseRateToColor(0.5, true);
    expect(lightTheme).toMatch(/rgb\(/);
    expect(darkTheme).toMatch(/rgb\(/);
    // Dark theme should use slightly different RGB values for better contrast
    expect(lightTheme).not.toEqual(darkTheme);
  });

  it('should map lapse rate thresholds to correct colors', () => {
    // Test specific threshold values mentioned in acceptance criteria
    // Inversion (< 0°C/1000ft) → deep purple/blue
    const inversionColor = lapseRateToColor(-0.5, false);
    const inversionMatch = inversionColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    expect(inversionMatch).not.toBeNull();
    const [, invR, invG, invB] = inversionMatch!.map(Number);
    expect(invB).toBeGreaterThan(invR); // Blue dominant

    // Stable (0-1.5°C/1000ft) → lavender/light purple
    const stableColor = lapseRateToColor(0.8, false);
    const stableMatch = stableColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    expect(stableMatch).not.toBeNull();
    const [, stableR, stableG, stableB] = stableMatch!.map(Number);
    expect(stableB).toBeGreaterThan(stableG); // Purple tint (blue > green)

    // Neutral (1.5-2.5°C/1000ft) → pale/white
    const neutralColor = lapseRateToColor(2.0, false);
    const neutralMatch = neutralColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    expect(neutralMatch).not.toBeNull();
    const [, neutR, neutG, neutB] = neutralMatch!.map(Number);
    expect(neutR).toBeGreaterThan(200); // Light color
    expect(neutG).toBeGreaterThan(200);
    expect(neutB).toBeGreaterThan(200);

    // Conditionally unstable (2.5-3°C/1000ft) → warm yellow
    const condUnstableColor = lapseRateToColor(2.8, false);
    const condMatch = condUnstableColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    expect(condMatch).not.toBeNull();
    const [, condR, condG, condB] = condMatch!.map(Number);
    expect(condR).toBeGreaterThan(condB); // Warm color (red > blue)
    expect(condG).toBeGreaterThan(condB);

    // Unstable (>3°C/1000ft) → orange/red
    const unstableColor = lapseRateToColor(3.5, false);
    const unstableMatch = unstableColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    expect(unstableMatch).not.toBeNull();
    const [, unstR, unstG, unstB] = unstableMatch!.map(Number);
    expect(unstR).toBeGreaterThan(unstG); // Red dominant
    expect(unstR).toBeGreaterThan(unstB);
  });
});

describe('bilinearInterpolate', () => {
  it('should interpolate correctly at center', () => {
    const result = bilinearInterpolate(0.5, 0.5, 0, 2, 0, 2);
    expect(result).toBeCloseTo(1.0, 5); // Average of corners
  });

  it('should return corner value at corners', () => {
    expect(bilinearInterpolate(0, 0, 10, 20, 30, 40)).toBeCloseTo(10, 5); // Bottom-left
    expect(bilinearInterpolate(1, 0, 10, 20, 30, 40)).toBeCloseTo(20, 5); // Bottom-right
    expect(bilinearInterpolate(0, 1, 10, 20, 30, 40)).toBeCloseTo(30, 5); // Top-left
    expect(bilinearInterpolate(1, 1, 10, 20, 30, 40)).toBeCloseTo(40, 5); // Top-right
  });

  it('should handle null values by returning nearest neighbor', () => {
    expect(bilinearInterpolate(0.5, 0.5, 10, null, null, null)).toBe(10);
    expect(bilinearInterpolate(0.8, 0.2, null, 20, null, null)).toBe(20);
  });

  it('should interpolate linearly along edges', () => {
    const result = bilinearInterpolate(0.5, 0, 0, 10, 0, 10);
    expect(result).toBeCloseTo(5, 5); // Halfway between 0 and 10 on bottom edge
  });
});

describe('getLapseRateLegend', () => {
  it('should return legend entries for both light and dark themes', () => {
    const lightLegend = getLapseRateLegend(false);
    const darkLegend = getLapseRateLegend(true);

    expect(lightLegend).toHaveLength(5);
    expect(darkLegend).toHaveLength(5);

    // Check labels
    const labels = lightLegend.map((e) => e.label);
    expect(labels).toContain('Inversion');
    expect(labels).toContain('Stable');
    expect(labels).toContain('Neutral');
    expect(labels).toContain('Unstable');
    expect(labels).toContain('Very Unstable');
  });

  it('should have colors matching lapse rates', () => {
    const legend = getLapseRateLegend(false);

    for (const entry of legend) {
      expect(entry.color).toBe(lapseRateToColor(entry.lapseRate, false));
    }
  });

  it('should have lapse rates in increasing order', () => {
    const legend = getLapseRateLegend(false);
    const rates = legend.map((e) => e.lapseRate);

    for (let i = 1; i < rates.length; i++) {
      expect(rates[i]).toBeGreaterThan(rates[i - 1]);
    }
  });
});
