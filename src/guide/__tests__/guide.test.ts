import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'fs';
import path from 'path';
import {
  fillFacts,
  guidePagesFromFiles,
  parseGuidePage,
  placeholderNames,
  type GuidePage,
} from '@/guide/guide';
import { GUIDE_FACTS } from '@/guide/facts';

const ROOT = path.resolve(__dirname, '../../..');
const PAGES_DIR = path.join(ROOT, 'src/guide/pages');

function loadPages(): GuidePage[] {
  const files: Record<string, string> = {};
  for (const name of readdirSync(PAGES_DIR).filter((n) => n.endsWith('.md'))) {
    files[name] = readFileSync(path.join(PAGES_DIR, name), 'utf8');
  }
  return guidePagesFromFiles(files);
}

const pages = loadPages();

/** What a pilot reads: link text without its address, no code or placeholders' braces. */
function readableText(markdown: string): string {
  return markdown
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/`[^`]*`/g, '')
    .replace(/\{\{\s*(\w+)\s*\}\}/g, 'N');
}

/** Sentences, with table cells, list items and headings each read on their own. */
function sentences(markdown: string): string[] {
  const out: string[] = [];
  for (const block of readableText(markdown).split(/\n\s*\n/)) {
    const lines = block.split('\n').map((l) => l.trim());
    let parts: string[];
    if (lines[0].startsWith('|')) {
      parts = lines.filter((l) => !/^\|[\s|:-]+\|$/.test(l)).flatMap((l) => l.split('|'));
    } else if (/^([-*]|\d+\.)\s/.test(lines[0])) {
      parts = block
        .split(/\n\s*(?:[-*]|\d+\.)\s/)
        .map((l) => l.replace(/^\s*(?:[-*]|\d+\.)\s/, ''));
    } else {
      parts = [lines.join(' ')];
    }
    for (const part of parts) {
      const text = part
        .replace(/^#+\s*/, '')
        .replace(/\*\*/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (text) out.push(...text.split(/(?<=[.!?])\s+/));
    }
  }
  return out;
}

const MAX_WORDS = 25;

/** Words a pilot reading the Guide wouldn't know, or that age a page. */
const BANNED = [
  /\bpull requests?\b/i,
  /\bPRs?\b/,
  /\bthreads?\b/i,
  /\bchats?\b/i,
  /\bClaude\b/i,
  /\bpgsites\b/i,
  /\bD1\b/,
  /\bCloudflare\b/i,
  /\bforecast engine\b/i,
  /\bAPIs?\b/,
  /\bcache[ds]?\b/i,
  /\b(TODO|TBD)\b/,
  /\bcoming soon\b/i,
  /\bno longer\b/i,
  /\bused to be\b/i,
  /\b(recently|previously|formerly)\b/i,
  /\b(we|we're|we've|our|ours)\b/i,
  /\b(e\.g|i\.e)\./i,
  /\betc\./i,
  /\bscore\b/i,
];

describe('Guide pages', () => {
  it('has pages, each with a title and summary', () => {
    expect(pages.length).toBeGreaterThan(0);
    for (const page of pages) {
      expect(page.title, page.slug).toBeTruthy();
      expect(page.summary, page.slug).toBeTruthy();
    }
  });

  it('reads front matter, covers and body', () => {
    const page = parseGuidePage(
      'x',
      '---\ntitle: X\nsummary: About X.\norder: 2\ncovers:\n  - a.ts\n  - b/c.ts\n---\n\nBody {{n}}.\n',
    );
    expect(page).toMatchObject({
      title: 'X',
      summary: 'About X.',
      order: 2,
      covers: ['a.ts', 'b/c.ts'],
    });
    expect(page.body).toBe('Body {{n}}.');
    expect(fillFacts(page.body, { n: 3 })).toBe('Body 3.');
    expect(() => fillFacts(page.body, {})).toThrow(/Unknown guide fact/);
  });

  it('uses only facts the code defines, and every fact is used', () => {
    const used = new Set(pages.flatMap((p) => placeholderNames(p.body)));
    for (const name of used) expect(GUIDE_FACTS, `{{${name}}}`).toHaveProperty(name);
    for (const name of Object.keys(GUIDE_FACTS))
      expect(used, `fact ${name} unused`).toContain(name);
  });

  it('covers files that exist', () => {
    for (const page of pages) {
      expect(page.covers.length, `${page.slug} covers nothing`).toBeGreaterThan(0);
      for (const file of page.covers) {
        expect(existsSync(path.join(ROOT, file)), `${page.slug}: ${file}`).toBe(true);
      }
    }
  });

  it('links only to Guide pages that exist', () => {
    const slugs = new Set(pages.map((p) => p.slug));
    for (const page of pages) {
      for (const [, slug] of page.body.matchAll(/\]\(\/guide\/([\w-]+)/g)) {
        expect(slugs, `${page.slug} links to /guide/${slug}`).toContain(slug);
      }
    }
  });

  describe.each(pages.map((p) => [p.slug, p] as const))('%s writing', (_, page) => {
    const text = readableText(`${page.title}\n\n${page.summary}\n\n${page.body}`);

    it('has no em dashes, en dashes or semicolons', () => {
      for (const s of sentences(text)) expect(s).not.toMatch(/[—–;]/);
    });

    it(`keeps sentences to ${MAX_WORDS} words`, () => {
      for (const s of sentences(text)) {
        expect(s.split(/\s+/).length, s).toBeLessThanOrEqual(MAX_WORDS);
      }
    });

    it('uses no internal or dated words', () => {
      for (const s of sentences(text)) {
        for (const word of BANNED) expect(s, String(word)).not.toMatch(word);
      }
    });

    it('names headings neutrally', () => {
      const headings = [...page.body.matchAll(/^#+\s+(.+)$/gm)].map((m) => m[1]);
      for (const heading of [page.title, ...headings]) {
        expect(heading).not.toMatch(/^(Your|My)\b/i);
      }
    });
  });
});
