import { z } from 'zod';

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
  /** Origens permitidas no CORS, separadas por vírgula. */
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:5173')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
  SWAGGER_ENABLED: z.stringbool().default(true),
  DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//, 'must be a postgres:// connection string'),
  /** Conexões por instância (na Lambda, manter 1–2). */
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
});

export type Env = z.infer<typeof envSchema>;

/** Usado pelo ConfigModule: falha no boot com uma mensagem legível se o ambiente for inválido. */
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Invalid environment variables:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
