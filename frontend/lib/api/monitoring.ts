import { api, apiFetchPaginated } from '@/lib/api-client';
import type { AuditLogEntry, DashboardSummary } from '@/lib/types';

export function getDashboardSummary(windowHours: number) {
  return api.get<DashboardSummary>(`/api/v1/dashboard/summary?windowHours=${windowHours}`);
}

export interface ListAuditLogsParams {
  actorType?: 'USER' | 'PARTNER' | 'SYSTEM';
  endpoint?: string;
  page?: number;
  pageSize?: number;
}

export async function listAuditLogs(params: ListAuditLogsParams = {}) {
  const qs = new URLSearchParams();
  if (params.actorType) qs.set('actorType', params.actorType);
  if (params.endpoint) qs.set('endpoint', params.endpoint);
  qs.set('page', String(params.page ?? 1));
  qs.set('pageSize', String(params.pageSize ?? 20));

  const { items, meta } = await apiFetchPaginated<AuditLogEntry>(`/api/v1/audit-logs?${qs.toString()}`);
  return {
    items,
    page: Number(meta.page ?? 1),
    pageSize: Number(meta.pageSize ?? 20),
    total: Number(meta.total ?? items.length),
  };
}
