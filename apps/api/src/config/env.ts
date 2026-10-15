import { z } from 'zod';

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
    /** Logs legíveis (pino-pretty, dependência de dev). Em contêiner/AWS: JSON. */
    LOG_PRETTY: z.stringbool().default(false),
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
    DATABASE_URL: z
      .string()
      .regex(/^postgres(ql)?:\/\//, 'must be a postgres:// connection string'),
    /** Conexões por instância (na Lambda, manter 1–2). */
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),

    /** `cognito`: valida tokens do User Pool. `mock`: emissor local, só fora de produção (ADR 0005). */
    AUTH_MODE: z.enum(['cognito', 'mock']).default('cognito'),
    COGNITO_REGION: z.string().optional(),
    COGNITO_USER_POOL_ID: z.string().optional(),
    /** App client cujo `client_id` os access tokens devem ter (também usado pelo emissor simulado). */
    COGNITO_CLIENT_ID: z.string().min(1).default('traceflow-local'),
  })
  .superRefine((env, ctx) => {
    if (env.AUTH_MODE === 'mock' && env.NODE_ENV === 'production') {
      ctx.addIssue({
        code: 'custom',
        path: ['AUTH_MODE'],
        message: 'mock authentication is forbidden when NODE_ENV=production',
      });
    }
    if (env.AUTH_MODE === 'cognito') {
      for (const key of ['COGNITO_REGION', 'COGNITO_USER_POOL_ID'] as const) {
        if (!env[key]) {
          ctx.addIssue({ code: 'custom', path: [key], message: 'required when AUTH_MODE=cognito' });
        }
      }
    }
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
