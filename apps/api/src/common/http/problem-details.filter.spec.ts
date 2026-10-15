import { describe, expect, it } from 'vitest';
import { conflictingFields } from './problem-details.filter.js';

describe('conflictingFields', () => {
  it('reads meta.target when Prisma provides it', () => {
    expect(conflictingFields({ target: ['companyId', 'sku'] })).toEqual(['companyId', 'sku']);
  });

  it('derives the field from the pg adapter constraint name', () => {
    const meta = {
      driverAdapterError: {
        cause: { table: 'products', constraint: { index: 'products_company_id_sku_key' } },
      },
    };
    expect(conflictingFields(meta)).toEqual(['sku']);
  });

  it('camel-cases multi-word columns', () => {
    const meta = {
      driverAdapterError: {
        cause: { table: 'companies', constraint: { index: 'companies_tax_id_key' } },
      },
    };
    expect(conflictingFields(meta)).toEqual(['taxId']);
  });

  it('returns nothing when the shape is unknown', () => {
    expect(conflictingFields(undefined)).toEqual([]);
    expect(conflictingFields({ driverAdapterError: {} })).toEqual([]);
  });
});
