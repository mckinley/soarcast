import { Fragment } from 'react';
import { cn } from '@/lib/utils';
import { htmlToPlainText } from '@/lib/notes';

interface SiteNotesProps {
  text?: string | null;
  className?: string;
}

// Matches http(s) URLs so we can render them as clickable links.
const URL_REGEX = /(https?:\/\/[^\s]+)/g;

/**
 * Renders a site description as clean text. Any HTML in the source (common for
 * pgsites/ParaglidingEarth descriptions) is converted to plain text so raw
 * tags never show, and bare URLs become safe links. We never inject raw HTML,
 * so this is XSS-safe.
 */
export function SiteNotes({ text, className }: SiteNotesProps) {
  const plain = htmlToPlainText(text);
  if (!plain) return null;

  const segments = plain.split(URL_REGEX);

  return (
    <div className={cn('whitespace-pre-line break-words', className)}>
      {segments.map((segment, index) => {
        if (/^https?:\/\//.test(segment)) {
          // Trim trailing punctuation that is unlikely to be part of the URL
          const match = segment.match(/[).,;]+$/);
          const trailing = match ? match[0] : '';
          const url = trailing ? segment.slice(0, -trailing.length) : segment;
          return (
            <Fragment key={index}>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline underline-offset-2 hover:no-underline"
              >
                {url}
              </a>
              {trailing}
            </Fragment>
          );
        }
        return <Fragment key={index}>{segment}</Fragment>;
      })}
    </div>
  );
}
