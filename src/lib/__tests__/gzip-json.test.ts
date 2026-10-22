import { describe, expect, it } from 'vitest';
import { gunzipJson, gzipJson } from '../gzip-json';

describe('gzipJson', () => {
  it('gives back the value it stored', async () => {
    const value = { hours: [{ time: '2026-10-22T09:00', wind: 12.5, note: 'é ✓' }], n: null };
    expect(await gunzipJson(await gzipJson(value))).toEqual(value);
  });

  it('stores a repetitive forecast in a fraction of its JSON size', async () => {
    const hours = Array.from({ length: 168 }, (_, i) => ({
      time: `2026-10-${String(22 + Math.floor(i / 24)).padStart(2, '0')}T${String(i % 24).padStart(2, '0')}:00`,
      temperature: 10 + (i % 7) * 0.4,
      windSpeed: 5 + (i % 11) * 0.3,
    }));
    const text = await gzipJson({ hours });
    expect(text).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(text.length).toBeLessThan(JSON.stringify({ hours }).length / 3);
    expect(await gunzipJson(text)).toEqual({ hours });
  });
});
