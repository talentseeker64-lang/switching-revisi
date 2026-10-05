/**
 * Switching's contract against the external Blockchain Gateway (separate
 * team, separate repo). See docs/api-contract.md §4 - this interface
 * mirrors that DRAFT contract so the real HTTP client and the dev mock are
 * interchangeable without the rest of the codebase knowing which is in use.
 */

export type GatewayStatus = 'submitted' | 'pending' | 'confirmed' | 'failed' | 'timeout';

export interface GatewaySubmitRequest {
  correlationId: string;
  idempotencyKey: string;
  transactionType: string;
  payload: Record<string, unknown>;
}

export interface GatewaySubmitResponse {
  gatewayRequestId: string;
  status: GatewayStatus;
}

export interface GatewayStatusResponse {
  gatewayRequestId: string;
  status: GatewayStatus;
  blockchainTxHash: string | null;
  errorMessage: string | null;
}

export const GATEWAY_CLIENT = Symbol('GATEWAY_CLIENT');

export interface IGatewayClient {
  submit(req: GatewaySubmitRequest): Promise<GatewaySubmitResponse>;
  queryStatus(gatewayRequestId: string): Promise<GatewayStatusResponse>;
}
