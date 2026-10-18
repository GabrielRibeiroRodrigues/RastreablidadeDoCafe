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
    /** Swagger UI em `/docs`. Padrão: ligado fora de produção, desligado em produção. */
    SWAGGER_ENABLED: z.stringbool().optional(),
    /**
     * Quantos proxies confiáveis há na frente da API (`trust proxy` do Express). 0 = conexão direta;
     * 1 atrás de API Gateway/ALB. Sem isso, IP do cliente (logs e rate limit) seria o do proxy.
     */
    TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(0),
    /** Limite global de requisições por minuto por IP (rotas `/v1/health*` ficam de fora). */
    RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).max(100_000).default(300),
    /**
     * Onde ficam os contadores do rate limit: `memory` (por instância, padrão local) ou `postgres`
     * (compartilhado entre as instâncias da Lambda — use em produção).
     */
    RATE_LIMIT_STORE: z.enum(['memory', 'postgres']).default('memory'),
    /** Tempo máximo de uma requisição antes de responder 503 (fica abaixo dos 30 s do API Gateway). */
    REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1000).max(900_000).default(25_000),
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

    /** Bucket privado dos anexos. Sem ele a API sobe, mas as rotas de anexos respondem 503. */
    S3_BUCKET: z.string().min(1).optional(),
    S3_REGION: z.string().min(1).default('us-east-1'),
    /** Endpoint S3 usado pela API (MinIO local). Na AWS, deixe vazio. */
    S3_ENDPOINT: z.url().optional(),
    /** Endpoint usado para assinar URLs entregues ao navegador (API em contêiner + MinIO). */
    S3_PUBLIC_ENDPOINT: z.url().optional(),
    /** MinIO exige path-style (`host/bucket/key`). */
    S3_FORCE_PATH_STYLE: z.stringbool().default(false),
    /** Só para MinIO/local: na Lambda, as credenciais vêm da role de execução. */
    S3_ACCESS_KEY_ID: z.string().min(1).optional(),
    S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
    ATTACHMENT_MAX_BYTES: z.coerce
      .number()
      .int()
      .min(1)
      .default(10 * 1024 * 1024),
    ATTACHMENT_URL_TTL_SECONDS: z.coerce.number().int().min(30).max(3600).default(300),

    /** URL pública do front: base do QR code das etiquetas (`{PUBLIC_WEB_URL}/rastreio/{token}`). */
    PUBLIC_WEB_URL: z
      .url()
      .default('http://localhost:5173')
      .transform((value) => value.replace(/\/+$/, '')),

    /** Tópico SNS dos avisos (recall, validade). Sem ele, os avisos vão só para o log. */
    SNS_TOPIC_ARN: z.string().startsWith('arn:').optional(),
    /** State machine do recall (Step Functions). Sem ela, o workflow roda no próprio processo. */
    RECALL_STATE_MACHINE_ARN: z.string().startsWith('arn:').optional(),
    /** Janela padrão do alerta de validade, em dias. */
    ALERT_EXPIRY_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  })
  .superRefine((env, ctx) => {
    if (env.AUTH_MODE === 'mock' && env.NODE_ENV === 'production') {
      ctx.addIssue({
        code: 'custom',
        path: ['AUTH_MODE'],
        message: 'mock authentication is forbidden when NODE_ENV=production',
      });
    }
    if (env.NODE_ENV === 'production' && env.CORS_ORIGINS.includes('*')) {
      ctx.addIssue({
        code: 'custom',
        path: ['CORS_ORIGINS'],
        message: 'wildcard origin is forbidden when NODE_ENV=production',
      });
    }
    if (env.AUTH_MODE === 'cognito') {
      for (const key of ['COGNITO_REGION', 'COGNITO_USER_POOL_ID'] as const) {
        if (!env[key]) {
          ctx.addIssue({ code: 'custom', path: [key], message: 'required when AUTH_MODE=cognito' });
        }
      }
    }
    if (Boolean(env.S3_ACCESS_KEY_ID) !== Boolean(env.S3_SECRET_ACCESS_KEY)) {
      ctx.addIssue({
        code: 'custom',
        path: ['S3_SECRET_ACCESS_KEY'],
        message: 'S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY must be set together',
      });
    }
  })
  .transform((env) => ({
    ...env,
    SWAGGER_ENABLED: env.SWAGGER_ENABLED ?? env.NODE_ENV !== 'production',
  }));

export type Env = z.infer<typeof envSchema>;

/** Configurações aceitas mas suspeitas em produção: avisam no boot, sem impedir a subida. */
export function productionWarnings(env: Env): string[] {
  if (env.NODE_ENV !== 'production') return [];
  const warnings: string[] = [];
  const local = env.CORS_ORIGINS.filter((origin) => /localhost|127\.0\.0\.1/.test(origin));
  if (local.length) {
    warnings.push(`CORS_ORIGINS contains local origins in production: ${local.join(', ')}`);
  }
  if (env.SWAGGER_ENABLED) warnings.push('SWAGGER_ENABLED=true in production exposes /docs');
  if (env.TRUST_PROXY === 0) {
    warnings.push('TRUST_PROXY=0 in production: set 1 behind API Gateway/ALB');
  }
  if (env.RATE_LIMIT_STORE === 'memory') {
    warnings.push('RATE_LIMIT_STORE=memory in production: each instance counts on its own');
  }
  return warnings;
}

/** Usado pelo ConfigModule: falha no boot com uma mensagem legível se o ambiente for inválido. */
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Invalid environment variables:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
