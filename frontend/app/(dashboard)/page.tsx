'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { StatTile } from '@/components/dashboard/stat-tile';
import { StatusBreakdown } from '@/components/dashboard/status-breakdown';
import { getDashboardSummary } from '@/lib/api/monitoring';
import { ApiError } from '@/lib/api-client';
import type { DashboardSummary } from '@/lib/types';

const WINDOW_OPTIONS = [
  { value: '1', label: 'Last hour' },
  { value: '24', label: 'Last 24 hours' },
  { value: '168', label: 'Last 7 days' },
];

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

export default function DashboardHomePage() {
  const [windowHours, setWindowHours] = useState('24');
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await getDashboardSummary(Number(windowHours));
      setSummary(result);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to load dashboard';
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, [windowHours]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <Select value={windowHours} onValueChange={(v) => v && setWindowHours(v)}>
          <SelectTrigger className="w-44">
            <SelectValue>
              {(value: string) => WINDOW_OPTIONS.find((opt) => opt.value === value)?.label ?? value}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {WINDOW_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading || !summary ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatTile label="API requests" value={summary.traffic.totalRequests.toLocaleString()} />
            <StatTile
              label="Error rate"
              value={formatPercent(summary.traffic.errorRate)}
              tone={summary.traffic.errorRate > 0.05 ? 'destructive' : 'default'}
            />
            <StatTile
              label="Avg latency"
              value={summary.traffic.avgLatencyMs !== null ? `${Math.round(summary.traffic.avgLatencyMs)}ms` : '-'}
            />
            <StatTile label="Transactions" value={summary.transactions.total.toLocaleString()} />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <StatusBreakdown byStatus={summary.transactions.byStatus} />

            <Card>
              <CardHeader>
                <CardTitle>Partner activity</CardTitle>
              </CardHeader>
              <CardContent>
                {summary.partnerActivity.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No transactions in this window.</p>
                ) : (
                  <ul className="space-y-2">
                    {summary.partnerActivity.map((p) => (
                      <li key={p.partnerId} className="flex items-center justify-between text-sm">
                        <span>
                          {p.partnerName} <span className="text-muted-foreground">({p.partnerCode})</span>
                        </span>
                        <span className="font-medium tabular-nums">{p.transactionCount}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Endpoint activity</CardTitle>
            </CardHeader>
            <CardContent>
              {summary.endpointActivity.length === 0 ? (
                <p className="text-sm text-muted-foreground">No requests in this window.</p>
              ) : (
                <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {summary.endpointActivity.map((e) => (
                    <li key={`${e.method}-${e.endpoint}`} className="flex items-center justify-between text-sm">
                      <span className="font-mono text-xs">
                        <span className="text-muted-foreground">{e.method}</span> {e.endpoint}
                      </span>
                      <span className="font-medium tabular-nums">{e.requestCount}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
