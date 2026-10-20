import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { scopeArgs, TENANT_MODELS, TenantScopeError } from './tenant-scope.js';

const A = 'company-a';

describe('scopeArgs', () => {
  it('registers every schema model that has companyId', () => {
    const schema = readFileSync(new URL('../../prisma/schema.prisma', import.meta.url), 'utf8');
    const withCompany = [...schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)]
      .filter(([, , body]) => /^\s+companyId\s/m.test(body ?? ''))
      .map(([, name]) => name);
    expect(withCompany.length).toBeGreaterThan(10);
    // Sequências só são tocadas por SQL do helper tenant-aware (ON CONFLICT ... RETURNING).
    const rawSqlOnly = new Set(['LotSequence', 'DocumentSequence']);
    const missing = withCompany.filter(
      (name) => !TENANT_MODELS.has(name!) && !rawSqlOnly.has(name!),
    );
    expect(missing).toEqual([]);
  });

  describe('tenant models', () => {
    it.each(['findUnique', 'findUniqueOrThrow', 'update', 'delete'])(
      'adds companyId next to the unique key on %s',
      (operation) => {
        const scoped = scopeArgs('Product', operation, { where: { id: 'p1' } }, A);
        expect(scoped['where']).toEqual({ id: 'p1', companyId: A });
      },
    );

    it('overrides a companyId supplied in a unique where', () => {
      const scoped = scopeArgs('Product', 'findUnique', { where: { id: 'p1', companyId: 'b' } }, A);
      expect(scoped['where']).toEqual({ id: 'p1', companyId: A });
    });

    it.each(['findFirst', 'findMany', 'count', 'aggregate', 'groupBy', 'updateMany', 'deleteMany'])(
      'ANDs the company filter on %s (cannot be bypassed with OR)',
      (operation) => {
        const where = { OR: [{ companyId: 'b' }, { name: 'x' }] };
        const scoped = scopeArgs('Product', operation, { where }, A);
        expect(scoped['where']).toEqual({ AND: [where, { companyId: A }] });
      },
    );

    it('filters by company when there is no where at all', () => {
      expect(scopeArgs('Product', 'findMany', undefined, A)).toEqual({ where: { companyId: A } });
    });

    it('forces the context company on create, ignoring companyId and company from the caller', () => {
      const scoped = scopeArgs(
        'Product',
        'create',
        { data: { name: 'x', companyId: 'b', company: { connect: { id: 'b' } } } },
        A,
      );
      expect(scoped['data']).toEqual({ name: 'x', companyId: A });
    });

    it('forces the context company on every row of createMany', () => {
      const scoped = scopeArgs(
        'Location',
        'createMany',
        { data: [{ code: '1' }, { code: '2', companyId: 'b' }] },
        A,
      );
      expect(scoped['data']).toEqual([
        { code: '1', companyId: A },
        { code: '2', companyId: A },
      ]);
    });

    it.each(['update', 'updateMany'])(
      'never lets %s move a record to another company',
      (operation) => {
        const scoped = scopeArgs(
          'Customer',
          operation,
          {
            where: { id: 'c1' },
            data: { name: 'x', companyId: 'b', company: { connect: { id: 'b' } } },
          },
          A,
        );
        expect(scoped['data']).toEqual({ name: 'x' });
      },
    );

    it('scopes upsert where, create and update', () => {
      const scoped = scopeArgs(
        'Supplier',
        'upsert',
        {
          where: { id: 's1' },
          create: { name: 'x', companyId: 'b' },
          update: { companyId: 'b', name: 'y' },
        },
        A,
      );
      expect(scoped).toEqual({
        where: { id: 's1', companyId: A },
        create: { name: 'x', companyId: A },
        update: { name: 'y' },
      });
    });

    it('rejects unknown models (fail closed)', () => {
      expect(() => scopeArgs('NotAModel', 'findMany', {}, A)).toThrow(TenantScopeError);
    });
  });

  describe('Company (the tenant itself)', () => {
    it('pins reads to the context company', () => {
      expect(scopeArgs('Company', 'findUnique', { where: { id: 'other' } }, A)['where']).toEqual({
        id: 'other',
        AND: [{ id: A }],
      });
      expect(scopeArgs('Company', 'findMany', {}, A)['where']).toEqual({ id: A });
    });

    it('pins updates to the context company and keeps the id immutable', () => {
      const scoped = scopeArgs(
        'Company',
        'update',
        { where: { id: 'other' }, data: { id: 'x', name: 'n' } },
        A,
      );
      expect(scoped).toEqual({ where: { id: 'other', AND: [{ id: A }] }, data: { name: 'n' } });
    });

    it.each(['create', 'createMany', 'delete', 'deleteMany', 'upsert'])(
      'forbids %s',
      (operation) => {
        expect(() => scopeArgs('Company', operation, {}, A)).toThrow(TenantScopeError);
      },
    );
  });
});
