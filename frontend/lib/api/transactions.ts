import { apiFetchPaginated, api } from '@/lib/api-client';
import type { TransactionDetail, TransactionListItem, TransactionStatus } from '@/lib/types';

export interface ListTransactionsParams {
  search?: string;
  partnerId?: string;
  transactionType?: string;
  status?: TransactionStatus;
  page?: number;
  pageSize?: number;
}

function buildQuery(params: ListTransactionsParams): string {
  const qs = new URLSearchParams();
  if (params.search) qs.set('search', params.search);
  if (params.partnerId) qs.set('partnerId', params.partnerId);
  if (params.transactionType) qs.set('transactionType', params.transactionType);
  if (params.status) qs.set('status', params.status);
  qs.set('page', String(params.page ?? 1));
  qs.set('pageSize', String(params.pageSize ?? 20));
  return qs.toString();
}

export async function listTransactions(params: ListTransactionsParams = {}) {
  const { items, meta } = await apiFetchPaginated<TransactionListItem>(
    `/api/v1/transactions?${buildQuery(params)}`,
  );
  return {
    items,
    page: Number(meta.page ?? 1),
    pageSize: Number(meta.pageSize ?? 20),
    total: Number(meta.total ?? items.length),
  };
}

export function getTransactionDetail(switchingTransactionId: string) {
  return api.get<TransactionDetail>(`/api/v1/transactions/by-reference/${switchingTransactionId}`);
}
