import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import type { Env } from '../config/env.js';
import { PrismaClient } from '../generated/prisma/client.js';

/**
 * Cliente Prisma "cru", sem filtro de empresa. Na etapa de multi-tenancy, os serviços de domínio
 * passam a usar o cliente estendido; este fica para infraestrutura (health, seed, auth lookup).
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(config: ConfigService<Env, true>) {
    super({
      adapter: new PrismaPg({
        connectionString: config.get('DATABASE_URL', { infer: true }),
        // Na Lambda cada instância abre seu próprio pool: manter pequeno para não esgotar o RDS.
        max: config.get('DATABASE_POOL_MAX', { infer: true }),
      }),
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
