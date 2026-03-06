import { describe, it, expect } from 'vitest';
import { calculateDailyScores } from '../scoring';
import type { Forecast, Site } from '@/types';

describe('calculateDailyScores', () => {
  it('should calculate scores for a basic forecast', () => {
    const mockSite: Site = {
      id: 'test-1',
      name: 'Test Site',
      latitude: 47.5,
      longitude: -120.5,
      elevation: 1000,
      maxWindSpeed: 30,
      idealWindDirections: [180, 225, 270],
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    };

    const mockForecast: Forecast = {
      siteId: 'test-1',
      fetchedAt: '2024-01-01T00:00:00Z',
      expiresAt: '2024-01-01T03:00:00Z',
      modelElevation: 1000,
      sunrise: '2024-01-01T08:00:00Z',
      sunset: '2024-01-01T17:00:00Z',
      hourly: {
        time: [
          '2024-01-01T10:00',
          '2024-01-01T11:00',
          '2024-01-01T12:00',
          '2024-01-01T13:00',
          '2024-01-01T14:00',
          '2024-01-01T15:00',
          '2024-01-01T16:00',
        ],
        temperature_2m: [10, 12, 14, 16, 15, 13, 11],
        wind_speed_10m: [10, 12, 15, 18, 16, 14, 12],
        wind_direction_10m: [180, 190, 200, 210, 200, 190, 180],
        wind_gusts_10m: [15, 18, 20, 25, 22, 19, 17],
        cape: [500, 800, 1200, 1500, 1300, 900, 600],
        cloud_cover: [20, 30, 40, 45, 40, 35, 30],
        precipitation_probability: [5, 5, 10, 10, 10, 5, 5],
        pressure_msl: [1013, 1013, 1012, 1012, 1012, 1013, 1013],
        boundary_layer_height: [1000, 1500, 2000, 2500, 2200, 1800, 1400],
        wind_speed_850hPa: [20, 22, 25, 28, 26, 24, 22],
        wind_direction_850hPa: [190, 195, 200, 205, 200, 195, 190],
        convective_inhibition: [0, -10, -20, -30, -25, -15, -5],
      },
    };

    const scores = calculateDailyScores(mockForecast, mockSite);

    expect(scores).toBeDefined();
    expect(scores).toHaveLength(1); // Should have one day
    expect(scores[0]).toHaveProperty('date');
    expect(scores[0]).toHaveProperty('overallScore');
    expect(scores[0]).toHaveProperty('label');
    expect(scores[0].overallScore).toBeGreaterThanOrEqual(0);
    expect(scores[0].overallScore).toBeLessThanOrEqual(100);
  });

  it('should return empty array for empty forecast', () => {
    const mockSite: Site = {
      id: 'test-1',
      name: 'Test Site',
      latitude: 47.5,
      longitude: -120.5,
      elevation: 1000,
      maxWindSpeed: 30,
      idealWindDirections: [180],
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    };

    const emptyForecast: Forecast = {
      siteId: 'test-1',
      fetchedAt: '2024-01-01T00:00:00Z',
      expiresAt: '2024-01-01T03:00:00Z',
      modelElevation: 1000,
      sunrise: '2024-01-01T08:00:00Z',
      sunset: '2024-01-01T17:00:00Z',
      hourly: {
        time: [],
        temperature_2m: [],
        wind_speed_10m: [],
        wind_direction_10m: [],
        wind_gusts_10m: [],
        cape: [],
        cloud_cover: [],
        precipitation_probability: [],
        pressure_msl: [],
        boundary_layer_height: [],
        wind_speed_850hPa: [],
        wind_direction_850hPa: [],
        convective_inhibition: [],
      },
    };

    const scores = calculateDailyScores(emptyForecast, mockSite);

    expect(scores).toBeDefined();
    expect(scores).toHaveLength(0);
  });
});
