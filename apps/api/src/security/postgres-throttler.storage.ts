import { Injectable, Logger } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import { PrismaService } from '../prisma/prisma.service.js';
import { incrementRateLimit, purgeRateLimits } from '../prisma/rate-limit-counter.js';

type ThrottlerStorageRecord = Awaited<ReturnType<ThrottlerStorage['increment']>>;

/** Fração dos acessos que também limpa janelas antigas (custo amortizado, sem job agendado). */
const PURGE_PROBABILITY = 0.01;

/**
 * Armazenamento do rate limit no Postgres, compartilhado por todas as instâncias da API.
 * O padrão do `@nestjs/throttler` é em memória — na Lambda, cada instância teria o próprio contador
 * e o limite real seria `limite × instâncias`. Janela fixa: estourou, fica bloqueado até ela acabar.
 * Se o banco falhar, a requisição passa (o rate limit não pode derrubar a API).
 */
@Injectable()
export class PostgresThrottlerStorage implements ThrottlerStorage {
  private readonly logger = new Logger(PostgresThrottlerStorage.name);

  constructor(private readonly prisma: PrismaService) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    _blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    try {
      const { hits, expiresAt } = await incrementRateLimit(
        this.prisma,
        `${throttlerName}:${key}`,
        ttl,
      );
      if (Math.random() < PURGE_PROBABILITY) {
        void purgeRateLimits(this.prisma).catch((error: unknown) =>
          this.logger.warn({ err: error }, 'Rate limit purge failed'),
        );
      }
      const seconds = Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / 1000));
      const isBlocked = hits > limit;
      return {
        totalHits: hits,
        timeToExpire: seconds,
        isBlocked,
        timeToBlockExpire: isBlocked ? seconds : 0,
      };
    } catch (error) {
      this.logger.error({ err: error }, 'Rate limit storage failed; allowing the request');
      return { totalHits: 0, timeToExpire: 0, isBlocked: false, timeToBlockExpire: 0 };
    }
  }
}
