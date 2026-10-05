import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { TransactionStatus } from '@/lib/types';

const STATUS_ORDER: TransactionStatus[] = [
  'SUCCESS',
  'PENDING',
  'PROCESSING',
  'ROUTING',
  'VALIDATING',
  'RECEIVED',
  'TIMEOUT',
  'FAILED',
  'CANCELLED',
];

// Mirrors TransactionStatusBadge's three semantic buckets (good / in-progress
// / bad) rather than inventing a separate multi-hue categorical palette for
// what the theme otherwise treats as a monochrome + single-accent design.
const BAR_CLASS: Record<TransactionStatus, string> = {
  SUCCESS: 'bg-primary',
  PENDING: 'bg-muted-foreground',
  PROCESSING: 'bg-muted-foreground',
  ROUTING: 'bg-muted-foreground',
  VALIDATING: 'bg-muted-foreground',
  RECEIVED: 'bg-muted-foreground',
  TIMEOUT: 'bg-destructive',
  FAILED: 'bg-destructive',
  CANCELLED: 'bg-destructive',
};

export function StatusBreakdown({ byStatus }: { byStatus: Record<TransactionStatus, number> }) {
  const max = Math.max(1, ...Object.values(byStatus));
  const total = Object.values(byStatus).reduce((a, b) => a + b, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Transactions by status</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {total === 0 ? (
          <p className="text-sm text-muted-foreground">No transactions in this window.</p>
        ) : (
          STATUS_ORDER.map((status) => {
            const count = byStatus[status] ?? 0;
            return (
              <div key={status} className="flex items-center gap-3">
                <span className="w-24 shrink-0 text-xs font-medium text-muted-foreground">{status}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full ${BAR_CLASS[status]}`}
                    style={{ width: `${(count / max) * 100}%` }}
                  />
                </div>
                <span className="w-10 shrink-0 text-right text-xs tabular-nums">{count}</span>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
