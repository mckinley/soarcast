import { describe, it, expect } from 'vitest';
import {
  calculateThermalVelocity,
  getThermalStrengthFromVelocity,
  formatThermalVelocity,
} from './thermal-cloud-utils';

describe('calculateThermalVelocity', () => {
  it('should calculate W* from CAPE using simplified formula', () => {
    // Example: 1000 J/kg CAPE
    // W* = 0.12 * sqrt(1000) ≈ 0.12 * 31.62 ≈ 3.79 m/s
    const wStar = calculateThermalVelocity(1000);
    expect(wStar).not.toBeNull();
    expect(wStar).toBeCloseTo(3.79, 1);
  });

  it('should return null for zero or negative CAPE', () => {
    expect(calculateThermalVelocity(0)).toBeNull();
    expect(calculateThermalVelocity(-100)).toBeNull();
  });

  it('should return null for null CAPE', () => {
    expect(calculateThermalVelocity(null)).toBeNull();
  });

  it('should calculate realistic W* values for different CAPE levels', () => {
    // Weak thermals: 100 J/kg CAPE
    const weak = calculateThermalVelocity(100);
    expect(weak).not.toBeNull();
    expect(weak!).toBeLessThan(2); // Should be ~1.2 m/s

    // Moderate thermals: 500 J/kg CAPE
    const moderate = calculateThermalVelocity(500);
    expect(moderate).not.toBeNull();
    expect(moderate!).toBeGreaterThan(2);
    expect(moderate!).toBeLessThan(3.5); // Should be ~2.7 m/s

    // Strong thermals: 2000 J/kg CAPE
    const strong = calculateThermalVelocity(2000);
    expect(strong).not.toBeNull();
    expect(strong!).toBeGreaterThan(5); // Should be ~5.4 m/s
  });
});

describe('getThermalStrengthFromVelocity', () => {
  it('should categorize no thermals (W* < 0.5 m/s)', () => {
    const result = getThermalStrengthFromVelocity(0);
    expect(result.strength).toBe('none');
    expect(result.label).toBe('None');
    expect(result.color).toContain('#9ca3af'); // gray
  });

  it('should categorize weak thermals (0.5-1 m/s)', () => {
    const result = getThermalStrengthFromVelocity(0.8);
    expect(result.strength).toBe('weak');
    expect(result.label).toBe('Weak');
    expect(result.color).toContain('#60a5fa'); // blue
  });

  it('should categorize moderate thermals (1-2 m/s)', () => {
    const result = getThermalStrengthFromVelocity(1.5);
    expect(result.strength).toBe('moderate');
    expect(result.label).toBe('Moderate');
    expect(result.color).toContain('#34d399'); // green
  });

  it('should categorize strong thermals (2-3 m/s)', () => {
    const result = getThermalStrengthFromVelocity(2.5);
    expect(result.strength).toBe('strong');
    expect(result.label).toBe('Strong');
    expect(result.color).toContain('#fb923c'); // orange
  });

  it('should categorize very strong thermals (>3 m/s)', () => {
    const result = getThermalStrengthFromVelocity(4.0);
    expect(result.strength).toBe('very_strong');
    expect(result.label).toBe('Very Strong');
    expect(result.color).toContain('#ef4444'); // red
  });

  it('should handle null W* as no thermals', () => {
    const result = getThermalStrengthFromVelocity(null);
    expect(result.strength).toBe('none');
  });

  it('should use correct boundary thresholds', () => {
    // Test edge cases at boundaries
    expect(getThermalStrengthFromVelocity(0.49).strength).toBe('none');
    expect(getThermalStrengthFromVelocity(0.5).strength).toBe('weak');
    expect(getThermalStrengthFromVelocity(0.99).strength).toBe('weak');
    expect(getThermalStrengthFromVelocity(1.0).strength).toBe('moderate');
    expect(getThermalStrengthFromVelocity(1.99).strength).toBe('moderate');
    expect(getThermalStrengthFromVelocity(2.0).strength).toBe('strong');
    expect(getThermalStrengthFromVelocity(2.99).strength).toBe('strong');
    expect(getThermalStrengthFromVelocity(3.0).strength).toBe('very_strong');
  });
});

describe('formatThermalVelocity', () => {
  it('should format W* to one decimal place', () => {
    expect(formatThermalVelocity(2.34)).toBe('2.3');
    expect(formatThermalVelocity(0.56)).toBe('0.6');
    expect(formatThermalVelocity(5.0)).toBe('5.0');
  });

  it('should handle null as em dash', () => {
    expect(formatThermalVelocity(null)).toBe('—');
  });

  it('should round correctly', () => {
    expect(formatThermalVelocity(2.35)).toBe('2.4'); // Rounds up
    expect(formatThermalVelocity(2.34)).toBe('2.3'); // Rounds down
  });
});
