import { z } from 'zod';
import { getEnv } from '@/config/env';

/**
 * Wrapper mínimo sobre `fetch`. Será substituído (ou embrulhado) pelo cliente
 * `openapi-fetch` gerado a partir do Swagger da API.
 */

const problemSchema = z.object({
  type: z.string().default('about:blank'),
  title: z.string(),
  status: z.number().int(),
  detail: z.string().optional(),
  instance: z.string().optional(),
  errors: z.array(z.object({ field: z.string(), message: z.string() })).optional(),
});

/** Corpo RFC 9457 (`application/problem+json`) devolvido pela API. */
export type ProblemDetails = z.infer<typeof problemSchema>;
export type ProblemFieldError = NonNullable<ProblemDetails['errors']>[number];

export class ApiError extends Error {
  /** HTTP status; `0` quando a requisição nem chegou à API (rede, CORS, API fora do ar). */
  readonly status: number;
  readonly type: string;
  readonly title: string;
  readonly detail: string | undefined;
  readonly errors: ProblemFieldError[];
  readonly requestId: string;

  constructor(problem: ProblemDetails, requestId: string, options?: ErrorOptions) {
    super(problem.detail ?? problem.title, options);
    this.name = 'ApiError';
    this.status = problem.status;
    this.type = problem.type;
    this.title = problem.title;
    this.detail = problem.detail;
    this.errors = problem.errors ?? [];
    this.requestId = requestId;
  }

  get isNetworkError(): boolean {
    return this.status === 0;
  }
}

/** Converte uma resposta de erro em `ApiError`, aceitando corpos que não são problem+json. */
export async function toApiError(response: Response, requestId: string): Promise<ApiError> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }

  const parsed = problemSchema.safeParse(body);
  if (parsed.success) {
    return new ApiError(parsed.data, requestId);
  }

  return new ApiError(
    {
      type: 'about:blank',
      title: response.statusText || `Erro HTTP ${response.status}`,
      status: response.status,
    },
    requestId,
  );
}

export interface ApiRequestOptions extends Omit<RequestInit, 'body'> {
  /** Corpo serializado como JSON. */
  json?: unknown;
  /** Token de acesso; quando presente vai no header `Authorization: Bearer`. */
  accessToken?: string | null;
}

export async function apiFetch<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { json, accessToken, headers: initHeaders, ...init } = options;
  const requestId = crypto.randomUUID();

  const headers = new Headers(initHeaders);
  headers.set('Accept', 'application/json, application/problem+json');
  headers.set('x-request-id', requestId);
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  if (json !== undefined) headers.set('Content-Type', 'application/json');

  let response: Response;
  try {
    response = await fetch(`${getEnv().apiUrl}${path}`, {
      ...init,
      headers,
      body: json === undefined ? undefined : JSON.stringify(json),
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
    throw new ApiError(
      {
        type: 'about:blank',
        title: 'Não foi possível conectar à API',
        status: 0,
        detail: `Verifique se a API está em execução em ${getEnv().apiUrl}.`,
      },
      requestId,
      { cause },
    );
  }

  if (!response.ok) throw await toApiError(response, requestId);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/** Mensagem amigável (pt-BR) para exibir em toasts e alertas. */
export function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.detail ?? error.title;
  if (error instanceof Error) return error.message;
  return 'Ocorreu um erro inesperado.';
}
