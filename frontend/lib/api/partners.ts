import { api, apiFetchPaginated } from '@/lib/api-client';
import type {
  IssuedCredential,
  Partner,
  PartnerDetail,
  PartnerStatus,
  PartnerType,
} from '@/lib/types';

export interface ListPartnersParams {
  search?: string;
  type?: PartnerType;
  status?: PartnerStatus;
  page?: number;
  pageSize?: number;
}

function buildQuery(params: ListPartnersParams): string {
  const qs = new URLSearchParams();
  if (params.search) qs.set('search', params.search);
  if (params.type) qs.set('type', params.type);
  if (params.status) qs.set('status', params.status);
  qs.set('page', String(params.page ?? 1));
  qs.set('pageSize', String(params.pageSize ?? 20));
  return qs.toString();
}

export async function listPartners(params: ListPartnersParams = {}) {
  const { items, meta } = await apiFetchPaginated<Partner>(
    `/api/v1/partners?${buildQuery(params)}`,
  );
  return {
    items,
    page: Number(meta.page ?? 1),
    pageSize: Number(meta.pageSize ?? 20),
    total: Number(meta.total ?? items.length),
  };
}

export function getPartner(id: string) {
  return api.get<PartnerDetail>(`/api/v1/partners/${id}`);
}

export interface CreatePartnerInput {
  code: string;
  name: string;
  type: PartnerType;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
}

export function createPartner(input: CreatePartnerInput) {
  return api.post<Partner>('/api/v1/partners', input);
}

export type UpdatePartnerInput = Partial<Omit<CreatePartnerInput, 'code'>>;

export function updatePartner(id: string, input: UpdatePartnerInput) {
  return api.put<Partner>(`/api/v1/partners/${id}`, input);
}

export function updatePartnerStatus(id: string, status: PartnerStatus) {
  return api.patch<Partner>(`/api/v1/partners/${id}/status`, { status });
}

export function issueCredential(partnerId: string) {
  return api.post<IssuedCredential>(`/api/v1/partners/${partnerId}/credentials`);
}

export function revokeCredential(partnerId: string, credentialId: string) {
  return api.patch(`/api/v1/partners/${partnerId}/credentials/${credentialId}/revoke`);
}
