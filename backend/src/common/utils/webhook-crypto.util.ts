import { createHmac, timingSafeEqual } from 'node:crypto';
import { timingSafeStringEqual } from './timing-safe-equal.util.js';

export type HeaderConvention = 'gateway-prefixed' | 'switching-prefixed';

export const WEBHOOK_HMAC_ALGORITHM = 'sha256' as const;
export const DEFAULT_TOLERANCE_MS = 5 * 60 * 1000;

export interface WebhookVerifyResult {
  valid: boolean;
  reason?: string;
}

export function computeHmacSha256Hex(secret: string, payload: string): string {
  return createHmac(WEBHOOK_HMAC_ALGORITHM, secret).update(payload, 'utf8').digest('hex');
}

export function buildSignedPayload(timestamp: string, rawBody: string): string {
  return `${timestamp}.${rawBody}`;
}

export function verifyWebhookSignature(
  secret: string,
  timestamp: string,
  rawBody: string,
  signatureHex: string,
  toleranceMs: number = DEFAULT_TOLERANCE_MS,
): WebhookVerifyResult {
  if (!timestamp) {
    return { valid: false, reason: 'Missing X-Gateway-Timestamp header' };
  }
  if (!signatureHex) {
    return { valid: false, reason: 'Missing X-Gateway-Signature header' };
  }
  if (!rawBody && rawBody !== '') {
    return { valid: false, reason: 'Missing raw body (required for HMAC recomputation)' };
  }

  const tsNum = Number(timestamp);
  if (Number.isNaN(tsNum)) {
    return { valid: false, reason: 'Invalid X-Gateway-Timestamp (must be numeric UNIX epoch in ms)' };
  }

  const age = Math.abs(Date.now() - tsNum);
  if (age > toleranceMs) {
    return {
      valid: false,
      reason: `Timestamp outside tolerance window (age=${age}ms, tolerance=${toleranceMs}ms)`,
    };
  }

  const signedPayload = buildSignedPayload(timestamp, rawBody);
  const expected = computeHmacSha256Hex(secret, signedPayload);

  if (!timingSafeStringEqual(expected, signatureHex.toLowerCase())) {
    return { valid: false, reason: 'Signature mismatch' };
  }

  return { valid: true };
}

export interface SignedOutgoingHeaders {
  signature: string;
  timestamp: string;
  signedPayload: string;
  signatureHeaderName: string;
  timestampHeaderName: string;
}

export function signOutgoingWebhookRequest(
  secret: string,
  rawBody: string,
  convention: HeaderConvention = 'switching-prefixed',
): SignedOutgoingHeaders {
  const timestamp = String(Date.now());
  const signedPayload = buildSignedPayload(timestamp, rawBody);
  const signature = computeHmacSha256Hex(secret, signedPayload);
  return {
    signature,
    timestamp,
    signedPayload,
    signatureHeaderName:
      convention === 'gateway-prefixed' ? 'x-gateway-signature' : 'x-switching-signature',
    timestampHeaderName:
      convention === 'gateway-prefixed' ? 'x-gateway-timestamp' : 'x-switching-timestamp',
  };
}

export { timingSafeEqual };
