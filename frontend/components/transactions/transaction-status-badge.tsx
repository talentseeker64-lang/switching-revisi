import { Badge } from '@/components/ui/badge';
import type { TransactionStatus } from '@/lib/types';

const VARIANT: Record<TransactionStatus, 'default' | 'secondary' | 'destructive'> = {
  RECEIVED: 'secondary',
  VALIDATING: 'secondary',
  ROUTING: 'secondary',
  PROCESSING: 'secondary',
  PENDING: 'secondary',
  SUCCESS: 'default',
  FAILED: 'destructive',
  TIMEOUT: 'destructive',
  CANCELLED: 'destructive',
};

export function TransactionStatusBadge({ status }: { status: TransactionStatus }) {
  return <Badge variant={VARIANT[status]}>{status}</Badge>;
}
