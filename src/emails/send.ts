import { render, toPlainText } from '@react-email/components';
import { MorningDigestEmail, type SiteDigestItem } from './morning-digest';

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
  const html = await render(MorningDigestEmail({ date, sites }));

  return mailer.send({
    from: EMAIL_FROM,
    to,
    subject: `Your SoarCast Morning Digest - ${date}`,
    html,
    text: toPlainText(html),
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
