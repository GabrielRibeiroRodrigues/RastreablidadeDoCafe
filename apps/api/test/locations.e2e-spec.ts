import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { ProblemDetails } from '../src/common/http/problem-details.filter.js';
import { LocationType } from '../src/generated/prisma/client.js';
import { describeCatalogResource } from './support/catalog-suite.js';

const bearer = { type: 'bearer' } as const;

describeCatalogResource({
  name: 'locations',
  path: '/v1/locations',
  seed: (make, companyId) => make.location(companyId),
  validPayload: () => ({
    code: `L-${randomUUID().slice(0, 6)}`,
    name: 'Silo 2',
    type: 'SILO',
  }),
  updatePayload: { name: 'Silo 2 (reformado)' },
  extra: (ctx) => {
    describe('location rules', () => {
      it('uppercases the code and rejects duplicates in the same company', async () => {
        const http = () => ctx().testApp.http();

        const res = await http()
          .post('/v1/locations')
          .auth(ctx().tokens.operator, bearer)
          .send({ code: ' quar ', name: 'Quarentena', type: 'QUARANTINE' })
          .expect(201);
        expect((res.body as { code: string }).code).toBe('QUAR');

        const dup = await http()
          .post('/v1/locations')
          .auth(ctx().tokens.operator, bearer)
          .send({ code: 'QUAR', name: 'Outra', type: 'QUARANTINE' })
          .expect(409);
        expect((dup.body as ProblemDetails).errors?.map((e) => e.field)).toEqual(['code']);
      });

      it('sorts by code by default and filters by type', async () => {
        const { make, a } = ctx();
        await make.location(a.id, { code: 'SILO-02', type: LocationType.SILO });
        await make.location(a.id, { code: 'ARM-01', type: LocationType.WAREHOUSE });
        await make.location(a.id, { code: 'SILO-01', type: LocationType.SILO });

        const all = await ctx()
          .testApp.http()
          .get('/v1/locations')
          .auth(ctx().tokens.auditor, bearer);
        expect((all.body as { data: Array<{ code: string }> }).data.map((l) => l.code)).toEqual([
          'ARM-01',
          'SILO-01',
          'SILO-02',
        ]);

        const silos = await ctx()
          .testApp.http()
          .get('/v1/locations?type=SILO&sort=-code')
          .auth(ctx().tokens.auditor, bearer);
        expect((silos.body as { data: Array<{ code: string }> }).data.map((l) => l.code)).toEqual([
          'SILO-02',
          'SILO-01',
        ]);
      });
    });
  },
});
