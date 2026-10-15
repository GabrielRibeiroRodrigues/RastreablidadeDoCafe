import createClient, { type Client, type Middleware } from 'openapi-fetch';
import { getEnv } from '@/config/env';
import { ApiError, networkError, toApiError } from './api';
import type { paths } from '@traceflow/shared';

export type ApiClient = Client<paths>;

export interface ApiClientOptions {
  baseUrl: string;
  /** Token atual (lido a cada requisição, para refletir login/logout). */
  getAccessToken: () => string | null;
  /** Chamado quando uma requisição autenticada recebe 401 (token expirado ou revogado). */
  onUnauthorized?: (error: ApiError) => void;
}

const REQUEST_ID_HEADER = 'x-request-id';

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

/**
 * Middleware de autenticação e erros:
 * - injeta `Authorization: Bearer`, `x-request-id` e `Accept`;
 * - respostas não-2xx viram `ApiError` (problem+json) lançado — quem chama só trata sucesso;
 * - falha de rede vira `ApiError` com `status: 0` (cancelamentos passam intactos).
 */
function apiMiddleware({ baseUrl, getAccessToken, onUnauthorized }: ApiClientOptions): Middleware {
  return {
    onRequest({ request }) {
      request.headers.set(REQUEST_ID_HEADER, crypto.randomUUID());
      request.headers.set('Accept', 'application/json, application/problem+json');
      const token = getAccessToken();
      if (token) request.headers.set('Authorization', `Bearer ${token}`);
      return request;
    },

    async onResponse({ request, response }) {
      if (response.ok) return undefined;
      const error = await toApiError(response, request.headers.get(REQUEST_ID_HEADER) ?? '');
      if (error.status === 401 && request.headers.has('Authorization')) onUnauthorized?.(error);
      throw error;
    },

    onError({ request, error }) {
      if (isAbortError(error) || error instanceof ApiError) return undefined;
      return networkError(baseUrl, request.headers.get(REQUEST_ID_HEADER) ?? '', error);
    },
  };
}

/** Cliente HTTP tipado pelo contrato OpenAPI (`@traceflow/shared`). */
export function createApiClient(options: ApiClientOptions): ApiClient {
  const client = createClient<paths>({
    baseUrl: options.baseUrl,
    // Resolve `fetch` a cada chamada (permite que os testes o substituam depois da criação).
    fetch: (request) => globalThis.fetch(request),
  });
  client.use(apiMiddleware(options));
  return client;
}

/** Sessão usada pelo cliente compartilhado; o `AuthProvider` mantém estes valores. */
export const apiSession: {
  accessToken: string | null;
  onUnauthorized: ((error: ApiError) => void) | null;
} = { accessToken: null, onUnauthorized: null };

let shared: ApiClient | undefined;

/** Cliente compartilhado pela aplicação (criado na primeira chamada). */
export function getApiClient(): ApiClient {
  shared ??= createApiClient({
    baseUrl: getEnv().apiUrl,
    getAccessToken: () => apiSession.accessToken,
    onUnauthorized: (error) => apiSession.onUnauthorized?.(error),
  });
  return shared;
}

/**
 * Devolve o `data` de uma chamada do openapi-fetch. Erros HTTP já são lançados pelo
 * middleware; aqui só sobra o caso (defensivo) de uma resposta de erro sem lançamento.
 */
export async function unwrap<T>(
  call: Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<T> {
  const { data, error, response } = await call;
  if (error !== undefined || !response.ok) {
    throw new ApiError(
      { type: 'about:blank', title: `Erro HTTP ${response.status}`, status: response.status },
      '',
    );
  }
  return data as T;
}
