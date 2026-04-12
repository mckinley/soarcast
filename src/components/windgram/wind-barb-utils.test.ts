import { describe, it, expect } from 'vitest';
import { kmhToKnots, windSpeedToBarb, formatWindTooltip } from './wind-barb-utils';

describe('kmhToKnots', () => {
  it('should convert km/h to knots correctly', () => {
    expect(kmhToKnots(0)).toBe(0);
    expect(kmhToKnots(10)).toBeCloseTo(5.4, 1);
    expect(kmhToKnots(20)).toBeCloseTo(10.8, 1);
    expect(kmhToKnots(50)).toBeCloseTo(27.0, 1);
    expect(kmhToKnots(100)).toBeCloseTo(54.0, 1);
  });
});

describe('windSpeedToBarb', () => {
  describe('calm winds', () => {
    it('should return calm category for 0 km/h', () => {
      const barb = windSpeedToBarb(0, 180, false);
      expect(barb.speedKnots).toBe(0);
      expect(barb.category).toBe('calm');
      expect(barb.flags).toBe(0);
      expect(barb.fullBarbs).toBe(0);
      expect(barb.halfBarbs).toBe(0);
    });

    it('should return calm for very light winds that round to 0 kt', () => {
      const barb = windSpeedToBarb(4, 180, false); // ~2 kt, rounds to 0
      expect(barb.speedKnots).toBe(0);
      expect(barb.category).toBe('calm');
    });
  });

  describe('light winds', () => {
    it('should create half barb for 5 kt winds', () => {
      const barb = windSpeedToBarb(9.3, 180, false); // ~5 kt
      expect(barb.speedKnots).toBe(5);
      expect(barb.category).toBe('light');
      expect(barb.flags).toBe(0);
      expect(barb.fullBarbs).toBe(0);
      expect(barb.halfBarbs).toBe(1);
    });

    it('should create one full barb for 10 kt winds', () => {
      const barb = windSpeedToBarb(18.5, 180, false); // ~10 kt
      expect(barb.speedKnots).toBe(10);
      expect(barb.category).toBe('light');
      expect(barb.flags).toBe(0);
      expect(barb.fullBarbs).toBe(1);
      expect(barb.halfBarbs).toBe(0);
    });
  });

  describe('moderate winds', () => {
    it('should create correct barbs for 15 kt winds', () => {
      const barb = windSpeedToBarb(27.8, 180, false); // ~15 kt
      expect(barb.speedKnots).toBe(15);
      expect(barb.category).toBe('moderate');
      expect(barb.flags).toBe(0);
      expect(barb.fullBarbs).toBe(1);
      expect(barb.halfBarbs).toBe(1);
    });

    it('should create correct barbs for 20 kt winds', () => {
      const barb = windSpeedToBarb(37, 180, false); // ~20 kt
      expect(barb.speedKnots).toBe(20);
      expect(barb.category).toBe('moderate');
      expect(barb.flags).toBe(0);
      expect(barb.fullBarbs).toBe(2);
      expect(barb.halfBarbs).toBe(0);
    });
  });

  describe('strong winds', () => {
    it('should create correct barbs for 25 kt winds', () => {
      const barb = windSpeedToBarb(46.3, 180, false); // ~25 kt
      expect(barb.speedKnots).toBe(25);
      expect(barb.category).toBe('strong');
      expect(barb.flags).toBe(0);
      expect(barb.fullBarbs).toBe(2);
      expect(barb.halfBarbs).toBe(1);
    });

    it('should create correct barbs for 30 kt winds', () => {
      const barb = windSpeedToBarb(55.6, 180, false); // ~30 kt
      expect(barb.speedKnots).toBe(30);
      expect(barb.category).toBe('strong');
      expect(barb.flags).toBe(0);
      expect(barb.fullBarbs).toBe(3);
      expect(barb.halfBarbs).toBe(0);
    });
  });

  describe('dangerous winds with flags', () => {
    it('should create flag for 50 kt winds', () => {
      const barb = windSpeedToBarb(92.6, 180, false); // ~50 kt
      expect(barb.speedKnots).toBe(50);
      expect(barb.category).toBe('dangerous');
      expect(barb.flags).toBe(1);
      expect(barb.fullBarbs).toBe(0);
      expect(barb.halfBarbs).toBe(0);
    });

    it('should create flag + barbs for 65 kt winds', () => {
      const barb = windSpeedToBarb(120.4, 180, false); // ~65 kt
      expect(barb.speedKnots).toBe(65);
      expect(barb.category).toBe('dangerous');
      expect(barb.flags).toBe(1);
      expect(barb.fullBarbs).toBe(1);
      expect(barb.halfBarbs).toBe(1);
    });

    it('should create multiple flags for 100 kt winds', () => {
      const barb = windSpeedToBarb(185.2, 180, false); // ~100 kt
      expect(barb.speedKnots).toBe(100);
      expect(barb.category).toBe('dangerous');
      expect(barb.flags).toBe(2);
      expect(barb.fullBarbs).toBe(0);
      expect(barb.halfBarbs).toBe(0);
    });
  });

  describe('direction handling', () => {
    it('should preserve wind direction', () => {
      const barb1 = windSpeedToBarb(20, 0, false);
      expect(barb1.direction).toBe(0);

      const barb2 = windSpeedToBarb(20, 90, false);
      expect(barb2.direction).toBe(90);

      const barb3 = windSpeedToBarb(20, 270, false);
      expect(barb3.direction).toBe(270);
    });
  });

  describe('theme-based colors', () => {
    it('should use white for all non-calm winds (US-003 RASP style)', () => {
      const lightBarb = windSpeedToBarb(20, 180, false);
      const darkBarb = windSpeedToBarb(20, 180, true);

      // Both light and dark theme use white for non-calm winds
      expect(lightBarb.color).toBe('rgb(255, 255, 255)');
      expect(darkBarb.color).toBe('rgb(255, 255, 255)');
    });

    it('should use white for calm winds', () => {
      const calmLight = windSpeedToBarb(0, 180, false);
      const calmDark = windSpeedToBarb(0, 180, true);

      // Calm winds use white, consistent with barb colors
      expect(calmLight.color).toBe('rgb(255, 255, 255)');
      expect(calmDark.color).toBe('rgb(255, 255, 255)');
    });

    it('should assign white color for all wind speeds above calm', () => {
      const light = windSpeedToBarb(10, 180, false);
      const moderate = windSpeedToBarb(20, 180, false);
      const strong = windSpeedToBarb(30, 180, false);
      const dangerous = windSpeedToBarb(40, 180, false);

      // All non-calm winds should be white for contrast against lapse rate background
      expect(light.color).toBe('rgb(255, 255, 255)');
      expect(moderate.color).toBe('rgb(255, 255, 255)');
      expect(strong.color).toBe('rgb(255, 255, 255)');
      expect(dangerous.color).toBe('rgb(255, 255, 255)');
    });
  });

  describe('rounding behavior', () => {
    it('should round speeds to nearest 5 kt', () => {
      // 7 kt rounds to 5 kt
      const barb1 = windSpeedToBarb(13, 180, false);
      expect(barb1.speedKnots).toBe(5);

      // 8 kt rounds to 10 kt
      const barb2 = windSpeedToBarb(15, 180, false);
      expect(barb2.speedKnots).toBe(10);

      // 12 kt rounds to 10 kt
      const barb3 = windSpeedToBarb(22, 180, false);
      expect(barb3.speedKnots).toBe(10);

      // 13 kt rounds to 15 kt
      const barb4 = windSpeedToBarb(24, 180, false);
      expect(barb4.speedKnots).toBe(15);
    });
  });
});

