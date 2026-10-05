import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module.js';
import { stopScheduledJobs } from './test-utils.js';

const prisma = new PrismaClient();

const ADMIN_EMAIL = 'admin@switching.local';
const ADMIN_PASSWORD = 'ChangeMe123!';
const RULE_TYPE = `E2E_ROUTING_TYPE_${Date.now()}`;

describe('Routing Rules (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let createdRuleId: string;

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
  });

  afterAll(async () => {
    await prisma.routingRule.deleteMany({ where: { transactionType: RULE_TYPE } });
    await prisma.$disconnect();
    await app.close();
  });

  it('creates a routing rule', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/routing-rules')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'E2E rule',
        transactionType: RULE_TYPE,
        targetService: 'BLOCKCHAIN_GATEWAY',
        priority: 50,
      });
    expect(res.status).toBe(201);
    expect(res.body.data.isActive).toBe(true);
    createdRuleId = res.body.data.id;
  });

  it('lists rules filtered by transactionType', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/routing-rules?transactionType=${RULE_TYPE}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('updates a rule', async () => {
    const res = await request(app.getHttpServer())
      .put(`/api/v1/routing-rules/${createdRuleId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ priority: 10, isActive: false });
    expect(res.status).toBe(200);
    expect(res.body.data.priority).toBe(10);
    expect(res.body.data.isActive).toBe(false);
  });

  it('filters by isActive=false (regression: "false" must not coerce to true)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/routing-rules?transactionType=${RULE_TYPE}&isActive=false`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe(createdRuleId);

    const activeOnly = await request(app.getHttpServer())
      .get(`/api/v1/routing-rules?transactionType=${RULE_TYPE}&isActive=true`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(activeOnly.body.data).toHaveLength(0);
  });

  it('returns 404 for an unknown rule', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/routing-rules/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });

  it('deletes a rule', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/api/v1/routing-rules/${createdRuleId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.deleted).toBe(true);

    const getRes = await request(app.getHttpServer())
      .get(`/api/v1/routing-rules/${createdRuleId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(getRes.status).toBe(404);
  });
});
