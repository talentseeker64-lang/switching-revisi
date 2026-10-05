import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PrismaClient, UserRole, UserStatus } from '@prisma/client';
import { AppModule } from '../src/app.module.js';
import { hashSecret } from '../src/common/utils/password.util.js';
import { stopScheduledJobs } from './test-utils.js';

const prisma = new PrismaClient();

const ADMIN_EMAIL = 'admin@switching.local';
const ADMIN_PASSWORD = 'ChangeMe123!';
const VIEWER_EMAIL = `e2e-recon-viewer-${Date.now()}@switching.local`;
const VIEWER_PASSWORD = 'ViewerPass123!';
const PARTNER_CODE = `E2E_RECON_PARTNER_${Date.now()}`;
const GATEWAY_TYPE = `E2E_RECON_GATEWAY_${Date.now()}`;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('Reconciliation (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let viewerToken: string;
  let partnerId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    stopScheduledJobs(moduleRef);

    await prisma.user.upsert({
      where: { email: VIEWER_EMAIL },
      create: {
        email: VIEWER_EMAIL,
        passwordHash: await hashSecret(VIEWER_PASSWORD),
        fullName: 'E2E Reconciliation Viewer',
        role: UserRole.VIEWER,
        status: UserStatus.ACTIVE,
      },
      update: {},
    });

    adminToken = (
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
    ).body.data.accessToken;

    viewerToken = (
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: VIEWER_EMAIL, password: VIEWER_PASSWORD })
    ).body.data.accessToken;

    const partnerRes = await request(app.getHttpServer())
      .post('/api/v1/partners')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: PARTNER_CODE, name: 'E2E Reconciliation Partner', type: 'KOPERASI' });
    partnerId = partnerRes.body.data.id;

    await request(app.getHttpServer())
      .patch(`/api/v1/partners/${partnerId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'ACTIVE' });

    const credRes = await request(app.getHttpServer())
      .post(`/api/v1/partners/${partnerId}/credentials`)
      .set('Authorization', `Bearer ${adminToken}`);

    await request(app.getHttpServer())
      .post('/api/v1/routing-rules')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'E2E reconciliation rule', transactionType: GATEWAY_TYPE, targetService: 'BLOCKCHAIN_GATEWAY' });

    const txn = await request(app.getHttpServer())
      .post('/api/v1/transactions')
      .set({
        'x-api-key': credRes.body.data.apiKey,
        'x-api-secret': credRes.body.data.apiSecret,
        'idempotency-key': 'recon-1',
      })
      .send({ businessTransactionId: 'biz-recon-1', transactionType: GATEWAY_TYPE, payload: {} });
    expect(txn.body.data.status).toBe('PENDING');

    // Let the mock gateway's internal 300ms confirm window pass WITHOUT the
    // normal polling job running (crons are stopped) - the transaction stays
    // PENDING on our side while the gateway now reports "confirmed",
    // deliberately producing a reconciliation mismatch to verify detection.
    await wait(400);
  });

  afterAll(async () => {
    const txIds = (await prisma.transaction.findMany({ where: { partnerId }, select: { id: true } })).map(
      (t) => t.id,
    );
    for (const id of txIds) {
      await prisma.reconciliationRecord.deleteMany({ where: { transactionId: id } });
    }
    await prisma.transaction.deleteMany({ where: { partnerId } });
    await prisma.routingRule.deleteMany({ where: { transactionType: GATEWAY_TYPE } });
    await prisma.partner.deleteMany({ where: { id: partnerId } });
    await prisma.user.deleteMany({ where: { email: VIEWER_EMAIL } });
    await prisma.$disconnect();
    await app.close();
  });

  it('rejects VIEWER role from running or listing reconciliation', async () => {
    const runRes = await request(app.getHttpServer())
      .post('/api/v1/reconciliation/run')
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({});
    expect(runRes.status).toBe(403);

    const listRes = await request(app.getHttpServer())
      .get('/api/v1/reconciliation')
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(listRes.status).toBe(403);
  });

  it('detects and records a mismatch between Switching and Gateway status', async () => {
    const runRes = await request(app.getHttpServer())
      .post('/api/v1/reconciliation/run')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ windowHours: 1 });

    expect(runRes.status).toBe(200);
    expect(runRes.body.data.checked).toBeGreaterThanOrEqual(1);
    expect(runRes.body.data.mismatched).toBeGreaterThanOrEqual(1);

    const listRes = await request(app.getHttpServer())
      .get('/api/v1/reconciliation?matched=false')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(listRes.status).toBe(200);
    const mismatch = listRes.body.data.find(
      (r: { transaction: { partnerId: string } }) => r.transaction.partnerId === partnerId,
    );
    expect(mismatch).toBeTruthy();
    expect(mismatch.switchingStatus).toBe('PENDING');
    expect(mismatch.gatewayStatus).toBe('confirmed');
    expect(mismatch.matched).toBe(false);
  });
});
