import type { ApiSchema } from '@traceflow/shared';
import { getEnv } from '@/config/env';
import { createApiClient, unwrap, type ApiClient } from '@/lib/api-client';

export type PublicTrace = ApiSchema<'PublicTraceResponse'>;
export type PublicTraceStep = ApiSchema<'PublicTraceStep'>;
export type PublicOrigin = ApiSchema<'PublicOriginResponse'>;

let client: ApiClient | undefined;

/**
 * Cliente próprio da página pública: nunca envia o token de quem estiver logado e, por isso, um
 * erro aqui nunca encerra a sessão nem leva ao login (o `onUnauthorized` não é configurado).
 */
function publicClient(): ApiClient {
  client ??= createApiClient({ baseUrl: getEnv().apiUrl, getAccessToken: () => null });
  return client;
}

export const publicTraceApi = {
  get: (token: string, signal?: AbortSignal) =>
    unwrap(
      publicClient().GET('/v1/public/trace/{token}', {
        params: { path: { token } },
        ...(signal ? { signal } : {}),
      }),
    ),
};
