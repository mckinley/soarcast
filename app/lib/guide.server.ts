import { Marked, type Tokens } from 'marked';
import { fillFacts, guidePagesFromFiles, headingId, type GuidePage } from '~/guide/guide';
import { GUIDE_FACTS } from '~/guide/facts';

// The Guide's pages, read from src/guide/pages at build time and rendered to
// HTML on the server, with the code's numbers filled in.

const files = import.meta.glob('/src/guide/pages/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const pages = guidePagesFromFiles(files);

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

const markdown = new Marked({
  renderer: {
    // Headings get an id, so a link can open a page at a section.
    heading({ tokens, depth, text }: Tokens.Heading) {
      return `<h${depth} id="${headingId(text)}">${this.parser.parseInline(tokens)}</h${depth}>\n`;
    },
    // Outside sources open in a new tab; links within SoarCast stay in it.
    link({ href, title, tokens }: Tokens.Link) {
      const text = this.parser.parseInline(tokens);
      const external = /^https?:\/\//.test(href) ? ' target="_blank" rel="noreferrer"' : '';
      const titled = title ? ` title="${escapeAttribute(title)}"` : '';
      return `<a href="${escapeAttribute(href)}"${titled}${external}>${text}</a>`;
    },
  },
  hooks: {
    // Wide tables scroll on their own instead of widening the page on a phone.
    postprocess: (html) =>
      html
        .replace(/<table>/g, '<div class="overflow-x-auto"><table>')
        .replace(/<\/table>/g, '</table></div>'),
  },
});

export type GuideSummary = Pick<GuidePage, 'slug' | 'title' | 'summary'>;

/** Every page, in Guide order. */
export function guidePages(): GuideSummary[] {
  return pages.map(({ slug, title, summary }) => ({ slug, title, summary }));
}

/** One page rendered to HTML, or null when there is none by that slug. */
export function guidePage(slug: string): (GuideSummary & { html: string }) | null {
  const page = pages.find((p) => p.slug === slug);
  if (!page) return null;
  const html = markdown.parse(fillFacts(page.body, GUIDE_FACTS), { async: false });
  return { slug: page.slug, title: page.title, summary: page.summary, html };
}
