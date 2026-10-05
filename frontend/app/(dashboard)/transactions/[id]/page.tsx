'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { TransactionStatusBadge } from '@/components/transactions/transaction-status-badge';
import { getTransactionDetail } from '@/lib/api/transactions';
import { ApiError } from '@/lib/api-client';
import type { TransactionDetail } from '@/lib/types';

export default function TransactionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [tx, setTx] = useState<TransactionDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await getTransactionDetail(id);
      setTx(result);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to load transaction';
      toast.error(message);
      if (err instanceof ApiError && err.status === 404) {
        router.push('/transactions');
      }
    } finally {
      setIsLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    load();
  }, [load]);

  if (isLoading || !tx) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push('/transactions')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="font-mono text-xl font-semibold tracking-tight">
          {tx.switchingTransactionId}
        </h1>
        <TransactionStatusBadge status={tx.status} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Overview</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-muted-foreground">Partner</div>
            <div>
              {tx.partner.name} ({tx.partner.code})
            </div>
          </div>
          <div>
            <div className="text-muted-foreground">Business transaction ID</div>
            <div className="font-mono">{tx.businessTransactionId}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Type</div>
            <div>{tx.transactionType}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Correlation ID</div>
            <div className="font-mono text-xs">{tx.correlationId}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Routed to</div>
            <div>{tx.routingRule ? `${tx.routingRule.targetService} (${tx.routingRule.name})` : '-'}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Blockchain TX hash</div>
            <div className="font-mono text-xs">{tx.blockchainTxHash ?? '-'}</div>
          </div>
          {tx.errorCode && (
            <div className="col-span-2">
              <div className="text-muted-foreground">Error</div>
              <div className="text-destructive">
                {tx.errorCode}: {tx.errorMessage}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payload</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <div className="mb-1 text-sm text-muted-foreground">Original</div>
            <pre className="overflow-x-auto rounded bg-muted p-3 text-xs">
              {JSON.stringify(tx.payload, null, 2)}
            </pre>
          </div>
          <div>
            <div className="mb-1 text-sm text-muted-foreground">Transformed</div>
            <pre className="overflow-x-auto rounded bg-muted p-3 text-xs">
              {tx.transformedPayload ? JSON.stringify(tx.transformedPayload, null, 2) : '-'}
            </pre>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Status history</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-0">
            {tx.statusHistory.map((entry, i) => (
              <li key={entry.id}>
                <div className="flex items-start gap-3 py-2">
                  <div className="flex flex-col items-center">
                    <div className="h-2 w-2 rounded-full bg-primary" />
                    {i < tx.statusHistory.length - 1 && <div className="h-8 w-px bg-border" />}
                  </div>
                  <div className="flex-1 text-sm">
                    <div className="font-medium">
                      {entry.fromStatus ? `${entry.fromStatus} → ${entry.toStatus}` : entry.toStatus}
                    </div>
                    {entry.reason && (
                      <div className="text-xs text-muted-foreground">{entry.reason}</div>
                    )}
                    <div className="text-xs text-muted-foreground">
                      {new Date(entry.createdAt).toLocaleString()} · {entry.actor}
                    </div>
                  </div>
                </div>
                {i < tx.statusHistory.length - 1 && <Separator className="ml-[3px]" />}
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
