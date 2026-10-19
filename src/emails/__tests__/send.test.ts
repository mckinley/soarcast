import { describe, it, expect, vi } from 'vitest';
import { EMAIL_FROM, describeEmailError, sendMorningDigestEmail } from '../send';

type SendArg = Parameters<SendEmail['send']>[0];

// A stand-in for the `send_email` binding: records the message, sends nothing.
function fakeMailer(
  respond: () => Promise<EmailSendResult> = () => Promise.resolve({ messageId: 'msg-1' }),
) {
  const send = vi.fn<(message: SendArg) => Promise<EmailSendResult>>(() => respond());
  return { mailer: { send } as unknown as SendEmail, send };
}

const digest = {
  to: 'pilot@example.com',
  date: 'Monday, March 8, 2026',
  sites: [
    {
      name: 'Chelan Butte',
      url: '/sites/chelan-butte--1234',
      status: 'go' as const,
      headline: 'Go: XC day 12:00-16:00',
      detail: 'Climbs about 2.4 m/s, lift to ~4,500 ft above launch',
      concern: 'Overdevelopment risk (moderate)',
    },
    {
      name: 'Mailbox Peak',
      status: 'flyable' as const,
      headline: 'Flyable: sled ride 10:00-17:00',
      detail: 'Lift tops out ~300 ft above launch',
    },
    {
      name: 'Tiger Mountain',
      status: 'no' as const,
      headline: 'Not flyable',
      detail: 'Rain (1.2 mm/h), 06:00-21:00',
    },
  ],
};

describe('sendMorningDigestEmail', () => {
  it('sends the digest from the SoarCast address with HTML and plain-text parts', async () => {
    const { mailer, send } = fakeMailer();

    const result = await sendMorningDigestEmail(mailer, digest);

    expect(result).toEqual({ messageId: 'msg-1' });
    expect(send).toHaveBeenCalledTimes(1);
    const message = send.mock.calls[0][0] as Exclude<SendArg, EmailMessage>;
    expect(message.from).toEqual({ name: 'SoarCast', email: 'soarcast@mckinleyaviation.com' });
    expect(message.from).toBe(EMAIL_FROM);
    expect(message.to).toBe('pilot@example.com');
    expect(message.subject).toBe('Go today at Chelan Butte · SoarCast');

    expect(message.html).toContain('<html');
    expect(message.html).toContain('Chelan Butte');
    expect(message.html).toContain('https://soarcast.mckinleyaviation.com/settings');
    expect(message.html).not.toContain('soarcast.app');

    expect(message.text).toBeTruthy();
    expect(message.text).not.toMatch(/<[a-z!/][^>]*>/i);
    expect(message.text).toContain('Chelan Butte');
    expect(message.text).toContain('Go: XC day 12:00-16:00');
    expect(message.text).toContain('Flyable: sled ride 10:00-17:00');
    expect(message.text).toContain('Not flyable');
    expect(message.text).toContain('Overdevelopment risk (moderate)');
    expect(message.text).toContain('Open-Meteo');
    expect(message.html).toContain(
      'https://soarcast.mckinleyaviation.com/sites/chelan-butte--1234',
    );
    expect(message.text).toContain('https://soarcast.mckinleyaviation.com');
  });

  it('rejects when the binding fails, so the caller can log and count the error', async () => {
    const failure = Object.assign(new Error('Sender domain not verified'), {
      code: 'E_SENDER_NOT_VERIFIED',
    });
    const { mailer } = fakeMailer(() => Promise.reject(failure));

    await expect(sendMorningDigestEmail(mailer, digest)).rejects.toBe(failure);
  });
});

describe('describeEmailError', () => {
  it('includes the Email Sending error code', () => {
    const error = Object.assign(new Error('Rate limit exceeded'), {
      code: 'E_RATE_LIMIT_EXCEEDED',
    });
    expect(describeEmailError(error)).toBe('E_RATE_LIMIT_EXCEEDED: Rate limit exceeded');
  });

  it('falls back to the message, or the value itself', () => {
    expect(describeEmailError(new Error('boom'))).toBe('boom');
    expect(describeEmailError('nope')).toBe('nope');
  });
});
