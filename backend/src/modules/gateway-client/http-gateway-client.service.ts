import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type {
  GatewayStatusResponse,
  GatewaySubmitRequest,
  GatewaySubmitResponse,
  IGatewayClient,
} from './gateway-client.interface.js';
import {
  signOutgoingWebhookRequest,
  type HeaderConvention,
} from '../../common/utils/webhook-crypto.util.js';

/**
 * Real Blockchain Gateway client - talks to the external Gateway per the
 * DRAFT contract in docs/api-contract.md §4. Used when
 * GATEWAY_USE_MOCK=false. Never used for local dev/tests in this project
 * (no live Gateway instance exists); exercised by MockGatewayClient instead.
 *
 * Point #3 hardening: when GATEWAY_OUTBOUND_SHARED_SECRET is configured,
 * every non-GET request carries an HMAC-SHA256 signature over
 * `${timestamp}.${rawBody}` so the Gateway can cryptographically verify
 * the call originated from this Switching instance and was not tampered
 * or replayed in transit.
 */
@Injectable()
export class HttpGatewayClient implements IGatewayClient {
  private readonly logger = new Logger(HttpGatewayClient.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly outboundSecret: string;
  private readonly headerConvention: HeaderConvention;

  constructor(private readonly config: ConfigService) {
    this.baseUrl = this.config.getOrThrow<string>('GATEWAY_BASE_URL');
    this.apiKey = this.config.getOrThrow<string>('GATEWAY_API_KEY');
    this.timeoutMs = this.config.get<number>('GATEWAY_TIMEOUT_MS', 10000);
    this.outboundSecret = this.config.get<string>('GATEWAY_OUTBOUND_SHARED_SECRET', '');
    this.headerConvention = (this.config.get<HeaderConvention>(
      'GATEWAY_OUTBOUND_HEADER_CONVENTION',
      'switching-prefixed' as HeaderConvention,
    ) ?? 'switching-prefixed') as HeaderConvention;
  }

  async submit(req: GatewaySubmitRequest): Promise<GatewaySubmitResponse> {
    const res = await this.request('POST', '/v1/transactions', req, req.idempotencyKey);
    return res as GatewaySubmitResponse;
  }

  async queryStatus(gatewayRequestId: string): Promise<GatewayStatusResponse> {
    const res = await this.request('GET', `/v1/transactions/${gatewayRequestId}`);
    return res as GatewayStatusResponse;
  }

  private async request(
    method: string,
    path: string,
    body?: unknown,
    idempotencyKey?: string,
  ): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const correlationId = randomUUID();

    try {
      const rawBody =
        method !== 'GET' && body !== undefined ? JSON.stringify(body) : '';

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Api-Key': this.apiKey,
        'X-Correlation-Id': correlationId,
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      };

      if (this.outboundSecret && rawBody.length > 0) {
        const signed = signOutgoingWebhookRequest(
          this.outboundSecret,
          rawBody,
          this.headerConvention,
        );
        headers[signed.signatureHeaderName] = signed.signature;
        headers[signed.timestampHeaderName] = signed.timestamp;
      }

      const res = await fetch(`${this.baseUrl}${path}`, {
        method,
        signal: controller.signal,
        headers,
        body: rawBody.length > 0 ? rawBody : undefined,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Gateway responded ${res.status}: ${text}`);
      }

      return await res.json();
    } catch (err) {
      this.logger.error(`Gateway ${method} ${path} failed: ${(err as Error).message}`);
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}
