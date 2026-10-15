import { describe, expect, it } from 'vitest';
import type { ProblemDetails } from '../src/common/http/problem-details.filter.js';
import { describeCatalogResource } from './support/catalog-suite.js';

const bearer = { type: 'bearer' } as const;

describeCatalogResource({
  name: 'customers',
  path: '/v1/customers',
  seed: (make, companyId) => make.customer(companyId),
  validPayload: () => ({ name: 'Cafeteria Grão Fino', city: 'São Paulo', state: 'SP' }),
  updatePayload: { email: 'compras@graofino.dev' },
  extra: (ctx) => {
    describe('customer rules', () => {
      it('normalizes document and phone to digits', async () => {
        const res = await ctx()
          .testApp.http()
          .post('/v1/customers')
          .auth(ctx().tokens.operator, bearer)
          .send({
            name: 'Empório Mineiro',
            document: '45.723.174/0001-10',
            phone: '(31) 98888-7777',
          })
          .expect(201);

        expect(res.body).toMatchObject({ document: '45723174000110', phone: '31988887777' });
      });

      it('rejects an invalid e-mail and document', async () => {
        const res = await ctx()
          .testApp.http()
          .post('/v1/customers')
          .auth(ctx().tokens.operator, bearer)
          .send({ name: 'Cliente', email: 'not-an-email', document: '123' })
          .expect(400);

        const fields = (res.body as ProblemDetails).errors?.map((e) => e.field).sort();
        expect(fields).toEqual(['document', 'email']);
      });

      it('searches by e-mail', async () => {
        await ctx().make.customer(ctx().a.id, { name: 'Padaria', email: 'pao@prosa.dev' });

        const res = await ctx()
          .testApp.http()
          .get('/v1/customers?q=PROSA')
          .auth(ctx().tokens.auditor, bearer)
          .expect(200);
        expect((res.body as { data: Array<{ name: string }> }).data.map((c) => c.name)).toEqual([
          'Padaria',
        ]);
      });
    });
  },
});
