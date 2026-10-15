import { randomInt, randomUUID } from 'node:crypto';
import {
  LocationType,
  ProductType,
  Role,
  SupplierType,
  Unit,
  type Customer,
  type Location,
  type Supplier,
  type Company,
  type Product,
  type User,
} from '../../src/generated/prisma/client.js';
import type { PrismaService } from '../../src/prisma/prisma.service.js';

const digits = (length: number): string =>
  Array.from({ length }, () => randomInt(10).toString()).join('');

/** Fábricas mínimas: valores únicos por padrão, sobrescreva só o que importa ao teste. */
export function factories(prisma: PrismaService) {
  return {
    company: (data: Partial<Company> = {}): Promise<Company> =>
      prisma.company.create({
        data: { name: 'Empresa Teste', taxId: digits(14), lotPrefix: 'TST', ...data },
      }),

    user: (companyId: string, data: Partial<User> = {}): Promise<User> => {
      const suffix = randomUUID().slice(0, 8);
      return prisma.user.create({
        data: {
          companyId,
          cognitoSub: `test-${suffix}`,
          email: `user-${suffix}@test.dev`,
          name: 'Usuário Teste',
          role: Role.OPERATOR,
          ...data,
        },
      });
    },

    product: (companyId: string, data: Partial<Product> = {}): Promise<Product> =>
      prisma.product.create({
        data: {
          companyId,
          sku: `SKU-${randomUUID().slice(0, 8)}`,
          name: 'Café verde teste',
          type: ProductType.GREEN,
          unit: Unit.KG,
          ...data,
        },
      }),

    supplier: (companyId: string, data: Partial<Supplier> = {}): Promise<Supplier> =>
      prisma.supplier.create({
        data: { companyId, name: 'Fazenda Teste', type: SupplierType.FARM, ...data },
      }),

    customer: (companyId: string, data: Partial<Customer> = {}): Promise<Customer> =>
      prisma.customer.create({ data: { companyId, name: 'Cliente Teste', ...data } }),

    location: (companyId: string, data: Partial<Location> = {}): Promise<Location> =>
      prisma.location.create({
        data: {
          companyId,
          code: `LOC-${randomUUID().slice(0, 8).toUpperCase()}`,
          name: 'Armazém Teste',
          type: LocationType.WAREHOUSE,
          ...data,
        },
      }),
  };
}
