import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import type { Request } from 'express';
import type { Env } from '../config/env.js';
import { TimeoutInterceptor } from './timeout.interceptor.js';

/** Health checks (load balancer, monitoração) nunca são limitados. */
const HEALTH_PATH = /^\/v1\/health(\/|\?|$)/;

/**
 * Proteções transversais da API (docs/seguranca.md):
 * - rate limit global por IP (`RATE_LIMIT_PER_MINUTE`), em memória por instância;
 * - tempo máximo por requisição (`REQUEST_TIMEOUT_MS`).
 *
 * A rota pública de rastreio mantém o seu próprio limite, mais estrito (PublicModule).
 * O IP vem de `req.ip`, que respeita `TRUST_PROXY` (configurado em `configureApp`).
 */
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        throttlers: [
          {
            name: 'global',
            ttl: 60_000,
            limit: config.get('RATE_LIMIT_PER_MINUTE', { infer: true }),
          },
        ],
        skipIf: (context) =>
          HEALTH_PATH.test(context.switchToHttp().getRequest<Request>().originalUrl ?? ''),
      }),
    }),
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: TimeoutInterceptor },
  ],
})
export class SecurityModule {}
