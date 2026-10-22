import { describe, expect, it } from 'vitest';
import { renderDigestHtml } from '../send';
import { digestText, type SiteDigestItem } from '../morning-digest';

const sites: SiteDigestItem[] = [
  { name: 'Mount Si', status: 'no', headline: 'Not flyable', detail: 'Rain' },
  {
    name: 'Tiger Mountain',
    url: '/sites/tiger-mountain',
    status: 'go',
    headline: 'Go: thermals 12:00-16:00',
    concern: 'gusts 30 km/h',
  },
];

describe('the morning digest email', () => {
  it('renders HTML with the doctype email clients expect, best site first', () => {
    const html = renderDigestHtml({ date: 'Monday, March 8, 2026', sites });
    expect(html.startsWith('<!DOCTYPE html PUBLIC')).toBe(true);
    expect(html).toContain('href="https://soarcast.mckinleyaviation.com/sites/tiger-mountain"');
    expect(html.indexOf('Tiger Mountain')).toBeLessThan(html.indexOf('Mount Si'));
    expect(html).toContain('Watch for: gusts 30 km/h');
  });

  it('has a plain text part with the same sites and links', () => {
    const text = digestText({ date: 'Monday, March 8, 2026', sites });
    expect(text).toContain('SoarCast · Monday, March 8, 2026');
    expect(text).toContain(
      'Tiger Mountain\nGo: thermals 12:00-16:00\nWatch for: gusts 30 km/h\nhttps://soarcast.mckinleyaviation.com/sites/tiger-mountain',
    );
    expect(text.indexOf('Tiger Mountain')).toBeLessThan(text.indexOf('Mount Si'));
    expect(text).toContain('Manage notifications: https://soarcast.mckinleyaviation.com/settings');
  });

  it('says so when there are no sites', () => {
    expect(digestText({ date: 'x', sites: [] })).toContain('No flying sites yet.');
  });
});
