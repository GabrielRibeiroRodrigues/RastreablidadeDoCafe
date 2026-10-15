import { z } from 'zod';

/**
 * Modelo de erro da API: RFC 9457 (`application/problem+json`). As chamadas em si
 * ficam em `api-client.ts` (openapi-fetch tipado pelo contrato gerado).
 */

const problemSchema = z.object({
  type: z.string().default('about:blank'),
  title: z.string(),
  status: z.number().int(),
  detail: z.string().optional(),
  instance: z.string().optional(),
  requestId: z.string().optional(),
  errors: z.array(z.object({ field: z.string(), messages: z.array(z.string()) })).optional(),
});

/** Corpo RFC 9457 devolvido pela API. */
export type ProblemDetails = z.infer<typeof problemSchema>;
/** Erro de um campo: `{ field: 'sku', messages: ['must be unique'] }`. */
export type ProblemFieldError = NonNullable<ProblemDetails['errors']>[number];

export class ApiError extends Error {
  /** HTTP status; `0` quando a requisição nem chegou à API (rede, CORS, API fora do ar). */
  readonly status: number;
  readonly type: string;
  readonly title: string;
  readonly detail: string | undefined;
  readonly errors: ProblemFieldError[];
  /** ID de correlação: o devolvido pela API ou, na falta dele, o enviado pelo cliente. */
  readonly requestId: string;

  constructor(problem: ProblemDetails, requestId: string, options?: ErrorOptions) {
    super(problem.detail ?? problem.title, options);
    this.name = 'ApiError';
    this.status = problem.status;
    this.type = problem.type;
    this.title = problem.title;
    this.detail = problem.detail;
    this.errors = problem.errors ?? [];
    this.requestId = problem.requestId ?? requestId;
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

/** `ApiError` para quando a API não respondeu (rede, CORS, API fora do ar). */
export function networkError(apiUrl: string, requestId: string, cause: unknown): ApiError {
  return new ApiError(
    {
      type: 'about:blank',
      title: 'Não foi possível conectar à API',
      status: 0,
      detail: `Verifique se a API está em execução em ${apiUrl}.`,
    },
    requestId,
    { cause },
  );
}

/** Mensagem amigável (pt-BR) para exibir em toasts e alertas. */
export function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.status) {
      case 0:
        return error.detail ?? error.title;
      case 400:
        return 'Alguns campos estão inválidos. Revise o formulário.';
      case 401:
        return 'Sua sessão expirou. Entre novamente.';
      case 403:
        return 'Você não tem permissão para esta ação.';
      case 404:
        return 'Registro não encontrado.';
      case 409:
        return 'Já existe um cadastro com estes dados.';
      default:
        return error.status >= 500
          ? `Erro inesperado na API. Tente novamente em instantes (ID: ${error.requestId}).`
          : (error.detail ?? error.title);
    }
  }
  if (error instanceof Error) return error.message;
  return 'Ocorreu um erro inesperado.';
}

const FIELD_MESSAGES: Array<[RegExp, (match: RegExpMatchArray) => string]> = [
  [/must be unique/i, () => 'Já existe um cadastro com este valor.'],
  [/should not be empty|must not be empty/i, () => 'Campo obrigatório.'],
  [/longer than or equal to (\d+)/i, (m) => `Informe pelo menos ${m[1]} caracteres.`],
  [/shorter than or equal to (\d+)/i, (m) => `Informe no máximo ${m[1]} caracteres.`],
  [/must be one of the following values/i, () => 'Selecione uma opção válida.'],
  [/must be an email/i, () => 'Informe um e-mail válido.'],
  [/valid CPF or CNPJ/i, () => 'CPF ou CNPJ inválido.'],
  [/must not be greater than (\d+)/i, (m) => `O valor máximo é ${m[1]}.`],
  [/must not be less than (\d+)/i, (m) => `O valor mínimo é ${m[1]}.`],
  [/must be an integer/i, () => 'Informe um número inteiro.'],
  [/should not exist/i, () => 'Campo não permitido.'],
];

/**
 * Traduz as mensagens de validação da API (class-validator, em inglês) para a UI.
 * Mensagens desconhecidas são exibidas como vieram.
 */
export function translateFieldMessage(message: string): string {
  for (const [pattern, translate] of FIELD_MESSAGES) {
    const match = message.match(pattern);
    if (match) return translate(match);
  }
  return message;
}
