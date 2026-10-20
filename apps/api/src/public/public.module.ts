import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import type { Env } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { rateLimitStorage } from '../security/security.module.js';
import { TraceModule } from '../modules/trace/trace.module.js';
import { ClientErrorsController } from './client-errors.controller.js';
import { PublicTraceController } from './public-trace.controller.js';
import { PublicTraceService } from './public-trace.service.js';

/**
 * Rotas públicas (sem login). Fica em `src/public/`, fora de `src/modules/`, porque precisa do
 * `PrismaService` cru para achar o lote pelo token — ver `PublicTraceService`.
 */
@Module({
  imports: [
    TraceModule,
    // 30 requisições por minuto por IP. O guard é aplicado só no controller público; os contadores
    // ficam onde `RATE_LIMIT_STORE` mandar (Postgres em produção).
    ThrottlerModule.forRootAsync({
      inject: [ConfigService, PrismaService],
      useFactory: (config: ConfigService<Env, true>, prisma: PrismaService) => ({
        ...rateLimitStorage(config, prisma),
        throttlers: [{ name: 'public', ttl: 60_000, limit: 30 }],
      }),
    }),
  ],
  controllers: [PublicTraceController, ClientErrorsController],
  providers: [PublicTraceService],
})
export class PublicModule {}
