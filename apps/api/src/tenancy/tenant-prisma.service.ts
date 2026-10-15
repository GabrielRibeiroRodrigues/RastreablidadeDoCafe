import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { TenantContext } from './tenant-context.js';
import { scopeArgs } from './tenant-scope.js';

function createTenantClient(prisma: PrismaService, tenant: TenantContext) {
  return prisma.$extends({
    name: 'tenant-isolation',
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          const companyId = tenant.requireCompanyId();
          const scoped = scopeArgs(model, operation, args, companyId);
          return query(scoped);
        },
      },
    },
  });
}

export type TenantPrismaClient = ReturnType<typeof createTenantClient>;

/**
 * Cliente Prisma usado pelos módulos de negócio: toda operação de modelo é escopada à empresa do
 * contexto (ADR 0004). SQL bruto não passa pela extensão — use `sql()`, que exige a empresa.
 */
@Injectable()
export class TenantPrismaService {
  readonly client: TenantPrismaClient;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
  ) {
    this.client = createTenantClient(prisma, tenant);
  }

  /**
   * Única porta de entrada para SQL bruto em código de negócio: o builder recebe o `companyId`
   * do contexto e é responsável por usá-lo no WHERE (revisado em code review e testado).
   */
  sql<T>(build: (companyId: string) => Prisma.Sql): Promise<T> {
    return this.prisma.$queryRaw<T>(build(this.tenant.requireCompanyId()));
  }

  /**
   * Transação interativa escopada. O `tx` tem os modelos com a mesma extensão de tenant e um
   * `sql()` que roda **dentro** da transação — necessário para `SELECT ... FOR UPDATE`.
   */
  transaction<T>(
    fn: (tx: TenantTransaction) => Promise<T>,
    options?: { timeout?: number; maxWait?: number },
  ): Promise<T> {
    const companyId = this.tenant.requireCompanyId();
    return this.client.$transaction(
      (tx) =>
        fn(
          Object.assign(tx, {
            sql: <R>(build: (companyId: string) => Prisma.Sql) => tx.$queryRaw<R>(build(companyId)),
          }),
        ),
      { timeout: 10_000, maxWait: 5_000, ...options },
    );
  }
}

type TransactionClient = Parameters<Parameters<TenantPrismaClient['$transaction']>[0]>[0];

export type TenantTransaction = TransactionClient & {
  /** SQL bruto dentro da transação; o builder recebe a empresa do contexto e deve usá-la. */
  sql<R>(build: (companyId: string) => Prisma.Sql): Promise<R>;
};
