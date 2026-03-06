import { describe, it, expect } from 'vitest';
import {
  calculateLapseRate,
  estimateCloudBase,
  calculateThermalIndex,
  estimateTopOfLift,
} from '../weather-profile';

describe('calculateLapseRate', () => {
  it('should calculate lapse rate correctly for typical thermal conditions', () => {
    // 850 hPa: 15°C at 1500m, 700 hPa: 5°C at 3000m
    const lapseRate = calculateLapseRate(15, 5, 1500, 3000);

    // Expected: (15 - 5) / ((3000 - 1500) * 3.28084 / 1000) = 10 / 4.92 ≈ 2.03 °C/1000ft
    expect(lapseRate).toBeCloseTo(2.03, 1);
  });

  it('should calculate lapse rate for unstable conditions (steep lapse)', () => {
    // Strong instability: 4°C/1000ft
    const lapseRate = calculateLapseRate(20, 8, 1000, 2000);
    expect(lapseRate).toBeGreaterThan(3.0);
  });

  it('should calculate lapse rate for stable conditions (shallow lapse)', () => {
    // Stable air: 1°C/1000ft
    const lapseRate = calculateLapseRate(15, 14, 1000, 2000);
    expect(lapseRate).toBeLessThan(1.5);
  });

  it('should return null for invalid height difference', () => {
    const lapseRate = calculateLapseRate(15, 5, 3000, 3000); // Same height
    expect(lapseRate).toBeNull();
  });

  it('should return null for negative height difference', () => {
    const lapseRate = calculateLapseRate(15, 5, 3000, 1500); // Upper < lower
    expect(lapseRate).toBeNull();
  });
});

describe('estimateCloudBase', () => {
  it('should estimate cloud base for moderate humidity', () => {
    // 20°C, 70% RH
    const cloudBase = estimateCloudBase(20, 70);

    // With 20°C and 70% RH, dewpoint ≈ 14.4°C, spread ≈ 5.6°C
    // Cloud base ≈ (5.6 / 2.5) * 1000 ft ≈ 2240 ft ≈ 683m
    expect(cloudBase).toBeGreaterThan(500);
    expect(cloudBase).toBeLessThan(1000);
  });

  it('should estimate lower cloud base for high humidity', () => {
    // 15°C, 85% RH - clouds likely lower
    const cloudBase = estimateCloudBase(15, 85);
    expect(cloudBase).toBeGreaterThan(0);
    expect(cloudBase).toBeLessThan(500);
  });

  it('should return 0 for very high humidity (fog/low cloud)', () => {
    const cloudBase = estimateCloudBase(10, 96);
    expect(cloudBase).toBe(0);
  });

  it('should return null for low humidity (no clouds likely)', () => {
    const cloudBase = estimateCloudBase(25, 35);
    expect(cloudBase).toBeNull();
  });
});

