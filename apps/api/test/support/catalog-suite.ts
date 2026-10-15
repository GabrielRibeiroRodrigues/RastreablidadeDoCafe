import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ProblemDetails } from '../../src/common/http/problem-details.filter.js';
import { Role, type Company, type User } from '../../src/generated/prisma/client.js';
import { resetDatabase } from './database.js';
import { factories } from './factories.js';
import { createTestApp, type TestApp } from './test-app.js';

type Factories = ReturnType<typeof factories>;

export interface CatalogContext {
  testApp: TestApp;
  make: Factories;
  a: Company;
  b: Company;
  /** Token de cada perfil da empresa A, e o admin da empresa B. */
  tokens: { admin: string; operator: string; auditor: string; adminB: string };
}

export interface CatalogSuiteOptions {
  /** Nome no relatório, ex.: "products". */
  name: string;
  /** Rota base, ex.: "/v1/products". */
  path: string;
  /** Cria um registro diretamente no banco para a empresa informada. */
  seed: (make: Factories, companyId: string) => Promise<{ id: string }>;
  /** Corpo válido para POST (precisa ser único a cada chamada). */
  validPayload: () => Record<string, unknown>;
  /** Corpo válido para PATCH. */
  updatePayload: Record<string, unknown>;
  /** Testes específicos do recurso, com o mesmo contexto. */
  extra?: (ctx: () => CatalogContext) => void;
}

/**
 * Suíte padrão de todo cadastro: isolamento entre empresas, perfis, paginação e desativação.
 * Um cadastro novo ganha estes testes com uma linha — e não dá para "esquecer" o isolamento.
 */
