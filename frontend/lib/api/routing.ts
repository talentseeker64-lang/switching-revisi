import { api, apiFetchPaginated } from '@/lib/api-client';
import type { RoutingRule } from '@/lib/types';

export interface ListRoutingRulesParams {
  transactionType?: string;
  partnerId?: string;
  isActive?: boolean;
  page?: number;
  pageSize?: number;
}

function buildQuery(params: ListRoutingRulesParams): string {
  const qs = new URLSearchParams();
  if (params.transactionType) qs.set('transactionType', params.transactionType);
  if (params.partnerId) qs.set('partnerId', params.partnerId);
  if (params.isActive !== undefined) qs.set('isActive', String(params.isActive));
  qs.set('page', String(params.page ?? 1));
  qs.set('pageSize', String(params.pageSize ?? 20));
  return qs.toString();
}

export async function listRoutingRules(params: ListRoutingRulesParams = {}) {
  const { items, meta } = await apiFetchPaginated<RoutingRule>(
    `/api/v1/routing-rules?${buildQuery(params)}`,
  );
  return {
    items,
    page: Number(meta.page ?? 1),
    pageSize: Number(meta.pageSize ?? 20),
    total: Number(meta.total ?? items.length),
  };
}

export function getRoutingRule(id: string) {
  return api.get<RoutingRule>(`/api/v1/routing-rules/${id}`);
}

export interface RoutingRuleInput {
  name: string;
  transactionType: string;
  partnerId?: string;
  targetService: string;
  targetConfig?: { fieldMapping?: Record<string, string> };
  priority?: number;
  isActive?: boolean;
}

export function createRoutingRule(input: RoutingRuleInput) {
  return api.post<RoutingRule>('/api/v1/routing-rules', input);
}

export function updateRoutingRule(id: string, input: Partial<RoutingRuleInput>) {
  return api.put<RoutingRule>(`/api/v1/routing-rules/${id}`, input);
}

export function deleteRoutingRule(id: string) {
  return api.delete(`/api/v1/routing-rules/${id}`);
}
