import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { ProblemDetails } from '../src/common/http/problem-details.filter.js';
import { ProductType } from '../src/generated/prisma/client.js';
import { describeCatalogResource } from './support/catalog-suite.js';

const bearer = { type: 'bearer' } as const;
const uniqueSku = () => `SKU-${randomUUID().slice(0, 8).toUpperCase()}`;

describeCatalogResource({
  name: 'products',
  path: '/v1/products',
  seed: (make, companyId) => make.product(companyId),
  validPayload: () => ({
    sku: uniqueSku(),
    name: 'Café verde Catuaí',
    type: 'GREEN',
    unit: 'BAG_60KG',
  }),
  updatePayload: { name: 'Café verde Catuaí Vermelho' },
  extra: (ctx) => {
    describe('product rules', () => {
      it('normalizes the SKU and returns the created product', async () => {
        const res = await ctx()
          .testApp.http()
          .post('/v1/products')
          .auth(ctx().tokens.operator, bearer)
          .send({
            sku: '  tor-especial ',
            name: ' Especial ',
            type: 'ROASTED',
            unit: 'KG',
            defaultRoastLevel: 'MEDIUM',
          })
          .expect(201);

        expect(res.body).toMatchObject({
          sku: 'TOR-ESPECIAL',
          name: 'Especial',
          type: 'ROASTED',
          defaultRoastLevel: 'MEDIUM',
          isActive: true,
        });
        expect(res.body).not.toHaveProperty('companyId');
      });

      it('rejects a duplicated SKU in the same company with 409', async () => {
        await ctx().make.product(ctx().a.id, { sku: 'DUP-1' });

        const res = await ctx()
          .testApp.http()
          .post('/v1/products')
          .auth(ctx().tokens.operator, bearer)
          .send({ sku: 'DUP-1', name: 'Outro', type: 'GREEN', unit: 'KG' })
          .expect(409);
        expect((res.body as ProblemDetails).errors?.map((e) => e.field)).toEqual(['sku']);
      });

      it('allows the same SKU in another company', async () => {
        await ctx().make.product(ctx().b.id, { sku: 'SHARED-1' });

        await ctx()
          .testApp.http()
          .post('/v1/products')
          .auth(ctx().tokens.operator, bearer)
          .send({ sku: 'SHARED-1', name: 'Meu', type: 'GREEN', unit: 'KG' })
          .expect(201);
      });

      it('only roasted products and blends can have a roast level', async () => {
        const res = await ctx()
          .testApp.http()
          .post('/v1/products')
          .auth(ctx().tokens.operator, bearer)
          .send({
            sku: uniqueSku(),
            name: 'Verde',
            type: 'GREEN',
            unit: 'KG',
            defaultRoastLevel: 'DARK',
          })
          .expect(400);
        expect((res.body as ProblemDetails).errors?.[0]?.field).toBe('defaultRoastLevel');

        // Também na edição: mudar o tipo de um torrado para verde mantendo a torra é inválido.
        const roasted = await ctx().make.product(ctx().a.id, {
          type: ProductType.ROASTED,
          defaultRoastLevel: 'MEDIUM',
        });
        await ctx()
          .testApp.http()
          .patch(`/v1/products/${roasted.id}`)
          .auth(ctx().tokens.operator, bearer)
          .send({ type: 'GREEN' })
          .expect(400);
      });

      it('filters by text and type', async () => {
        const { make, a } = ctx();
        await make.product(a.id, { name: 'Bourbon Amarelo', type: ProductType.GREEN });
        await make.product(a.id, { name: 'Blend da Casa', type: ProductType.BLEND });

        const byText = await ctx()
          .testApp.http()
          .get('/v1/products?q=bourbon')
          .auth(ctx().tokens.auditor, bearer)
          .expect(200);
        expect((byText.body as { data: Array<{ name: string }> }).data.map((p) => p.name)).toEqual([
          'Bourbon Amarelo',
        ]);

        const byType = await ctx()
          .testApp.http()
          .get('/v1/products?type=BLEND')
          .auth(ctx().tokens.auditor, bearer)
          .expect(200);
        expect((byType.body as { meta: { total: number } }).meta.total).toBe(1);
      });
    });
  },
});
