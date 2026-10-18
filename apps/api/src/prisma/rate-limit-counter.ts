import type { PrismaService } from './prisma.service.js';

export interface RateLimitWindow {
  hits: number;
  expiresAt: Date;
}

/**
 * Soma um acesso à janela fixa da chave, numa única instrução atômica: janela vencida recomeça em 1.
 * Fica em `src/prisma/` porque é SQL bruto fora do escopo de empresa — `rate_limits` não é dado de
 * negócio (a chave é derivada do IP).
 */
export async function incrementRateLimit(
  prisma: PrismaService,
  key: string,
  ttlMs: number,
): Promise<RateLimitWindow> {
  const [row] = await prisma.$queryRaw<Array<{ hits: number; expires_at: Date }>>`
    INSERT INTO rate_limits (key, hits, expires_at)
    VALUES (${key}, 1, now() + ${ttlMs} * interval '1 millisecond')
    ON CONFLICT (key) DO UPDATE SET
      hits = CASE WHEN rate_limits.expires_at <= now() THEN 1 ELSE rate_limits.hits + 1 END,
      expires_at = CASE WHEN rate_limits.expires_at <= now()
        THEN now() + ${ttlMs} * interval '1 millisecond' ELSE rate_limits.expires_at END
    RETURNING hits, expires_at`;
  if (!row) throw new Error('Rate limit counter did not return a row');
  return { hits: row.hits, expiresAt: row.expires_at };
}

/** Remove janelas vencidas há mais de uma hora (chamado de vez em quando, não a cada acesso). */
export async function purgeRateLimits(prisma: PrismaService): Promise<void> {
  await prisma.$executeRaw`DELETE FROM rate_limits WHERE expires_at < now() - interval '1 hour'`;
}
