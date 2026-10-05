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
const VIEWER_EMAIL = `e2e-audit-viewer-${Date.now()}@switching.local`;
const VIEWER_PASSWORD = 'ViewerPass123!';

describe('Audit Log (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let viewerToken: string;

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
        fullName: 'E2E Audit Viewer',
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

    // Generate a bit of audited traffic to query against.
    await request(app.getHttpServer()).get('/api/v1/partners').set('Authorization', `Bearer ${adminToken}`);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: VIEWER_EMAIL } });
    await prisma.$disconnect();
    await app.close();
  });

  it('rejects VIEWER role from reading the audit trail', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/audit-logs')
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(res.status).toBe(403);
  });

  it('lets ADMIN list and filter audit log entries', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/audit-logs?actorType=USER')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBeGreaterThan(0);
    expect(res.body.data.every((e: { actorType: string }) => e.actorType === 'USER')).toBe(true);
  });

  it('captures method, endpoint, status and duration for a real request', async () => {
    // Other e2e spec files hit /api/v1/partners concurrently against the
    // same dev DB, so identify this exact request by its own correlation
    // ID rather than by endpoint/method, which could collide.
    const correlationId = `audit-test-${Date.now()}-${Math.random()}`;
    const tracked = await request(app.getHttpServer())
      .get('/api/v1/partners')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('x-correlation-id', correlationId);
    expect(tracked.status).toBe(200);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/audit-logs?correlationId=${correlationId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);

    const entry = res.body.data[0];
    expect(entry.endpoint).toBe('/api/v1/partners');
    expect(entry.method).toBe('GET');
    expect(entry.responseStatus).toBe(200);
    expect(typeof entry.durationMs).toBe('number');
  });

  it('gets a single audit log entry by id and 404s for an unknown one', async () => {
    const list = await request(app.getHttpServer())
      .get('/api/v1/audit-logs?pageSize=1')
      .set('Authorization', `Bearer ${adminToken}`);
    const id = list.body.data[0].id;

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/audit-logs/${id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.id).toBe(id);

    const missing = await request(app.getHttpServer())
      .get('/api/v1/audit-logs/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(missing.status).toBe(404);
  });
});
