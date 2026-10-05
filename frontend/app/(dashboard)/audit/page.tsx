'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { listAuditLogs } from '@/lib/api/monitoring';
import { ApiError } from '@/lib/api-client';
import type { AuditLogEntry } from '@/lib/types';

const PAGE_SIZE = 25;
const ACTOR_TYPES = ['USER', 'PARTNER', 'SYSTEM'] as const;

function statusVariant(status: number | null) {
  if (!status) return 'secondary' as const;
  if (status >= 500) return 'destructive' as const;
  if (status >= 400) return 'destructive' as const;
  return 'default' as const;
}

export default function AuditPage() {
  const [items, setItems] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [endpoint, setEndpoint] = useState('');
  const [actorType, setActorType] = useState<(typeof ACTOR_TYPES)[number] | 'ALL'>('ALL');
  const [isLoading, setIsLoading] = useState(true);
  const [selected, setSelected] = useState<AuditLogEntry | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await listAuditLogs({
        endpoint: endpoint || undefined,
        actorType: actorType === 'ALL' ? undefined : actorType,
        page,
        pageSize: PAGE_SIZE,
      });
      setItems(result.items);
      setTotal(result.total);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to load audit log';
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, [endpoint, actorType, page]);

  useEffect(() => {
    load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Audit Log</h1>

      <div className="flex flex-wrap gap-2">
        <Input
          placeholder="Filter by endpoint..."
          value={endpoint}
          onChange={(e) => {
            setPage(1);
            setEndpoint(e.target.value);
          }}
          className="max-w-xs"
        />
        <Select
          value={actorType}
          onValueChange={(v) => {
            setPage(1);
            setActorType(v as (typeof ACTOR_TYPES)[number] | 'ALL');
          }}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All actors" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All actors</SelectItem>
            {ACTOR_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Method</TableHead>
              <TableHead>Endpoint</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Duration</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={6}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  No audit entries found.
                </TableCell>
              </TableRow>
            ) : (
              items.map((entry) => (
                <TableRow
                  key={entry.id}
                  className="cursor-pointer"
                  onClick={() => setSelected(entry)}
                >
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(entry.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{entry.actorType}</Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{entry.method}</TableCell>
                  <TableCell className="font-mono text-xs">{entry.endpoint}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(entry.responseStatus)}>{entry.responseStatus ?? '-'}</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {entry.durationMs !== null ? `${entry.durationMs}ms` : '-'}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {total} entr{total === 1 ? 'y' : 'ies'}
        </span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span>
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      </div>

      <Sheet open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Audit entry</SheetTitle>
          </SheetHeader>
          {selected && (
            <div className="space-y-3 px-4 pb-4 text-sm">
              <div>
                <div className="text-muted-foreground">Actor</div>
                <div>
                  {selected.actorType}
                  {selected.actorId ? ` (${selected.actorId})` : ''}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">Action</div>
                <div className="font-mono text-xs">{selected.action}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Status / duration</div>
                <div>
                  {selected.responseStatus ?? '-'} &middot;{' '}
                  {selected.durationMs !== null ? `${selected.durationMs}ms` : '-'}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">IP address</div>
                <div className="font-mono text-xs">{selected.ipAddress ?? '-'}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Request ID</div>
                <div className="font-mono text-xs">{selected.requestId}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Correlation ID</div>
                <div className="font-mono text-xs">{selected.correlationId ?? '-'}</div>
              </div>
              {selected.errorMessage && (
                <div>
                  <div className="text-muted-foreground">Error</div>
                  <div className="text-destructive">{selected.errorMessage}</div>
                </div>
              )}
              <div>
                <div className="text-muted-foreground">Timestamp</div>
                <div>{new Date(selected.createdAt).toLocaleString()}</div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
