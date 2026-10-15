import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Prisma } from '../src/generated/prisma/client.js';
import { resetDatabase } from './support/database.js';
import { factories } from './support/factories.js';
import { createTestApp, type TestApp } from './support/test-app.js';

describe('Database (e2e, Testcontainers)', () => {
  let testApp: TestApp;
  let make: ReturnType<typeof factories>;

  beforeAll(async () => {
    testApp = await createTestApp();
    make = factories(testApp.prisma);
  });

  beforeEach(async () => {
    await resetDatabase(testApp.prisma);
  });

  afterAll(async () => {
    await testApp.close();
  });

  it('GET /v1/health/ready reports the database as up', async () => {
    await testApp.http().get('/v1/health/ready').expect(200, { status: 'ok', database: 'up' });
  });

  it('applied the migrations (all Week 1 tables exist)', async () => {
    const rows = await testApp.prisma.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
    `;
    expect(rows.map((r) => r.tablename)).toEqual(
      expect.arrayContaining([
        'companies',
        'users',
        'products',
        'suppliers',
        'customers',
        'locations',
      ]),
    );
  });

  it('starts every test from an empty database', async () => {
    expect(await testApp.prisma.company.count()).toBe(0);
  });

  it('scopes SKU uniqueness to the company', async () => {
    const roastery = await make.company();
    const cooperative = await make.company();
    await make.product(roastery.id, { sku: 'VRD-BOURBON' });

    // Mesma SKU em outra empresa: permitido.
    await expect(make.product(cooperative.id, { sku: 'VRD-BOURBON' })).resolves.toBeDefined();

    // Mesma SKU na mesma empresa: violação de unicidade (P2002).
    await expect(make.product(roastery.id, { sku: 'VRD-BOURBON' })).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002',
    );
  });

  it('refuses to delete a company that still owns data', async () => {
    const company = await make.company();
    await make.user(company.id);

    await expect(testApp.prisma.company.delete({ where: { id: company.id } })).rejects.toThrow();
  });
});