describe('formatWindTooltip', () => {
  it('should format wind data correctly', () => {
    const tooltip = formatWindTooltip(18.5, 180, { meters: 1500, feet: 4921 });

    expect(tooltip).toContain('10 kt'); // Speed in knots
    expect(tooltip).toContain('19 km/h'); // Speed in km/h (rounds to 19)
    expect(tooltip).toContain('180°'); // Direction in degrees
    expect(tooltip).toContain('S'); // Cardinal direction
    expect(tooltip).toContain('1500m'); // Altitude in meters
    expect(tooltip).toContain('4921ft'); // Altitude in feet
  });

  it('should format cardinal directions correctly', () => {
    const north = formatWindTooltip(20, 0, { meters: 1000, feet: 3280 });
    expect(north).toContain('N');

    const east = formatWindTooltip(20, 90, { meters: 1000, feet: 3280 });
    expect(east).toContain('E');

    const south = formatWindTooltip(20, 180, { meters: 1000, feet: 3280 });
    expect(south).toContain('S');

    const west = formatWindTooltip(20, 270, { meters: 1000, feet: 3280 });
    expect(west).toContain('W');

    const northeast = formatWindTooltip(20, 45, { meters: 1000, feet: 3280 });
    expect(northeast).toContain('NE');

    const southwest = formatWindTooltip(20, 225, { meters: 1000, feet: 3280 });
    expect(southwest).toContain('SW');
  });

  it('should handle calm winds', () => {
    const tooltip = formatWindTooltip(0, 0, { meters: 500, feet: 1640 });

    expect(tooltip).toContain('0 kt');
    expect(tooltip).toContain('0 km/h');
  });

  it('should round altitude values', () => {
    const tooltip = formatWindTooltip(20, 180, { meters: 1234.56, feet: 4050.72 });

    expect(tooltip).toContain('1235m');
    expect(tooltip).toContain('4051ft');
  });
});
