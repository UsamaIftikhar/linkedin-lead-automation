import { createHmac, timingSafeEqual } from 'node:crypto';

const MAX_SKEW_SEC = 60 * 5;

export function verifySlackSigningSecret(opts: {
  rawBody: Buffer;
  requestTimestamp: string | undefined;
  signingSecret: string;
  slackSignature: string | undefined;
}): boolean {
  if (!opts.slackSignature || !opts.requestTimestamp) {
    return false;
  }
  const ts = Number(opts.requestTimestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > MAX_SKEW_SEC) {
    return false;
  }
  const basestring = `v0:${opts.requestTimestamp}:${opts.rawBody.toString('utf8')}`;
  const hmac = createHmac('sha256', opts.signingSecret).update(basestring).digest('hex');
  const expected = `v0=${hmac}`;
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(opts.slackSignature, 'utf8');
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}
