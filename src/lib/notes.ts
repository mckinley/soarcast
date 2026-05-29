// Utilities for handling site notes/descriptions.
//
// Site descriptions are sometimes imported from external paragliding-site
// databases and contain raw HTML (e.g. <p>, <br>, <a> tags). Rendering that
// as escaped text shows the literal markup, so we convert it to clean plain
// text before displaying it (and linkify URLs at render time).

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  copy: "©",
  deg: "°",
  mdash: "—",
  ndash: "–",
  hellip: "…",
};

function decodeEntities(input: string): string {
  return input
    .replace(/&#(\d+);/g, (_, dec: string) =>
      String.fromCodePoint(parseInt(dec, 10))
    )
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCodePoint(parseInt(hex, 16))
    )
    .replace(/&([a-z]+);/gi, (match, name: string) => {
      const decoded = NAMED_ENTITIES[name.toLowerCase()];
      return decoded ?? match;
    });
}

/**
 * Converts a (possibly HTML) notes string into clean, readable plain text.
 * Block-level tags and <br> become line breaks; all other tags are stripped;
 * HTML entities are decoded. Never returns markup, so it is safe to render.
 */
export function htmlToPlainText(html: string | null | undefined): string {
  if (!html) return "";

  let text = html;

  // List items become bulleted lines
  text = text.replace(/<\s*li[^>]*>/gi, "\n• ");
  // <br> and closing block tags become newlines
  text = text.replace(/<\s*br\s*\/?\s*>/gi, "\n");
  text = text.replace(/<\/\s*(p|div|li|h[1-6]|tr|ul|ol)\s*>/gi, "\n");
  // Strip any remaining tags
  text = text.replace(/<[^>]+>/g, "");
  // Decode entities
  text = decodeEntities(text);
  // Normalize whitespace: trim trailing spaces per line, collapse blank runs
  text = text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

  return text;
}
