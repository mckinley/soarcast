import { renderToStaticMarkup } from 'react-dom/server';
import {
  MorningDigestEmail,
  digestHeadline,
  digestText,
  type SiteDigestItem,
} from './morning-digest';

// What email clients expect at the top, as React Email's own render adds it
const DOCTYPE =
  '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">';

/** The digest's HTML, rendered by React without React Email's heavier render. */
export function renderDigestHtml(message: Pick<MorningDigestMessage, 'date' | 'sites'>): string {
  return DOCTYPE + renderToStaticMarkup(MorningDigestEmail(message));
}

/**
 * Every SoarCast email comes from this address. Its domain must be onboarded on
 * Cloudflare Email Sending, and the `send_email` binding in wrangler.toml only
 * allows this sender.
 */
export const EMAIL_FROM: EmailAddress = {
  name: 'SoarCast',
  email: 'soarcast@mckinleyaviation.com',
};

export interface MorningDigestMessage {
  to: string;
  date: string; // e.g. "Monday, March 8, 2026"
  sites: SiteDigestItem[];
}

/**
 * Render the morning digest (HTML plus a plain-text part) and send it through
 * the Cloudflare Email Sending binding. Throws if the send fails.
 */
export async function sendMorningDigestEmail(
  mailer: SendEmail,
  { to, date, sites }: MorningDigestMessage,
): Promise<EmailSendResult> {
  return mailer.send({
    from: EMAIL_FROM,
    to,
    subject: `${digestHeadline(sites)} · SoarCast`,
    html: renderDigestHtml({ date, sites }),
    text: digestText({ date, sites }),
  });
}

/**
 * Email Sending errors carry a `code` (for example `E_SENDER_NOT_VERIFIED`)
 * next to the message. Keep both in logs.
 */
export function describeEmailError(error: unknown): string {
  if (error instanceof Error) {
    const code = (error as Error & { code?: unknown }).code;
    return typeof code === 'string' && code ? `${code}: ${error.message}` : error.message;
  }
  return String(error);
}
