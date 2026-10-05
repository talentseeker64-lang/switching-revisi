import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module.js';
import { stopScheduledJobs } from './test-utils.js';

const prisma = new PrismaClient();

const ADMIN_EMAIL = 'admin@switching.local';
const ADMIN_PASSWORD = 'ChangeMe123!';
const PARTNER_CODE = `E2E_TXN_PARTNER_${Date.now()}`;
const ROUTED_TYPE = `E2E_TXN_ROUTED_${Date.now()}`;
const UNROUTED_TYPE = `E2E_TXN_UNROUTED_${Date.now()}`;

describe('Transactions (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let partnerId: string;
  let apiKey: string;
  let apiSecret: string;
  let routingRuleId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    stopScheduledJobs(moduleRef);

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    adminToken = login.body.data.accessToken;

    const partnerRes = await request(app.getHttpServer())
      .post('/api/v1/partners')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: PARTNER_CODE, name: 'E2E Txn Partner', type: 'KOPERASI' });
    partnerId = partnerRes.body.data.id;

    await request(app.getHttpServer())
      .patch(`/api/v1/partners/${partnerId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'ACTIVE' });

    const credRes = await request(app.getHttpServer())
      .post(`/api/v1/partners/${partnerId}/credentials`)
      .set('Authorization', `Bearer ${adminToken}`);
    apiKey = credRes.body.data.apiKey;
    apiSecret = credRes.body.data.apiSecret;

    const ruleRes = await request(app.getHttpServer())
      .post('/api/v1/routing-rules')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'E2E txn routing rule',
        transactionType: ROUTED_TYPE,
        targetService: 'BLOCKCHAIN_GATEWAY',
        targetConfig: { fieldMapping: { amount: 'total_amount' } },
        priority: 10,
      });
    routingRuleId = ruleRes.body.data.id;
  });

  afterAll(async () => {
    await prisma.transaction.deleteMany({ where: { partnerId } });
    await prisma.routingRule.deleteMany({ where: { id: routingRuleId } });
    await prisma.partner.deleteMany({ where: { id: partnerId } });
    await prisma.$disconnect();
    await app.close();
  });

  function partnerAuthHeaders(idempotencyKey: string) {
    return {
      'x-api-key': apiKey,
      'x-api-secret': apiSecret,
      'idempotency-key': idempotencyKey,
    };
  }

  it('rejects submission without API credentials', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/transactions')
      .send({ businessTransactionId: 'biz-1', transactionType: ROUTED_TYPE, payload: {} });
    expect(res.status).toBe(401);
  });

  it('rejects submission with wrong API secret', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/transactions')
      .set('x-api-key', apiKey)
      .set('x-api-secret', 'wrong-secret')
      .set('idempotency-key', 'k-wrong')
      .send({ businessTransactionId: 'biz-1', transactionType: ROUTED_TYPE, payload: {} });
    expect(res.status).toBe(401);
  });

  it('rejects submission without Idempotency-Key header', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/transactions')
      .set('x-api-key', apiKey)
      .set('x-api-secret', apiSecret)
      .send({ businessTransactionId: 'biz-1', transactionType: ROUTED_TYPE, payload: {} });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('creates, routes and dispatches a transaction, applying field mapping', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/transactions')
      .set(partnerAuthHeaders('idem-1'))
      .send({
        businessTransactionId: 'biz-1',
        transactionType: ROUTED_TYPE,
        payload: { amount: 1000, note: 'test' },
      });

    expect(res.status).toBe(201);
    // Orchestration (Stage 3) synchronously dispatches to the mock
    // Blockchain Gateway, which accepts immediately -> PENDING.
    expect(res.body.data.status).toBe('PENDING');
    expect(res.body.data.routingRuleId).toBe(routingRuleId);
    expect(res.body.data.gatewayRequestId).toBeTruthy();
    expect(res.body.data.transformedPayload).toEqual({ total_amount: 1000, note: 'test' });
  });

  it('replays the same transaction for a repeated idempotency key', async () => {
    const first = await request(app.getHttpServer())
      .post('/api/v1/transactions')
      .set(partnerAuthHeaders('idem-1'))
      .send({
        businessTransactionId: 'biz-1-retry',
        transactionType: ROUTED_TYPE,
        payload: { amount: 9999 },
      });

    expect(first.status).toBe(201);
    expect(first.body.data.businessTransactionId).toBe('biz-1');
    expect(first.body.data.payload).toEqual({ amount: 1000, note: 'test' });
  });

  it('fails routing when no active rule matches the transaction type', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/transactions')
      .set(partnerAuthHeaders('idem-2'))
      .send({ businessTransactionId: 'biz-2', transactionType: UNROUTED_TYPE, payload: {} });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('FAILED');
    expect(res.body.data.errorCode).toBe('ROUTING_RULE_NOT_FOUND');
  });

  it('lets the partner inquire their own transaction by id', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/transactions')
      .set(partnerAuthHeaders('idem-3'))
      .send({ businessTransactionId: 'biz-3', transactionType: ROUTED_TYPE, payload: { amount: 5 } });
    const switchingId = createRes.body.data.switchingTransactionId;

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/transactions/${switchingId}`)
      .set('x-api-key', apiKey)
      .set('x-api-secret', apiSecret);
    expect(detail.status).toBe(200);
    // RECEIVED (initial, no history row) -> VALIDATING -> ROUTING -> PROCESSING -> PENDING
    expect(detail.body.data.statusHistory.length).toBeGreaterThanOrEqual(4);

    const status = await request(app.getHttpServer())
      .get(`/api/v1/transactions/${switchingId}/status`)
      .set('x-api-key', apiKey)
      .set('x-api-secret', apiSecret);
    expect(status.status).toBe(200);
    expect(status.body.data.status).toBe('PENDING');
  });

  it('returns 404 for an unknown transaction id', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/transactions/TRX-DOES-NOT-EXIST')
      .set('x-api-key', apiKey)
      .set('x-api-secret', apiSecret);
    expect(res.status).toBe(404);
  });

  it('lists transactions on the dashboard across partners', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/transactions?partnerId=${partnerId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(3);
    expect(res.body.meta.total).toBeGreaterThanOrEqual(3);
  });

  it('gets dashboard transaction detail by reference with routing rule info', async () => {
    // Create fresh rather than relying on an earlier test's transaction
    // still being PENDING - the app's real background jobs (JobsService) are
    // running during these e2e tests too and may have already resolved it.
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/transactions')
      .set(partnerAuthHeaders('idem-4'))
      .send({ businessTransactionId: 'biz-4', transactionType: ROUTED_TYPE, payload: { amount: 7 } });
    const switchingId = createRes.body.data.switchingTransactionId;

    const res = await request(app.getHttpServer())
      .get(`/api/v1/transactions/by-reference/${switchingId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.routingRule.targetService).toBe('BLOCKCHAIN_GATEWAY');
    expect(res.body.data.partner.code).toBe(PARTNER_CODE);
  });
});
