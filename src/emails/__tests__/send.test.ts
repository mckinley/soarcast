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
      score: 82,
      label: 'Great' as const,
      wStar: 2.4,
      peakCeilingFt: 8500,
      bestWindow: '12:00-16:00',
      topConcern: 'OD Risk',
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
    expect(message.subject).toBe('Your SoarCast Morning Digest - Monday, March 8, 2026');

    expect(message.html).toContain('<html');
    expect(message.html).toContain('Chelan Butte');
    expect(message.html).toContain('https://soarcast.mckinleyaviation.com/settings');
    expect(message.html).not.toContain('soarcast.app');

    expect(message.text).toBeTruthy();
    expect(message.text).not.toMatch(/<[a-z!/][^>]*>/i);
    expect(message.text).toContain('Chelan Butte');
    expect(message.text).toContain('Great');
    expect(message.text).toContain('OD Risk');
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