export function describeCatalogResource(options: CatalogSuiteOptions): void {
  const { path } = options;

  describe(`${options.name} (e2e)`, () => {
    let ctx: CatalogContext;
    const tokenFor = async (testApp: TestApp, user: User) => {
      const res = await testApp
        .http()
        .post('/v1/dev/token')
        .send({ email: user.email })
        .expect(200);
      return (res.body as { accessToken: string }).accessToken;
    };

    beforeAll(async () => {
      const testApp = await createTestApp();
      ctx = { testApp, make: factories(testApp.prisma) } as CatalogContext;
    });

    beforeEach(async () => {
      const { testApp, make } = ctx;
      await resetDatabase(testApp.prisma);
      ctx.a = await make.company({ name: 'Empresa A' });
      ctx.b = await make.company({ name: 'Empresa B' });
      const [admin, operator, auditor, adminB] = await Promise.all([
        make.user(ctx.a.id, { role: Role.ADMIN }),
        make.user(ctx.a.id, { role: Role.OPERATOR }),
        make.user(ctx.a.id, { role: Role.AUDITOR }),
        make.user(ctx.b.id, { role: Role.ADMIN }),
      ]);
      ctx.tokens = {
        admin: await tokenFor(testApp, admin),
        operator: await tokenFor(testApp, operator),
        auditor: await tokenFor(testApp, auditor),
        adminB: await tokenFor(testApp, adminB),
      };
    });

    afterAll(async () => {
      await ctx.testApp.close();
    });

    const http = () => ctx.testApp.http();
    const bearer = { type: 'bearer' } as const;

    describe('tenant isolation', () => {
      it('lists only records of the caller company', async () => {
        const mine = await options.seed(ctx.make, ctx.a.id);
        await options.seed(ctx.make, ctx.b.id);

        const res = await http().get(path).auth(ctx.tokens.auditor, bearer).expect(200);
        const body = res.body as { data: Array<{ id: string }>; meta: { total: number } };

        expect(body.data.map((r) => r.id)).toEqual([mine.id]);
        expect(body.meta.total).toBe(1);
      });

      it('answers 404 (not 403) for another company record on GET, PATCH and deactivate', async () => {
        const theirs = await options.seed(ctx.make, ctx.b.id);

        await http().get(`${path}/${theirs.id}`).auth(ctx.tokens.admin, bearer).expect(404);
        await http()
          .patch(`${path}/${theirs.id}`)
          .auth(ctx.tokens.admin, bearer)
          .send(options.updatePayload)
          .expect(404);
        await http()
          .post(`${path}/${theirs.id}/deactivate`)
          .auth(ctx.tokens.admin, bearer)
          .expect(404);

        // E o dono continua vendo o registro intacto e ativo.
        const owner = await http()
          .get(`${path}/${theirs.id}`)
          .auth(ctx.tokens.adminB, bearer)
          .expect(200);
        expect((owner.body as { isActive: boolean }).isActive).toBe(true);
      });

      it('rejects a forged companyId in the body', async () => {
        const res = await http()
          .post(path)
          .auth(ctx.tokens.operator, bearer)
          .send({ ...options.validPayload(), companyId: ctx.b.id })
          .expect(400);
        expect((res.body as ProblemDetails).errors?.map((e) => e.field)).toContain('companyId');
      });
    });

    describe('roles', () => {
      it('auditor can read but not write', async () => {
        await http().get(path).auth(ctx.tokens.auditor, bearer).expect(200);
        await http()
          .post(path)
          .auth(ctx.tokens.auditor, bearer)
          .send(options.validPayload())
          .expect(403);
      });

      it('operator can create and update, but not deactivate', async () => {
        const created = await http()
          .post(path)
          .auth(ctx.tokens.operator, bearer)
          .send(options.validPayload())
          .expect(201);
        const { id } = created.body as { id: string };

        await http()
          .patch(`${path}/${id}`)
          .auth(ctx.tokens.operator, bearer)
          .send(options.updatePayload)
          .expect(200);
        await http().post(`${path}/${id}/deactivate`).auth(ctx.tokens.operator, bearer).expect(403);
      });

      it('requires authentication', async () => {
        await http().get(path).expect(401);
      });
    });

    describe('lifecycle and listing', () => {
      it('admin deactivates and reactivates; inactive records leave the default listing', async () => {
        const record = await options.seed(ctx.make, ctx.a.id);

        await http()
          .post(`${path}/${record.id}/deactivate`)
          .auth(ctx.tokens.admin, bearer)
          .expect(200);

        const active = await http().get(path).auth(ctx.tokens.admin, bearer).expect(200);
        expect((active.body as { meta: { total: number } }).meta.total).toBe(0);
        const inactive = await http()
          .get(`${path}?status=inactive`)
          .auth(ctx.tokens.admin, bearer)
          .expect(200);
        expect((inactive.body as { meta: { total: number } }).meta.total).toBe(1);

        const back = await http()
          .post(`${path}/${record.id}/activate`)
          .auth(ctx.tokens.admin, bearer)
          .expect(200);
        expect((back.body as { isActive: boolean }).isActive).toBe(true);
      });

      it('paginates with metadata', async () => {
        for (let i = 0; i < 5; i++) await options.seed(ctx.make, ctx.a.id);

        const res = await http()
          .get(`${path}?page=2&pageSize=2`)
          .auth(ctx.tokens.admin, bearer)
          .expect(200);
        const body = res.body as { data: unknown[]; meta: unknown };

        expect(body.data).toHaveLength(2);
        expect(body.meta).toEqual({ page: 2, pageSize: 2, total: 5, totalPages: 3 });
      });

      it('validates paging parameters', async () => {
        await http().get(`${path}?pageSize=1000`).auth(ctx.tokens.admin, bearer).expect(400);
        await http().get(`${path}?page=0`).auth(ctx.tokens.admin, bearer).expect(400);
      });

      it('validates the id format', async () => {
        await http().get(`${path}/not-a-uuid`).auth(ctx.tokens.admin, bearer).expect(400);
        await http().get(`${path}/${randomUUID()}`).auth(ctx.tokens.admin, bearer).expect(404);
      });
    });

    options.extra?.(() => ctx);
  });
}
