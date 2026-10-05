import { Badge } from '@/components/ui/badge';
import type { PartnerStatus } from '@/lib/types';

const VARIANT: Record<PartnerStatus, 'default' | 'secondary' | 'destructive'> = {
  ACTIVE: 'default',
  INACTIVE: 'secondary',
  SUSPENDED: 'destructive',
};

export function PartnerStatusBadge({ status }: { status: PartnerStatus }) {
  return <Badge variant={VARIANT[status]}>{status}</Badge>;
}
