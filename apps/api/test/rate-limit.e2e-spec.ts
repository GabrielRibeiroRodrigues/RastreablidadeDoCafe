import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { PostgresThrottlerStorage } from '../src/security/postgres-throttler.storage.js';
import { resetDatabase } from './support/database.js';
import { createTestApp, type TestApp } from './support/test-app.js';

/**
 * Rate limit no Postgres (`RATE_LIMIT_STORE=postgres`): duas "instâncias" da API (dois objetos de
 * armazenamento) dividem o mesmo contador — o que o armazenamento em memória não faz na Lambda.
 */
describe('Postgres rate limit storage (e2e)', () => {
  let testApp: TestApp;
  let prisma: PrismaService;

  beforeAll(async () => {
    testApp = await createTestApp();
    prisma = testApp.app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(testApp.prisma);
  });

  afterAll(async () => {
    await testApp.close();
  });

  it('shares one counter across instances, atomically', async () => {
    const instanceA = new PostgresThrottlerStorage(prisma);
    const instanceB = new PostgresThrottlerStorage(prisma);

    const results = await Promise.all(
      Array.from({ length: 40 }, (_, i) =>
        (i % 2 ? instanceA : instanceB).increment('ip-1', 60_000, 30, 60_000, 'global'),
      ),
    );

    expect(results.map((r) => r.totalHits).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 40 }, (_, i) => i + 1),
    );
    expect(results.filter((r) => r.isBlocked)).toHaveLength(10);
    const blocked = results.find((r) => r.isBlocked)!;
    expect(blocked.timeToBlockExpire).toBeGreaterThan(0);
    expect(blocked.timeToBlockExpire).toBeLessThanOrEqual(60);
  });

  it('keeps separate counters per key and per throttler', async () => {
    const storage = new PostgresThrottlerStorage(prisma);
    await storage.increment('ip-1', 60_000, 1, 60_000, 'global');

    expect((await storage.increment('ip-2', 60_000, 1, 60_000, 'global')).isBlocked).toBe(false);
    expect((await storage.increment('ip-1', 60_000, 1, 60_000, 'public')).isBlocked).toBe(false);
    expect((await storage.increment('ip-1', 60_000, 1, 60_000, 'global')).isBlocked).toBe(true);
  });

  it('starts a new window after the previous one expires', async () => {
    const storage = new PostgresThrottlerStorage(prisma);
    await storage.increment('ip-1', 50, 1, 50, 'global');
    expect((await storage.increment('ip-1', 50, 1, 50, 'global')).isBlocked).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 80));
    const fresh = await storage.increment('ip-1', 50, 1, 50, 'global');
    expect(fresh).toMatchObject({ totalHits: 1, isBlocked: false });
  });
});
