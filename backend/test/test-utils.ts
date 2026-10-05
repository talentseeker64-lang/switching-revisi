import type { TestingModule } from '@nestjs/testing';
import { SchedulerRegistry } from '@nestjs/schedule';

/**
 * JobsService's @Cron handlers run for real against the full AppModule in
 * these e2e tests, same as production. That's correct for the app, but
 * racy for assertions that check an intermediate state (e.g. PENDING)
 * before the real poller has a chance to resolve it - and multiple e2e
 * test files bootstrap their own AppModule instance in parallel against the
 * same dev database, so one file's cron can resolve another file's
 * transactions mid-test. Call this after `app.init()` in any e2e spec that
 * asserts on transaction state timing; tests that want the background-job
 * behavior (orchestration.e2e-spec.ts) invoke JobsService's methods
 * directly instead.
 */
export function stopScheduledJobs(moduleRef: TestingModule) {
  const scheduler = moduleRef.get(SchedulerRegistry);
  for (const [, job] of scheduler.getCronJobs()) {
    job.stop();
  }
}
