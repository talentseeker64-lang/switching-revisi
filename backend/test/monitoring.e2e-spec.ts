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
const VIEWER_EMAIL = `e2e-mon-viewer-${Date.now()}@switching.local`;
const VIEWER_PASSWORD = 'ViewerPass123!';
const PARTNER_CODE = `E2E_MON_PARTNER_${Date.now()}`;
const TXN_TYPE = `E2E_MON_TYPE_${Date.now()}`;

describe('Monitoring / Dashboard (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let viewerToken: string;
  let partnerId: string;
  let routingRuleId: string;

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
        fullName: 'E2E Monitoring Viewer',
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
      .send({ code: PARTNER_CODE, name: 'E2E Monitoring Partner', type: 'KOPERASI' });
    partnerId = partnerRes.body.data.id;

    await request(app.getHttpServer())
      .patch(`/api/v1/partners/${partnerId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'ACTIVE' });

    const credRes = await request(app.getHttpServer())
      .post(`/api/v1/partners/${partnerId}/credentials`)
      .set('Authorization', `Bearer ${adminToken}`);

    const ruleRes = await request(app.getHttpServer())
      .post('/api/v1/routing-rules')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'E2E monitoring rule', transactionType: TXN_TYPE, targetService: 'INTERNAL_LEDGER' });
    routingRuleId = ruleRes.body.data.id;

    // No endpointUrl configured -> completes SUCCESS synchronously.
    await request(app.getHttpServer())
      .post('/api/v1/transactions')
      .set({
        'x-api-key': credRes.body.data.apiKey,
        'x-api-secret': credRes.body.data.apiSecret,
        'idempotency-key': 'mon-1',
      })
      .send({ businessTransactionId: 'biz-mon-1', transactionType: TXN_TYPE, payload: {} });
  });

  afterAll(async () => {
    await prisma.transaction.deleteMany({ where: { partnerId } });
    await prisma.routingRule.deleteMany({ where: { id: routingRuleId } });
    await prisma.partner.deleteMany({ where: { id: partnerId } });
    await prisma.user.deleteMany({ where: { email: VIEWER_EMAIL } });
    await prisma.$disconnect();
    await app.close();
  });

  it('allows VIEWER role to read the dashboard summary', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/dashboard/summary')
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(res.status).toBe(200);
  });

  it('returns traffic, transaction, partner and endpoint metrics reflecting real activity', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/dashboard/summary?windowHours=1')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const data = res.body.data;

    expect(data.windowHours).toBe(1);
    expect(data.traffic.totalRequests).toBeGreaterThan(0);
    expect(typeof data.traffic.errorRate).toBe('number');

    expect(data.transactions.total).toBeGreaterThanOrEqual(1);
    expect(data.transactions.byStatus.SUCCESS).toBeGreaterThanOrEqual(1);
    // All 9 statuses present even at zero, per the fixed KPI set.
    expect(Object.keys(data.transactions.byStatus).sort()).toEqual(
      ['CANCELLED', 'FAILED', 'PENDING', 'PROCESSING', 'RECEIVED', 'ROUTING', 'SUCCESS', 'TIMEOUT', 'VALIDATING'].sort(),
    );

    const partnerEntry = data.partnerActivity.find((p: { partnerId: string }) => p.partnerId === partnerId);
    expect(partnerEntry).toBeTruthy();
    expect(partnerEntry.transactionCount).toBeGreaterThanOrEqual(1);

    expect(Array.isArray(data.endpointActivity)).toBe(true);
    expect(data.endpointActivity.length).toBeGreaterThan(0);
  });
});
