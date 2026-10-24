import { afterEach, describe, expect, it, vi } from 'vitest';
import { healthState, publicHealth, syncFailureNote, type HealthReport } from '../health';
import { errorText, logErrorsAsText } from '../error-text';

describe('syncFailureNote', () => {
  const at = Date.parse('2026-10-23T03:01:37Z') / 1000;

  it('names Paragliding Earth when it answered with an error status', () => {
    expect(
      syncFailureNote({
        status: 'failed',
        started_at: at,
        status_code: 503,
        error_message: 'PE API error 503',
      }),
    ).toBe(
      '. Paragliding Earth answered 503 at 2026-10-23 03:01 UTC, so pgsites keeps its last copy',
    );
  });

  it('gives the error when the run failed without an answer', () => {
    expect(
      syncFailureNote({
        status: 'failed',
        started_at: at,
        status_code: null,
        error_message: 'D1_ERROR: busy',
      }),
    ).toBe('. The run at 2026-10-23 03:01 UTC failed: D1_ERROR: busy');
  });

  it('adds nothing for a run that worked, or an older pgsites without the field', () => {
    expect(
      syncFailureNote({
        status: 'completed',
        started_at: at,
        status_code: 200,
        error_message: null,
      }),
    ).toBe('');
    expect(syncFailureNote(undefined)).toBe('');
    expect(syncFailureNote(null)).toBe('');
  });
});

describe('healthState', () => {
  it('is ok with nothing failing', () => {
    expect(healthState([])).toBe('ok');
  });

  it('changes when a second check fails, whatever the order', () => {
    expect(healthState(['pgsites sync'])).toBe('failing: pgsites sync');
    expect(healthState(['pgsites sync', 'alerts'])).toBe('failing: alerts, pgsites sync');
    expect(healthState(['alerts', 'pgsites sync'])).toBe(healthState(['pgsites sync', 'alerts']));
  });
});

describe('errorText', () => {
  it('keeps the name and message ahead of the stack', () => {
    const error = new Error('Open-Meteo answered 429');
    error.stack = '    at fetchAtmosphericProfile (worker.js:1:2)';
    expect(errorText(error)).toBe(
      'Error: Open-Meteo answered 429\n    at fetchAtmosphericProfile (worker.js:1:2)',
    );
  });

  it('does not repeat a stack that already starts with the message', () => {
    const error = new TypeError('bad input');
    error.stack = 'TypeError: bad input\n    at x (worker.js:3:4)';
    expect(errorText(error)).toBe('TypeError: bad input\n    at x (worker.js:3:4)');
  });

  it('adds the cause', () => {
    const cause = new Error('D1_ERROR: internal error');
    cause.stack = undefined;
    const error = new Error('Could not cache', { cause });
    error.stack = undefined;
    expect(errorText(error)).toBe(
      'Error: Could not cache\nCaused by: Error: D1_ERROR: internal error',
    );
  });
});

describe('logErrorsAsText', () => {
  const original = { error: console.error, warn: console.warn };
  afterEach(() => {
    console.error = original.error;
    console.warn = original.warn;
  });

  it('turns Error arguments into text and leaves the rest', () => {
    const seen = vi.fn();
    console.error = seen;
    logErrorsAsText();
    const error = new Error('gone');
    error.stack = undefined;
    console.error('Up now failed:', error, 3);
    expect(seen).toHaveBeenCalledWith('Up now failed:', 'Error: gone', 3);
  });
});

describe('publicHealth', () => {
  const now = new Date('2026-10-24T12:00:00Z');
  const report = (ok: boolean, checkedAt = '2026-10-24T11:30:00Z'): HealthReport => ({
    ok,
    checkedAt,
    checks: [
      { name: 'database', ok: true, detail: 'read and write ok' },
      { name: 'forecast', ok, detail: ok ? '48 hours' : 'Open-Meteo returned 500' },
    ],
  });

  it('answers 200 for a recent passing report, without the details', () => {
    expect(publicHealth(report(true), now)).toEqual({
      httpStatus: 200,
      body: {
        status: 'ok',
        checkedAt: '2026-10-24T11:30:00Z',
        checks: [
          { name: 'database', ok: true },
          { name: 'forecast', ok: true },
        ],
      },
    });
  });

  it('answers 503 when a check failed', () => {
    const { httpStatus, body } = publicHealth(report(false), now);
    expect(httpStatus).toBe(503);
    expect(body.status).toBe('failing');
    expect(JSON.stringify(body)).not.toContain('Open-Meteo');
  });

  it('answers 503 when the hourly check stopped reporting', () => {
    expect(publicHealth(report(true, '2026-10-24T09:00:00Z'), now)).toMatchObject({
      httpStatus: 503,
      body: { status: 'stale' },
    });
    expect(publicHealth(null, now)).toEqual({
      httpStatus: 503,
      body: { status: 'stale', checkedAt: null, checks: [] },
    });
  });
});
