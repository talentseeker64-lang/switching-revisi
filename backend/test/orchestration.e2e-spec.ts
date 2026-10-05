import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JobStatus, PrismaClient, TransactionStatus } from '@prisma/client';
import { AppModule } from '../src/app.module.js';
import { JobsService } from '../src/modules/jobs/jobs.service.js';
import { stopScheduledJobs } from './test-utils.js';

const prisma = new PrismaClient();

const ADMIN_EMAIL = 'admin@switching.local';
const ADMIN_PASSWORD = 'ChangeMe123!';
const PARTNER_CODE = `E2E_ORCH_PARTNER_${Date.now()}`;
const GATEWAY_TYPE = `E2E_ORCH_GATEWAY_${Date.now()}`;
const BUSINESS_TYPE = `E2E_ORCH_BUSINESS_${Date.now()}`;
const WEBHOOK_KEY = 'dev-webhook-key';

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('Orchestration / Gateway integration (e2e)', () => {
  let app: INestApplication;
  let jobsService: JobsService;
  let adminToken: string;
  let partnerId: string;
  let apiKey: string;
  let apiSecret: string;
  let gatewayRuleId: string;
  let businessRuleId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    stopScheduledJobs(moduleRef);

    jobsService = moduleRef.get(JobsService);

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    adminToken = login.body.data.accessToken;

    const partnerRes = await request(app.getHttpServer())
      .post('/api/v1/partners')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: PARTNER_CODE, name: 'E2E Orchestration Partner', type: 'KOPERASI' });
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

    const gatewayRule = await request(app.getHttpServer())
      .post('/api/v1/routing-rules')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'E2E gateway rule', transactionType: GATEWAY_TYPE, targetService: 'BLOCKCHAIN_GATEWAY' });
    gatewayRuleId = gatewayRule.body.data.id;

    const businessRule = await request(app.getHttpServer())
      .post('/api/v1/routing-rules')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'E2E business rule (no endpoint)', transactionType: BUSINESS_TYPE, targetService: 'INTERNAL_LEDGER' });
    businessRuleId = businessRule.body.data.id;
  });

  afterAll(async () => {
    const txIds = (await prisma.transaction.findMany({ where: { partnerId }, select: { id: true } })).map(
      (t) => t.id,
    );
    await prisma.webhookEvent.deleteMany({ where: { transaction: { partnerId } } });
    for (const txId of txIds) {
      await prisma.jobQueue.deleteMany({ where: { payload: { path: ['transactionId'], equals: txId } } });
    }
    await prisma.transaction.deleteMany({ where: { partnerId } });
    await prisma.routingRule.deleteMany({ where: { id: { in: [gatewayRuleId, businessRuleId] } } });
    await prisma.partner.deleteMany({ where: { id: partnerId } });
    await prisma.$disconnect();
    await app.close();
  });

  function partnerAuthHeaders(idempotencyKey: string) {
    return { 'x-api-key': apiKey, 'x-api-secret': apiSecret, 'idempotency-key': idempotencyKey };
  }

  it('dispatches to the mock Blockchain Gateway and reaches PENDING synchronously', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/transactions')
      .set(partnerAuthHeaders('orch-1'))
      .send({ businessTransactionId: 'biz-orch-1', transactionType: GATEWAY_TYPE, payload: { amount: 1 } });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('PENDING');
    expect(res.body.data.gatewayRequestId).toBeTruthy();
  });

  it('the polling fallback job confirms a PENDING transaction once the mock gateway resolves it', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/transactions')
      .set(partnerAuthHeaders('orch-2'))
      .send({ businessTransactionId: 'biz-orch-2', transactionType: GATEWAY_TYPE, payload: { amount: 2 } });
    const switchingId = res.body.data.switchingTransactionId;
    expect(res.body.data.status).toBe('PENDING');

    await wait(400); // mock gateway confirms after 300ms

    await jobsService.pollPendingGatewayTransactions();

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/transactions/by-reference/${switchingId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(detail.body.data.status).toBe('SUCCESS');
    expect(detail.body.data.blockchainTxHash).toMatch(/^0xmock/);
  });

  it('completes immediately when no business endpoint is configured for a non-gateway target', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/transactions')
      .set(partnerAuthHeaders('orch-3'))
      .send({ businessTransactionId: 'biz-orch-3', transactionType: BUSINESS_TYPE, payload: {} });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('SUCCESS');
  });

  it('rejects a Gateway webhook without the shared secret', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/webhooks/gateway')
      .send({ gatewayRequestId: 'whatever', status: 'confirmed' });
    expect(res.status).toBe(401);
  });

  it('applies a Gateway webhook to resolve a PENDING transaction to SUCCESS', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/transactions')
      .set(partnerAuthHeaders('orch-4'))
      .send({ businessTransactionId: 'biz-orch-4', transactionType: GATEWAY_TYPE, payload: { amount: 4 } });
    const switchingId = createRes.body.data.switchingTransactionId;
    const gatewayRequestId = createRes.body.data.gatewayRequestId;
    expect(createRes.body.data.status).toBe('PENDING');

    const webhookRes = await request(app.getHttpServer())
      .post('/api/v1/webhooks/gateway')
      .set('x-api-key', WEBHOOK_KEY)
      .send({
        gatewayRequestId,
        status: 'confirmed',
        blockchainTxHash: '0xwebhookdelivered',
      });
    expect(webhookRes.status).toBe(200);
    expect(webhookRes.body.data.applied).toBe(true);

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/transactions/by-reference/${switchingId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(detail.body.data.status).toBe('SUCCESS');
    expect(detail.body.data.blockchainTxHash).toBe('0xwebhookdelivered');

    const events = await prisma.webhookEvent.findMany({ where: { transactionId: detail.body.data.id } });
    expect(events).toHaveLength(1);
    expect(events[0].status).toBe('PROCESSED');
  });

  it('acknowledges but does not apply a webhook for an unknown gatewayRequestId', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/webhooks/gateway')
      .set('x-api-key', WEBHOOK_KEY)
      .send({ gatewayRequestId: 'does-not-exist', status: 'confirmed' });
    expect(res.status).toBe(200);
    expect(res.body.data.applied).toBe(false);
  });

  it('the timeout scanner marks a stuck PROCESSING transaction as TIMEOUT and enqueues a retry', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/transactions')
      .set(partnerAuthHeaders('orch-5'))
      .send({ businessTransactionId: 'biz-orch-5', transactionType: GATEWAY_TYPE, payload: { amount: 5 } });
    const txId = createRes.body.data.id;

    // Force it back to PROCESSING and backdate updatedAt to simulate a stuck transaction,
    // without waiting for the real TRANSACTION_PENDING_TIMEOUT_MS (60s default).
    await prisma.transaction.update({
      where: { id: txId },
      data: { status: TransactionStatus.PROCESSING, updatedAt: new Date(Date.now() - 10 * 60 * 1000) },
    });

    await jobsService.scanStuckTransactions();

    const afterScan = await prisma.transaction.findUniqueOrThrow({ where: { id: txId } });
    expect(afterScan.status).toBe('TIMEOUT');

    const job = await prisma.jobQueue.findFirst({
      where: { type: 'RETRY_GATEWAY_CALL', payload: { path: ['transactionId'], equals: txId } },
    });
    expect(job).toBeTruthy();
    expect(job?.status).toBe(JobStatus.PENDING);
  });

  it('exhausts retries and fails the transaction once RETRY_MAX_ATTEMPTS is reached', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/transactions')
      .set(partnerAuthHeaders('orch-6'))
      .send({ businessTransactionId: 'biz-orch-6', transactionType: GATEWAY_TYPE, payload: { amount: 6 } });
    const txId = createRes.body.data.id;

    // Pre-populate 5 prior retry job rows (RETRY_MAX_ATTEMPTS=5 in .env) so the
    // next failure triggers exhaustion instead of another retry.
    await prisma.jobQueue.createMany({
      data: Array.from({ length: 5 }, (_, i) => ({
        type: 'RETRY_GATEWAY_CALL' as const,
        payload: { transactionId: txId },
        status: JobStatus.DONE,
        attempts: i + 1,
        nextRunAt: new Date(),
      })),
    });

    // Backdate it into PROCESSING so the scanner picks it up; scanning
    // transitions it to TIMEOUT and then calls scheduleRetryOrFail, which
    // sees the 5 prior attempts already at the cap and fails it outright.
    await prisma.transaction.update({
      where: { id: txId },
      data: { status: TransactionStatus.PROCESSING, updatedAt: new Date(Date.now() - 10 * 60 * 1000) },
    });
    await jobsService.scanStuckTransactions();

    const afterScan = await prisma.transaction.findUniqueOrThrow({ where: { id: txId } });
    expect(afterScan.status).toBe('FAILED');
    expect(afterScan.errorCode).toBe('RETRY_EXHAUSTED');
  });
});
