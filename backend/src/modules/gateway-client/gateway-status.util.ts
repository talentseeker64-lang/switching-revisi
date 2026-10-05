import { TransactionStatus } from '@prisma/client';
import type { GatewayStatus } from './gateway-client.interface.js';

/** docs/transaction-status-model.md §"Blockchain Gateway status mapping" */
const MAPPING: Record<GatewayStatus, TransactionStatus> = {
  submitted: TransactionStatus.PROCESSING,
  pending: TransactionStatus.PENDING,
  confirmed: TransactionStatus.SUCCESS,
  failed: TransactionStatus.FAILED,
  timeout: TransactionStatus.TIMEOUT,
};

export function mapGatewayStatus(status: GatewayStatus): TransactionStatus {
  return MAPPING[status];
}
