// The Guide: pages that explain SoarCast to pilots, written in Markdown in
// src/guide/pages. Each page starts with a small front matter block:
//
//   ---
//   title: Data sources
//   summary: One sentence for the Guide's index and the page's description.
//   order: 1
//   covers:
//     - src/lib/weather-profile.ts
//   ---
//
// `covers` lists the code the page describes, so `npm run guide:check` can
// name the pages a change may have made wrong. Numbers come from the code as
// {{name}} placeholders (src/guide/facts.ts). Writing rules: src/guide/README.md.

export interface GuidePage {
  slug: string;
  title: string;
  summary: string;
  order: number;
  covers: string[];
  /** Markdown, placeholders not yet filled */
  body: string;
}

const FRONT_MATTER = /^---\n([\s\S]*?)\n---\n/;

/** A page from its file name (without .md) and its text. */
export function parseGuidePage(slug: string, raw: string): GuidePage {
  const text = raw.replace(/\r\n/g, '\n');
  const match = text.match(FRONT_MATTER);
  if (!match) throw new Error(`Guide page ${slug} has no front matter`);

  const fields: Record<string, string> = {};
  const covers: string[] = [];
  let list: string[] | null = null;
  for (const line of match[1].split('\n')) {
    const item = line.match(/^\s+-\s+(.+)$/);
    if (item && list) {
      list.push(item[1].trim());
      continue;
    }
    const field = line.match(/^(\w+):\s*(.*)$/);
    if (!field) continue;
    const [, key, value] = field;
    list = key === 'covers' ? covers : null;
    if (key !== 'covers') fields[key] = value.trim();
  }

  if (!fields.title || !fields.summary) {
    throw new Error(`Guide page ${slug} needs a title and a summary`);
  }
  return {
    slug,
    title: fields.title,
    summary: fields.summary,
    order: Number(fields.order ?? 100),
    covers,
    body: text.slice(match[0].length).trim(),
  };
}

/** Pages from a map of file path to text, in Guide order. */
export function guidePagesFromFiles(files: Record<string, string>): GuidePage[] {
  return Object.entries(files)
    .map(([path, raw]) => parseGuidePage(path.replace(/^.*\//, '').replace(/\.md$/, ''), raw))
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
}

const PLACEHOLDER = /\{\{\s*(\w+)\s*\}\}/g;

/** The names a page's placeholders use. */
export function placeholderNames(body: string): string[] {
  return [...body.matchAll(PLACEHOLDER)].map((m) => m[1]);
}

/** Fills {{name}} placeholders from the facts; an unknown name is an error. */
export function fillFacts(body: string, facts: Record<string, string | number>): string {
  return body.replace(PLACEHOLDER, (_, name: string) => {
    if (!(name in facts)) throw new Error(`Unknown guide fact {{${name}}}`);
    return String(facts[name]);
  });
}

/** A heading's anchor: "What it can't tell you" -> "what-it-cant-tell-you". */
export function headingId(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

/** The anchors of a page's headings, for links to a section. */
export function headingIds(body: string): string[] {
  return [...body.matchAll(/^#{2,6}\s+(.+)$/gm)].map((m) => headingId(m[1]));
}
