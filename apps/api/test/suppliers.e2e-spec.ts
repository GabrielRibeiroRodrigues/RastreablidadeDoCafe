import { describe, expect, it } from 'vitest';
import type { ProblemDetails } from '../src/common/http/problem-details.filter.js';
import { describeCatalogResource } from './support/catalog-suite.js';

const bearer = { type: 'bearer' } as const;

describeCatalogResource({
  name: 'suppliers',
  path: '/v1/suppliers',
  seed: (make, companyId) => make.supplier(companyId),
  validPayload: () => ({ name: 'Sítio Boa Vista', type: 'PRODUCER' }),
  updatePayload: { region: 'Sul de Minas' },
  extra: (ctx) => {
    describe('supplier rules', () => {
      it('stores CPF/CNPJ as digits and cleans the variety list', async () => {
        const res = await ctx()
          .testApp.http()
          .post('/v1/suppliers')
          .auth(ctx().tokens.operator, bearer)
          .send({
            name: 'Fazenda Pedra Grande',
            type: 'FARM',
            document: '11.222.333/0001-81',
            state: 'mg',
            altitudeMeters: 1100,
            varieties: [' Mundo Novo ', 'Catuaí Amarelo', 'Mundo Novo', ''],
          })
          .expect(201);

        expect(res.body).toMatchObject({
          document: '11222333000181',
          state: 'MG',
          altitudeMeters: 1100,
          varieties: ['Mundo Novo', 'Catuaí Amarelo'],
        });
      });

      it('rejects an invalid document, UF and altitude', async () => {
        const res = await ctx()
          .testApp.http()
          .post('/v1/suppliers')
          .auth(ctx().tokens.operator, bearer)
          .send({
            name: 'Fazenda X',
            type: 'FARM',
            document: '111.111.111-11',
            state: 'XX',
            altitudeMeters: 9000,
          })
          .expect(400);

        const fields = (res.body as ProblemDetails).errors?.map((e) => e.field).sort();
        expect(fields).toEqual(['altitudeMeters', 'document', 'state']);
      });

      it('rejects a duplicated document in the same company with 409', async () => {
        await ctx().make.supplier(ctx().a.id, { document: '52998224725' });

        const res = await ctx()
          .testApp.http()
          .post('/v1/suppliers')
          .auth(ctx().tokens.operator, bearer)
          .send({ name: 'Outro', type: 'PRODUCER', document: '529.982.247-25' })
          .expect(409);
        expect((res.body as ProblemDetails).errors?.map((e) => e.field)).toEqual(['document']);
      });

      it('clears an optional field with an empty string', async () => {
        const supplier = await ctx().make.supplier(ctx().a.id, { region: 'Cerrado Mineiro' });

        const res = await ctx()
          .testApp.http()
          .patch(`/v1/suppliers/${supplier.id}`)
          .auth(ctx().tokens.operator, bearer)
          .send({ region: '' })
          .expect(200);
        expect((res.body as { region: string | null }).region).toBeNull();
      });

      it('searches by farm name and document, filters by UF', async () => {
        const { make, a } = ctx();
        await make.supplier(a.id, { name: 'José', farmName: 'Sítio Santa Inês', state: 'MG' });
        await make.supplier(a.id, { name: 'Maria', document: '11144477735', state: 'SP' });

        const http = () => ctx().testApp.http();
        const total = async (query: string) => {
          const res = await http().get(`/v1/suppliers?${query}`).auth(ctx().tokens.auditor, bearer);
          return (res.body as { meta: { total: number } }).meta.total;
        };

        expect(await total('q=santa%20ines')).toBe(0); // sem acento não casa (busca simples)
        expect(await total('q=Santa%20In%C3%AAs')).toBe(1);
        expect(await total('q=111.444')).toBe(1);
        expect(await total('state=SP')).toBe(1);
      });
    });
  },
});
