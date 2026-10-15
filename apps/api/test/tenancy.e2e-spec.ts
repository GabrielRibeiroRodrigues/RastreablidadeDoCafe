import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  Prisma,
  Role,
  type Company,
  type Product,
  type User,
} from '../src/generated/prisma/client.js';
import { TenantContext } from '../src/tenancy/tenant-context.js';
import { TenantPrismaService } from '../src/tenancy/tenant-prisma.service.js';
import { resetDatabase } from './support/database.js';
import { factories } from './support/factories.js';
import { createTestApp, type TestApp } from './support/test-app.js';

const isNotFound = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025';

/**
 * O teste mais importante do sistema: uma empresa nunca lê nem altera dados de outra (ADR 0004).
 * Cenário: Serra Azul (A) e Vale do Café (B), cada uma com seus produtos e usuários.
 */
describe('Tenant isolation (e2e)', () => {
  let testApp: TestApp;
  let make: ReturnType<typeof factories>;
  let tenant: TenantContext;
  let db: TenantPrismaService;

  let a: Company;
  let b: Company;
  let productA: Product;
  let productB: Product;
  let adminA: User;
  let operatorA: User;
  let adminB: User;

  const asA = <T>(fn: () => Promise<T>) => tenant.runAs(a.id, fn);

  const tokenFor = async (user: User): Promise<string> => {
    const res = await testApp.http().post('/v1/dev/token').send({ email: user.email }).expect(200);
    return (res.body as { accessToken: string }).accessToken;
  };

  beforeAll(async () => {
    testApp = await createTestApp();
    make = factories(testApp.prisma);
    tenant = testApp.app.get(TenantContext);
    db = testApp.app.get(TenantPrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(testApp.prisma);
    a = await make.company({ name: 'Torrefação Serra Azul' });
    b = await make.company({ name: 'Cooperativa Vale do Café' });
    productA = await make.product(a.id, { sku: 'A-1', name: 'Bourbon Amarelo' });
    productB = await make.product(b.id, { sku: 'B-1', name: 'Arara' });
    adminA = await make.user(a.id, { role: Role.ADMIN });
    operatorA = await make.user(a.id, { role: Role.OPERATOR });
    adminB = await make.user(b.id, { role: Role.ADMIN });
  });

  afterAll(async () => {
    await testApp.close();
  });

  describe('scoped Prisma client', () => {
    it('refuses to run without a tenant in context (fail closed)', async () => {
      await expect(db.client.product.findMany()).rejects.toThrow(/Tenant context is missing/);
    });

    it('lists only the context company records', async () => {
      const products = await asA(() => db.client.product.findMany());
      expect(products.map((p) => p.id)).toEqual([productA.id]);
      expect(await asA(() => db.client.product.count())).toBe(1);
    });

    it('cannot bypass the filter with OR / explicit companyId', async () => {
      const products = await asA(() =>
        db.client.product.findMany({ where: { OR: [{ companyId: b.id }, { sku: 'B-1' }] } }),
      );
      expect(products).toEqual([]);
    });

    it('does not find another company record by id', async () => {
      expect(
        await asA(() => db.client.product.findUnique({ where: { id: productB.id } })),
      ).toBeNull();
      expect(await asA(() => db.client.product.findFirst({ where: { sku: 'B-1' } }))).toBeNull();
    });

    it('cannot update another company record (and leaves it untouched)', async () => {
      await expect(
        asA(() =>
          db.client.product.update({ where: { id: productB.id }, data: { name: 'hacked' } }),
        ),
      ).rejects.toSatisfy(isNotFound);

      const untouched = await testApp.prisma.product.findUniqueOrThrow({
        where: { id: productB.id },
      });
      expect(untouched.name).toBe('Arara');
    });

    it('cannot delete another company record', async () => {
      await expect(
        asA(() => db.client.product.delete({ where: { id: productB.id } })),
      ).rejects.toSatisfy(isNotFound);
      expect(await testApp.prisma.product.count({ where: { id: productB.id } })).toBe(1);
    });

    it('bulk operations only touch the context company', async () => {
      const updated = await asA(() => db.client.product.updateMany({ data: { description: 'x' } }));
      const deleted = await asA(() => db.client.location.deleteMany());

      expect(updated.count).toBe(1);
      expect(deleted.count).toBe(0);
      const productBNow = await testApp.prisma.product.findUniqueOrThrow({
        where: { id: productB.id },
      });
      expect(productBNow.description).toBeNull();
    });

    it('creates records in the context company even if another companyId is sent', async () => {
      const created = await asA(() =>
        db.client.customer.create({ data: { name: 'Cafeteria', companyId: b.id } }),
      );
      expect(created.companyId).toBe(a.id);
    });

    it('cannot move a record to another company', async () => {
      await asA(() =>
        db.client.product.update({ where: { id: productA.id }, data: { companyId: b.id } }),
      );
      const product = await testApp.prisma.product.findUniqueOrThrow({
        where: { id: productA.id },
      });
      expect(product.companyId).toBe(a.id);
    });

    it('scopes interactive transactions too', async () => {
      const products = await asA(() =>
        db.client.$transaction((tx) => tx.product.findMany({ select: { id: true } })),
      );
      expect(products).toEqual([{ id: productA.id }]);
    });

    it('keeps concurrent executions isolated (AsyncLocalStorage)', async () => {
      const [fromA, fromB] = await Promise.all([
        tenant.runAs(a.id, () => db.client.product.findMany({ select: { sku: true } })),
        tenant.runAs(b.id, () => db.client.product.findMany({ select: { sku: true } })),
      ]);
      expect(fromA).toEqual([{ sku: 'A-1' }]);
      expect(fromB).toEqual([{ sku: 'B-1' }]);
    });

    it('the company itself: sees only its own and cannot reach another', async () => {
      expect(await asA(() => db.client.company.findMany({ select: { id: true } }))).toEqual([
        { id: a.id },
      ]);
      await expect(
        asA(() => db.client.company.update({ where: { id: b.id }, data: { name: 'hacked' } })),
      ).rejects.toSatisfy(isNotFound);
      await expect(
        asA(() => db.client.company.create({ data: { name: 'x', taxId: '1', lotPrefix: 'X' } })),
      ).rejects.toThrow();
    });

    it('raw SQL helper hands the context company to the query builder', async () => {
      const rows = await asA(() =>
        db.sql<Array<{ sku: string }>>(
          (companyId) => Prisma.sql`SELECT sku FROM products WHERE company_id = ${companyId}::uuid`,
        ),
      );
      expect(rows).toEqual([{ sku: 'A-1' }]);
    });
  });

  describe('HTTP', () => {
    it('GET /v1/companies/me returns the caller company only', async () => {
      const tokenA = await tokenFor(operatorA);
      const tokenB = await tokenFor(adminB);

      const resA = await testApp
        .http()
        .get('/v1/companies/me')
        .auth(tokenA, { type: 'bearer' })
        .expect(200);
      const resB = await testApp
        .http()
        .get('/v1/companies/me')
        .auth(tokenB, { type: 'bearer' })
        .expect(200);

      expect(resA.body).toMatchObject({ id: a.id, name: 'Torrefação Serra Azul' });
      expect(resB.body).toMatchObject({ id: b.id, name: 'Cooperativa Vale do Café' });
    });

    it('PATCH /v1/companies/me updates only the caller company (admin)', async () => {
      const token = await tokenFor(adminA);

      await testApp
        .http()
        .patch('/v1/companies/me')
        .auth(token, { type: 'bearer' })
        .send({ name: 'Serra Azul Cafés Especiais' })
        .expect(200);

      const [nowA, nowB] = await Promise.all([
        testApp.prisma.company.findUniqueOrThrow({ where: { id: a.id } }),
        testApp.prisma.company.findUniqueOrThrow({ where: { id: b.id } }),
      ]);
      expect(nowA.name).toBe('Serra Azul Cafés Especiais');
      expect(nowB.name).toBe('Cooperativa Vale do Café');
    });

    it('PATCH /v1/companies/me is admin-only', async () => {
      const token = await tokenFor(operatorA);
      await testApp
        .http()
        .patch('/v1/companies/me')
        .auth(token, { type: 'bearer' })
        .send({ name: 'Nope' })
        .expect(403);
    });

    it('rejects unknown fields (cannot smuggle taxId or id)', async () => {
      const token = await tokenFor(adminA);
      await testApp
        .http()
        .patch('/v1/companies/me')
        .auth(token, { type: 'bearer' })
        .send({ name: 'Ok name', id: b.id, taxId: '000' })
        .expect(400);
    });
  });
});
