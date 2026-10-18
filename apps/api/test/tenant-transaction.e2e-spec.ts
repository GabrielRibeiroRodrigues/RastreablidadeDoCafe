import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Prisma, type Company } from '../src/generated/prisma/client.js';
import { TenantContext } from '../src/tenancy/tenant-context.js';
import { TenantPrismaService } from '../src/tenancy/tenant-prisma.service.js';
import { resetDatabase } from './support/database.js';
import { factories } from './support/factories.js';
import { createTestApp, type TestApp } from './support/test-app.js';

/**
 * `tx.sql()` precisa rodar na **própria** transação, mesmo com várias abertas ao mesmo tempo.
 * Regressão: com `Object.assign(tx, { sql })` o último `sql` atribuído valia para todas, e o
 * `SELECT ... FOR UPDATE`/saldo de uma requisição rodava na transação de outra.
 */
describe('Tenant transactions under concurrency (e2e)', () => {
  let testApp: TestApp;
  let tenant: TenantContext;
  let db: TenantPrismaService;
  let a: Company;
  let b: Company;

  beforeAll(async () => {
    testApp = await createTestApp();
    await resetDatabase(testApp.prisma);
    tenant = testApp.app.get(TenantContext);
    db = testApp.app.get(TenantPrismaService);
    const make = factories(testApp.prisma);
    a = await make.company({ name: 'Empresa A' });
    b = await make.company({ name: 'Empresa B' });
  });

  afterAll(async () => {
    await testApp.close();
  });

  /** Cria um produto e o relê pelo `tx.sql()`, informando também a conexão de cada consulta. */
  const writeAndRead = (companyId: string, index: number) =>
    tenant.runAs(companyId, () =>
      db.transaction(async (tx) => {
        const product = await tx.product.create({
          data: { sku: `TX-${index}`, name: 'Produto', type: 'GREEN', unit: 'KG' },
        } as Prisma.ProductCreateArgs);
        const [own] = await tx.$queryRaw<Array<{ pid: number }>>(
          Prisma.sql`SELECT pg_backend_pid() AS pid`,
        );
        const rows = await tx.sql<Array<{ id: string; company_id: string; pid: number }>>(
          (scope) => Prisma.sql`
            SELECT id, company_id, pg_backend_pid() AS pid FROM products
            WHERE company_id = ${scope}::uuid AND id = ${product.id}::uuid`,
        );
        return { ownPid: own!.pid, rows };
      }),
    );

  it('runs tx.sql() inside its own transaction and company', async () => {
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) => writeAndRead(i % 2 ? a.id : b.id, i)),
    );

    results.forEach((result, i) => {
      expect(result.rows, `transaction ${i}`).toHaveLength(1);
      expect(result.rows[0]!.pid).toBe(result.ownPid);
      expect(result.rows[0]!.company_id).toBe(i % 2 ? a.id : b.id);
    });
  });
});
