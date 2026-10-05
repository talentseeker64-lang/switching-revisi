import { randomBytes } from 'node:crypto';

/** Human-referenceable transaction id, distinct from the internal UUID pk. */
export function generateSwitchingTransactionId(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = randomBytes(4).toString('hex').toUpperCase();
  return `TRX-${timestamp}-${random}`;
}