describe('calculateThermalIndex', () => {
  it('should calculate high index for excellent thermal conditions', () => {
    // Strong thermals: steep lapse, high CAPE, low CIN, moderate wind
    const thermalIndex = calculateThermalIndex(
      3.0, // °C/1000ft - very unstable
      1000, // CAPE J/kg - strong
      -10, // CIN J/kg - minimal inhibition
      15, // wind km/h - moderate
    );

    expect(thermalIndex).toBeGreaterThan(70);
  });

  it('should calculate moderate index for marginal thermal conditions', () => {
    // Marginal thermals: moderate lapse, low CAPE, moderate wind
    const thermalIndex = calculateThermalIndex(
      2.0, // °C/1000ft - moderate instability
      300, // CAPE J/kg - weak
      -20, // CIN J/kg - some inhibition
      12, // wind km/h
    );

    expect(thermalIndex).toBeGreaterThan(30);
    expect(thermalIndex).toBeLessThan(60);
  });

  it('should calculate low index for poor thermal conditions', () => {
    // Poor conditions: shallow lapse, no CAPE, high wind
    const thermalIndex = calculateThermalIndex(
      1.5, // °C/1000ft - stable
      50, // CAPE J/kg - very weak
      -50, // CIN J/kg - strong inhibition
      40, // wind km/h - too strong
    );

    expect(thermalIndex).toBeLessThan(30);
  });

  it('should return null when lapse rate is null', () => {
    const thermalIndex = calculateThermalIndex(null, 1000, -10, 15);
    expect(thermalIndex).toBeNull();
  });

  it('should handle null CIN gracefully', () => {
    const thermalIndex = calculateThermalIndex(
      2.5, // Good lapse
      800, // Good CAPE
      null, // CIN unavailable
      15, // Good wind
    );

    expect(thermalIndex).not.toBeNull();
    expect(thermalIndex).toBeGreaterThan(50);
  });

  it('should penalize very light winds (no thermal triggering)', () => {
    const thermalIndex = calculateThermalIndex(
      3.0, // Excellent lapse
      1000, // Excellent CAPE
      -10, // Low CIN
      2, // Very light wind
    );

    // Should be decent but not maximum due to light winds
    expect(thermalIndex).toBeGreaterThan(50);
    expect(thermalIndex).toBeLessThan(85);
  });

  it('should penalize very strong winds (blown out thermals)', () => {
    const thermalIndex = calculateThermalIndex(
      3.0, // Excellent lapse
      1000, // Excellent CAPE
      -10, // Low CIN
      45, // Very strong wind
    );

    // Should be reduced but still decent due to excellent lapse/CAPE
    // Wind component: max(0, 15 - (45-35)*0.5) = max(0, 15-5) = 10 points (vs 15 optimal)
    expect(thermalIndex).toBeGreaterThan(75);
    expect(thermalIndex).toBeLessThan(90);
  });
});

describe('estimateTopOfLift', () => {
  it('should estimate top of lift from boundary layer height and CAPE', () => {
    // BLH 2000m, moderate CAPE
    const topOfLift = estimateTopOfLift(2000, 500);

    // Expected: 2000 + (500/100 * 100) = 2500m
    expect(topOfLift).toBe(2500);
  });

  it('should cap CAPE boost at 2000m', () => {
    // BLH 1000m, very high CAPE
    const topOfLift = estimateTopOfLift(1000, 5000);

    // Expected: 1000 + 2000 (capped) = 3000m
    expect(topOfLift).toBe(3000);
  });

  it('should return null when BLH is null', () => {
    const topOfLift = estimateTopOfLift(null, 1000);
    expect(topOfLift).toBeNull();
  });

  it('should return null when BLH is zero or negative', () => {
    expect(estimateTopOfLift(0, 1000)).toBeNull();
    expect(estimateTopOfLift(-100, 1000)).toBeNull();
  });

  it('should handle zero CAPE', () => {
    const topOfLift = estimateTopOfLift(1500, 0);
    expect(topOfLift).toBe(1500); // Just BLH, no boost
  });
});

describe('atmospheric profile integration', () => {
  it('should have consistent relationships between derived parameters', () => {
    // Test that derived parameters make physical sense together
    const lapseRate = calculateLapseRate(15, 5, 1500, 3000);
    const thermalIndex = calculateThermalIndex(lapseRate!, 800, -15, 18);
    const cloudBase = estimateCloudBase(20, 65);
    const topOfLift = estimateTopOfLift(2200, 800);

    // All should be valid
    expect(lapseRate).not.toBeNull();
    expect(thermalIndex).not.toBeNull();
    expect(cloudBase).not.toBeNull();
    expect(topOfLift).not.toBeNull();

    // Cloud base should be below top of lift
    expect(cloudBase!).toBeLessThan(topOfLift!);

    // Reasonable ranges
    expect(lapseRate).toBeGreaterThan(0);
    expect(thermalIndex).toBeGreaterThan(0);
    expect(thermalIndex).toBeLessThanOrEqual(100);
  });
});
