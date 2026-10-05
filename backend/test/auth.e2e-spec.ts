import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { stopScheduledJobs } from './test-utils.js';

describe('Auth (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    stopScheduledJobs(moduleRef);
  });

  afterAll(async () => {
    await app.close();
  });

  // Isolated in its own file/app instance (separate ThrottlerStorage) so
  // exhausting the limit here doesn't affect other specs' login calls.
  it('rate-limits repeated login attempts from the same client', async () => {
    const attempt = () =>
      request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'admin@switching.local', password: 'wrong-password' });

    const results = [];
    for (let i = 0; i < 21; i++) {
      results.push(await attempt());
    }

    const statuses = results.map((r) => r.status);
    expect(statuses.filter((s) => s === 401).length).toBe(20);
    expect(statuses.filter((s) => s === 429).length).toBe(1);
    expect(statuses[20]).toBe(429);
  }, 20_000);
});
