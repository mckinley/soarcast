import { describe, it, expect } from 'vitest';
import type { DayScore, Site } from '@/types';
import {
  digestTitle,
  generateMorningDigest,
  generateNotification,
  type DayAnalysis,
} from '../notifications';

const site = (name: string): Site => ({
  id: name.toLowerCase().replace(/ /g, '-'),
  name,
  latitude: 47.5,
  longitude: -121.8,
  elevation: 600,
  idealWindDirections: [225],
  maxWindSpeed: 25,
  createdAt: '',
  updatedAt: '',
});

function analysis(overrides: Partial<DayAnalysis> & Pick<DayAnalysis, 'status'>): DayAnalysis {
  const day: DayScore = {
    date: '2026-07-19',
    overallScore: 70,
    label: 'Good',
    verdict: overrides.status === 'no' || overrides.status === 'marginal' ? overrides.status : 'go',
    flyableWindow: '10:00-17:00',
    limitingFactor: null,
    reasons: [],
    flight: overrides.flight ?? 'thermal',
    goalMet: overrides.status === 'go',
  };
  return {
    date: day.date,
    verdict: day.verdict,
    headline: 'Go: thermals 12:00-16:00',
    flight: 'thermal',
    flightTime: '12:00-16:00',
    limitingFactor: null,
    concerns: [],
    hazard: null,
    highlights: ['Climbs about 1.8 m/s', 'lift to ~3,900 ft above launch'],
    summary: '',
    day,
    ...overrides,
  };
}

describe('digestTitle', () => {
  it('names the one site that is a go', () => {
    expect(
      digestTitle([
        { name: 'Tiger Mountain', status: 'go' },
        { name: 'Mt. Si', status: 'flyable' },
      ]),
    ).toBe('Go today at Tiger Mountain');
  });

  it('counts several, and says so when none is a go', () => {
    expect(
      digestTitle([
        { name: 'A', status: 'go' },
        { name: 'B', status: 'go' },
        { name: 'C', status: 'no' },
      ]),
    ).toBe('Go today at 2 of your 3 sites');
    expect(digestTitle([{ name: 'A', status: 'flyable' }])).toBe('No go today at your sites');
  });
});

describe('generateNotification', () => {
  it('says the site is a go and what the flight is', () => {
    const n = generateNotification(
      site('Tiger Mountain'),
      analysis({ status: 'go', date: '2026-07-19' }),
      '/sites/tiger-mountain--abc',
      '2026-07-18',
    );
    expect(n.title).toBe('Tiger Mountain: go tomorrow');
    expect(n.body).toBe(
      'Thermals 12:00-16:00, climbs about 1.8 m/s, lift to ~3,900 ft above launch.',
    );
    expect(n.url).toBe('/sites/tiger-mountain--abc');
  });

  it('calls a sled ride a go where a safe launch is enough', () => {
    const n = generateNotification(
      site('Mailbox Peak'),
      analysis({
        status: 'go',
        flight: 'sled',
        flightTime: '10:00-17:00',
        highlights: ['Lift tops out ~300 ft above launch'],
      }),
      '/sites/mailbox',
      '2026-07-19',
    );
    expect(n.title).toBe('Mailbox Peak: go today');
    expect(n.body).toBe('Sled ride 10:00-17:00, lift tops out ~300 ft above launch.');
  });
});

describe('generateMorningDigest', () => {
  it('leads with the best go and lists the others', () => {
    const n = generateMorningDigest(
      [
        { site: site('Mailbox Peak'), analysis: analysis({ status: 'flyable', flight: 'sled' }) },
        { site: site('Tiger Mountain'), analysis: analysis({ status: 'go' }) },
      ],
      '2026-07-19',
    );
    expect(n.title).toBe('Go today at Tiger Mountain');
    expect(n.body).toBe(
      'Tiger Mountain: thermals 12:00-16:00, climbs about 1.8 m/s, lift to ~3,900 ft above launch.',
    );
  });
});
