import { randomInt, randomUUID } from 'node:crypto';
import {
  ProductType,
  Role,
  Unit,
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
  };
}
