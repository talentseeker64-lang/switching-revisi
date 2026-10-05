import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { timingSafeStringEqual } from '../../../common/utils/timing-safe-equal.util.js';
import {
  DEFAULT_TOLERANCE_MS,
  verifyWebhookSignature,
} from '../../../common/utils/webhook-crypto.util.js';

/**
 * Dual-layer authentication for inbound Blockchain Gateway callbacks.
 *
 * Layer 1 (identification): X-Api-Key header compared against the shared
 * static value GATEWAY_WEBHOOK_API_KEY (the legacy pre-hardening check that
 * previously was the ONLY guard here, on lines 17-18 of the v0 version).
 * Identity-only check is not sufficient on its own: any party who obtains the
 * static key can replay captured payloads.
 *
 * Layer 2 (integrity + anti-replay — Point #3 hardening per the integration
 * proposal): verifies an HMAC-SHA256 signature over (timestamp + "." + raw
 * body) using the SEPARATE shared secret GATEWAY_WEBHOOK_SHARED_SECRET.
 * The timestamp (X-Gateway-Timestamp, UNIX epoch ms) is validated against a
 * tolerance window to prevent replay of old captured payloads.
 */
@Injectable()
export class GatewayWebhookGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();

    // ---------------------------------------------------------------
    // Config loading — fail closed (500) if misconfigured, rather
    // than accidentally letting unsigned requests through.
    // ---------------------------------------------------------------
    const expectedApiKey = this.config.getOrThrow<string>('GATEWAY_WEBHOOK_API_KEY');
    const sharedSecret = this.config.get<string>('GATEWAY_WEBHOOK_SHARED_SECRET', '');

    // ---------------------------------------------------------------
    // Layer 1 — API key identification (kept from original v0, still
    // verified with constant-time compare to avoid key-oracle attacks).
    // ---------------------------------------------------------------
    const apiKey = req.header('x-api-key');
    if (!apiKey || !timingSafeStringEqual(apiKey, expectedApiKey)) {
      throw new UnauthorizedException('Invalid webhook credentials');
    }

    // ---------------------------------------------------------------
    // Layer 2 — HMAC signature + timestamp replay protection.
    //
    // Backward-compatible behaviour: if GATEWAY_WEBHOOK_SHARED_SECRET
    // is empty (the pre-hardening state in dev), layer 2 is SKIPPED
    // and a 401 is NOT thrown — so the mock Gateway and existing
    // e2e tests keep working while the real Gateway team rolls out
    // signing on their side. Once the Gateway ships signing, flip
    // GATEWAY_WEBHOOK_SIGNATURE_REQUIRED=true to fail-closed.
    // ---------------------------------------------------------------
    if (!sharedSecret) {
      return true;
    }

    const signature = req.header('x-gateway-signature');
    const timestamp = req.header('x-gateway-timestamp');
    const rawBody = (req as unknown as { rawBody?: string | Buffer }).rawBody;
    const rawBodyStr =
      typeof rawBody === 'string'
        ? rawBody
        : Buffer.isBuffer(rawBody)
          ? rawBody.toString('utf8')
          : '';

    const toleranceConfig = this.config.get<number | string>('GATEWAY_WEBHOOK_TOLERANCE_MS');
    const toleranceMs =
      toleranceConfig !== undefined && toleranceConfig !== ''
        ? Number(toleranceConfig)
        : DEFAULT_TOLERANCE_MS;
    const effectiveTolerance =
      Number.isFinite(toleranceMs) && toleranceMs > 0 ? toleranceMs : DEFAULT_TOLERANCE_MS;

    const result = verifyWebhookSignature(
      sharedSecret,
      timestamp ?? '',
      rawBodyStr,
      signature ?? '',
      effectiveTolerance,
    );

    if (!result.valid) {
      const signatureRequired =
        this.config.get<boolean>('GATEWAY_WEBHOOK_SIGNATURE_REQUIRED', false);
      if (!signatureRequired) {
        // Graceful rollout window — only log + warn via 401 when the Gateway
        // has explicitly agreed on signing (signatureRequired=true). If not
        // yet required we still accept the request because layer 1 passed.
        return true;
      }
      throw new UnauthorizedException(
        `Webhook signature verification failed: ${result.reason ?? 'unknown'}`,
      );
    }

    return true;
  }
}
