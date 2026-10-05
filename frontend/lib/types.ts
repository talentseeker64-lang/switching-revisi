export type PartnerType =
  | 'KOPERASI'
  | 'RESI_GUDANG'
  | 'PETANI'
  | 'PETERNAK'
  | 'NELAYAN'
  | 'PEKEBUN'
  | 'TOKO_WARUNG'
  | 'LOGISTIK'
  | 'PENYEDIA_ALSINTAN'
  | 'PENGGILINGAN_PADI'
  | 'DISTRIBUTOR'
  | 'PAYMENT_GATEWAY'
  | 'ECOMMERCE_MARKETPLACE'
  | 'OTHER';

export type PartnerStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';

export interface Partner {
  id: string;
  code: string;
  name: string;
  type: PartnerType;
  status: PartnerStatus;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PartnerCredentialSummary {
  id: string;
  apiKeyPrefix: string;
  status: 'ACTIVE' | 'REVOKED';
  createdAt: string;
  revokedAt: string | null;
}

export interface PartnerDetail extends Partner {
  credentials: PartnerCredentialSummary[];
}

export interface IssuedCredential {
  id: string;
  apiKey: string;
  apiSecret: string;
  apiKeyPrefix: string;
  status: 'ACTIVE';
  createdAt: string;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface RoutingRule {
  id: string;
  name: string;
  transactionType: string;
  partnerId: string | null;
  partner: { id: string; code: string; name: string } | null;
  targetService: string;
  targetConfig: { fieldMapping?: Record<string, string> } | null;
  priority: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type TransactionStatus =
  | 'RECEIVED'
  | 'VALIDATING'
  | 'ROUTING'
  | 'PROCESSING'
  | 'PENDING'
  | 'SUCCESS'
  | 'FAILED'
  | 'TIMEOUT'
  | 'CANCELLED';

export interface TransactionStatusHistoryEntry {
  id: string;
  fromStatus: TransactionStatus | null;
  toStatus: TransactionStatus;
  reason: string | null;
  actor: string | null;
  createdAt: string;
}

export interface TransactionListItem {
  id: string;
  switchingTransactionId: string;
  businessTransactionId: string;
  partnerId: string;
  partner: { id: string; code: string; name: string };
  transactionType: string;
  status: TransactionStatus;
  correlationId: string;
  gatewayRequestId: string | null;
  blockchainTxHash: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TransactionDetail extends TransactionListItem {
  payload: Record<string, unknown>;
  transformedPayload: Record<string, unknown> | null;
  statusHistory: TransactionStatusHistoryEntry[];
  routingRule: { id: string; name: string; targetService: string } | null;
}

export interface DashboardSummary {
  windowHours: number;
  traffic: {
    totalRequests: number;
    errorRate: number;
    avgLatencyMs: number | null;
  };
  transactions: {
    total: number;
    byStatus: Record<TransactionStatus, number>;
  };
  partnerActivity: Array<{
    partnerId: string;
    partnerCode: string;
    partnerName: string;
    transactionCount: number;
  }>;
  endpointActivity: Array<{
    endpoint: string;
    method: string;
    requestCount: number;
  }>;
}

export interface AuditLogEntry {
  id: string;
  actorType: 'USER' | 'PARTNER' | 'SYSTEM';
  actorId: string | null;
  action: string;
  endpoint: string;
  method: string;
  requestId: string;
  correlationId: string | null;
  ipAddress: string | null;
  responseStatus: number | null;
  durationMs: number | null;
  errorMessage: string | null;
  createdAt: string;
}

export const PARTNER_TYPE_LABELS: Record<PartnerType, string> = {
  KOPERASI: 'Koperasi',
  RESI_GUDANG: 'Resi Gudang',
  PETANI: 'Petani',
  PETERNAK: 'Peternak',
  NELAYAN: 'Nelayan',
  PEKEBUN: 'Pekebun',
  TOKO_WARUNG: 'Toko/Warung',
  LOGISTIK: 'Logistik',
  PENYEDIA_ALSINTAN: 'Penyedia Alsintan',
  PENGGILINGAN_PADI: 'Penggilingan Padi',
  DISTRIBUTOR: 'Distributor',
  PAYMENT_GATEWAY: 'Payment Gateway',
  ECOMMERCE_MARKETPLACE: 'E-commerce/Marketplace',
  OTHER: 'Other',
};
