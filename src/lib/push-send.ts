import webpush from 'web-push';

// web-push's own sendNotification posts with node:https, which Workers don't
// implement ("https.request is not implemented"), so no push ever went out.
// Its VAPID signing and payload encryption do work: build the request with
// generateRequestDetails and send it with fetch. Call webpush.setVapidDetails
// first.

// A forecast alert is stale by the next run; don't let a push service hold
// it longer than that.
const PUSH_TTL_SECONDS = 12 * 60 * 60;

export class PushError extends Error {
  constructor(
    readonly statusCode: number,
    body: string,
  ) {
    super(`Push service answered ${statusCode}: ${body.slice(0, 200)}`);
  }
}

export async function sendPush(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: string,
): Promise<void> {
  const details = webpush.generateRequestDetails(subscription, payload, {
    TTL: PUSH_TTL_SECONDS,
  });
  const headers = new Headers(details.headers as Record<string, string>);
  headers.delete('Content-Length'); // fetch sets it from the body
  const response = await fetch(details.endpoint, {
    method: details.method,
    headers,
    body: new Uint8Array(details.body),
  });
  if (!response.ok) throw new PushError(response.status, await response.text());
}
