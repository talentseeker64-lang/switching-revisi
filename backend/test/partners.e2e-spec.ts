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
const VIEWER_EMAIL = `e2e-viewer-${Date.now()}@switching.local`;
const VIEWER_PASSWORD = 'ViewerPass123!';
const PARTNER_CODE = `E2E_PARTNER_${Date.now()}`;

describe('Partners (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let viewerToken: string;
  let createdPartnerId: string;
  let createdCredentialId: string;

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
        fullName: 'E2E Viewer',
        role: UserRole.VIEWER,
        status: UserStatus.ACTIVE,
      },
      update: {},
    });

    const adminLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    adminToken = adminLogin.body.data.accessToken;

    const viewerLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: VIEWER_EMAIL, password: VIEWER_PASSWORD });
    viewerToken = viewerLogin.body.data.accessToken;
  });

  afterAll(async () => {
    await prisma.partner.deleteMany({ where: { code: PARTNER_CODE } });
    await prisma.user.deleteMany({ where: { email: VIEWER_EMAIL } });
    await prisma.$disconnect();
    await app.close();
  });

  it('rejects unauthenticated requests', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/partners');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects creation by a VIEWER role', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/partners')
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ code: PARTNER_CODE, name: 'Koperasi Test', type: 'KOPERASI' });
    expect(res.status).toBe(403);
  });

  it('rejects an invalid payload with VALIDATION_ERROR', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/partners')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: 'bad code with spaces', name: 'x', type: 'NOT_A_TYPE' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('creates a partner as ADMIN', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/partners')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: PARTNER_CODE,
        name: 'Koperasi Sejahtera E2E',
        type: 'KOPERASI',
        contactEmail: 'ops@koperasi-e2e.test',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.code).toBe(PARTNER_CODE);
    expect(res.body.data.status).toBe('INACTIVE');
    createdPartnerId = res.body.data.id;
  });

  it('rejects a duplicate partner code with CONFLICT', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/partners')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: PARTNER_CODE, name: 'Duplicate', type: 'KOPERASI' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('lists partners including the created one', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/partners?search=${PARTNER_CODE}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.some((p: { code: string }) => p.code === PARTNER_CODE)).toBe(true);
    expect(res.body.meta.total).toBeGreaterThanOrEqual(1);
  });

  it('returns 404 for an unknown partner id', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/partners/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('updates the partner profile', async () => {
    const res = await request(app.getHttpServer())
      .put(`/api/v1/partners/${createdPartnerId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Koperasi Sejahtera Updated' });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Koperasi Sejahtera Updated');
  });

  it('activates the partner', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/partners/${createdPartnerId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'ACTIVE' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ACTIVE');
  });

  it('rejects credential issuance by a non-ADMIN role', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/partners/${createdPartnerId}/credentials`)
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(res.status).toBe(403);
  });

  it('issues an API credential, returning the raw secret once', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/partners/${createdPartnerId}/credentials`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(201);
    expect(res.body.data.apiKey).toMatch(/^dsk_/);
    expect(typeof res.body.data.apiSecret).toBe('string');
    expect(res.body.data.apiSecret.length).toBeGreaterThan(16);
    createdCredentialId = res.body.data.id;

    const stored = await prisma.apiCredential.findUnique({ where: { id: createdCredentialId } });
    expect(stored?.apiSecretHash).not.toBe(res.body.data.apiSecret);
  });

  it('revokes the credential', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/partners/${createdPartnerId}/credentials/${createdCredentialId}/revoke`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('REVOKED');
  });
});
