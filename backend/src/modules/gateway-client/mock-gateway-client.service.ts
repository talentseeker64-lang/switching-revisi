import { Injectable, Logger } from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';
import type {
  GatewayStatus,
  GatewayStatusResponse,
  GatewaySubmitRequest,
  GatewaySubmitResponse,
  IGatewayClient,
} from './gateway-client.interface.js';

interface SimulatedRequest {
  confirmAt: number;
  blockchainTxHash: string;
}

/**
 * Stands in for the real Blockchain Gateway (GATEWAY_USE_MOCK=true, the
 * default) so the rest of the system can be built, run and tested without
 * the real Gateway - which is developed separately and doesn't exist yet
 * for this project. Simulates: accept immediately ("submitted"), then
 * "confirm" after a short fixed delay - `queryStatus` reflects that
 * timeline, which is what drives the Stage 3 polling job
 * (`JobsService`) during local dev/e2e tests.
 */
@Injectable()
export class MockGatewayClient implements IGatewayClient {
  private readonly logger = new Logger(MockGatewayClient.name);
  private readonly requests = new Map<string, SimulatedRequest>();
  private readonly confirmDelayMs = 300;

  async submit(req: GatewaySubmitRequest): Promise<GatewaySubmitResponse> {
    const gatewayRequestId = randomUUID();
    this.requests.set(gatewayRequestId, {
      confirmAt: Date.now() + this.confirmDelayMs,
      blockchainTxHash: `0xmock${randomBytes(16).toString('hex')}`,
    });
    this.logger.debug(`[mock gateway] submitted ${gatewayRequestId} for ${req.transactionType}`);
    return { gatewayRequestId, status: 'submitted' };
  }

  async queryStatus(gatewayRequestId: string): Promise<GatewayStatusResponse> {
    const sim = this.requests.get(gatewayRequestId);
    if (!sim) {
      return { gatewayRequestId, status: 'failed', blockchainTxHash: null, errorMessage: 'Unknown gatewayRequestId (mock)' };
    }

    const status: GatewayStatus = Date.now() >= sim.confirmAt ? 'confirmed' : 'pending';
    return {
      gatewayRequestId,
      status,
      blockchainTxHash: status === 'confirmed' ? sim.blockchainTxHash : null,
      errorMessage: null,
    };
  }
}
