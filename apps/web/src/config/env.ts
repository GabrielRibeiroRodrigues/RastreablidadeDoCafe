import { z } from 'zod';

const baseSchema = z.object({
  VITE_API_URL: z.url().default('http://localhost:3000'),
});

const mockSchema = baseSchema.extend({
  VITE_AUTH_MODE: z.literal('mock'),
});

const cognitoSchema = baseSchema.extend({
  VITE_AUTH_MODE: z.literal('cognito'),
  VITE_COGNITO_AUTHORITY: z.url(),
  VITE_COGNITO_CLIENT_ID: z.string().min(1),
  VITE_COGNITO_REDIRECT_URI: z.url(),
  VITE_COGNITO_LOGOUT_URI: z.url(),
  VITE_COGNITO_DOMAIN: z.url(),
});

const envSchema = z.discriminatedUnion('VITE_AUTH_MODE', [mockSchema, cognitoSchema]);

export type AuthMode = 'mock' | 'cognito';

export interface CognitoConfig {
  authority: string;
  clientId: string;
  redirectUri: string;
  logoutUri: string;
  domain: string;
}

export type AppEnv =
  | { apiUrl: string; authMode: 'mock' }
  | { apiUrl: string; authMode: 'cognito'; cognito: CognitoConfig };

/**
 * Lê e valida as variáveis `VITE_*`. Falha cedo (com mensagem clara) se o modo
 * `cognito` estiver sem configuração. `VITE_AUTH_MODE` vazio assume `mock`.
 */
export function parseEnv(raw: Record<string, unknown>): AppEnv {
  const result = envSchema.safeParse({
    ...raw,
    VITE_API_URL: raw.VITE_API_URL || undefined,
    VITE_AUTH_MODE: raw.VITE_AUTH_MODE || 'mock',
  });

  if (!result.success) {
    const fields = result.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error(`Configuração de ambiente inválida: ${fields}`);
  }

  const env = result.data;
  const apiUrl = env.VITE_API_URL.replace(/\/+$/, '');

  if (env.VITE_AUTH_MODE === 'mock') {
    return { apiUrl, authMode: 'mock' };
  }

  return {
    apiUrl,
    authMode: 'cognito',
    cognito: {
      authority: env.VITE_COGNITO_AUTHORITY,
      clientId: env.VITE_COGNITO_CLIENT_ID,
      redirectUri: env.VITE_COGNITO_REDIRECT_URI,
      logoutUri: env.VITE_COGNITO_LOGOUT_URI,
      domain: env.VITE_COGNITO_DOMAIN.replace(/\/+$/, ''),
    },
  };
}

let cached: AppEnv | undefined;

/** Configuração do app, lida de `import.meta.env` uma única vez. */
export function getEnv(): AppEnv {
  cached ??= parseEnv(import.meta.env);
  return cached;
}
