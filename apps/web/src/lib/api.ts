import { z } from 'zod';
import { formatQuantityRaw } from './quantity';

/**
 * Modelo de erro da API: RFC 9457 (`application/problem+json`). As chamadas em si
 * ficam em `api-client.ts` (openapi-fetch tipado pelo contrato gerado).
 */

// `looseObject`: os campos extras (extensões do RFC 9457, ex.: `available`) são mantidos.
const problemSchema = z.looseObject({
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
  /** Campos extras do problema (ex.: `{ available: '40.000', location: 'ARM-01' }`). */
  readonly extensions: Record<string, unknown>;

  constructor(problem: ProblemDetails, requestId: string, options?: ErrorOptions) {
    super(problem.detail ?? problem.title, options);
    this.name = 'ApiError';
    this.status = problem.status;
    this.type = problem.type;
    this.title = problem.title;
    this.detail = problem.detail;
    this.errors = problem.errors ?? [];
    this.requestId = problem.requestId ?? requestId;
    const {
      type: _t,
      title: _ti,
      status: _s,
      detail: _d,
      instance: _i,
      errors: _e,
      ...rest
    } = problem;
    const { requestId: _r, ...extensions } = rest;
    this.extensions = extensions;
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

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

/** Problemas de domínio (campo `type` do RFC 9457) com mensagem própria em pt-BR. */
const PROBLEM_MESSAGES: Record<string, (error: ApiError) => string> = {
  '/problems/insufficient-stock': ({ extensions: ext }) =>
    `Saldo insuficiente em ${text(ext.location) || 'origem'}: disponível ${formatQuantityRaw(
      text(ext.available) || '0',
    )}`,
  '/problems/lot-not-movable': ({ extensions: ext, detail }) => {
    // A extensão `status` da API colide com o status HTTP do RFC 9457 e se perde; o status do
    // lote é lido de `lotStatus` (se vier) ou do `detail` ("Lot X is BLOCKED and ...").
    const lotStatus = text(ext.lotStatus) || /\bis (QUARANTINE|BLOCKED)\b/.exec(detail ?? '')?.[1];
    if (lotStatus === 'BLOCKED') return 'Lote bloqueado não pode ser movimentado.';
    if (lotStatus === 'QUARANTINE') {
      return 'Lote em quarentena não pode ser movimentado (só para um local de quarentena).';
    }
    return 'Lote em quarentena/bloqueado não pode ser movimentado.';
  },
  '/problems/already-reversed': () => 'Esta movimentação já foi estornada.',
  '/problems/invalid-reversal': () =>
    'Um estorno não pode ser estornado; lance uma nova movimentação.',
  '/problems/idempotency-key-reused': () =>
    'Esta operação já foi enviada com outros dados. Recarregue a página e tente de novo.',
  '/problems/invalid-movement': ({ detail }) =>
    /adjustment requires a reason/i.test(detail ?? '')
      ? 'Informe o motivo do ajuste.'
      : /different locations/i.test(detail ?? '')
        ? 'Origem e destino devem ser locais diferentes.'
        : /exactly one/i.test(detail ?? '')
          ? 'O ajuste deve ter só origem (perda) ou só destino (sobra).'
          : 'Movimentação inválida: confira origem, destino e quantidade.',
  '/problems/lot-consumed': () => 'Lote consumido (sem saldo): o status não pode ser alterado.',
  '/problems/inactive-product': () => 'O produto está inativo.',
  '/problems/inactive-location': () => 'O local de destino está inativo.',
  '/problems/invalid-production': ({ detail }) => translateProductionDetail(detail ?? ''),
  '/problems/invalid-shipment': ({ detail }) =>
    /only once/i.test(detail ?? '')
      ? 'Cada par (lote, local) só pode aparecer uma vez na expedição: some as quantidades.'
      : `Expedição inválida: ${detail ?? 'confira os itens.'}`,
  '/problems/inactive-customer': () => 'O cliente está inativo e não pode receber expedições.',
  '/problems/recall-already-open': ({ extensions: ext }) =>
    `Este lote já tem um recall em andamento${text(ext.recall) ? ` (${text(ext.recall)})` : ''}: encerre-o antes de abrir outro.`,
  '/problems/lot-under-recall': ({ extensions: ext }) =>
    `${text(ext.lot) ? `O lote ${text(ext.lot)}` : 'O lote'} está num recall em andamento${text(ext.recall) ? ` (${text(ext.recall)})` : ''} e não pode voltar a Disponível.`,
  '/problems/recall-not-startable': () =>
    'Só recalls abertos ou com falha podem ser executados. Recarregue a página.',
  '/problems/recall-not-closable': () =>
    'Só recalls concluídos ou com falha podem ser encerrados. Recarregue a página.',
  '/problems/recall-report-unavailable': () =>
    'O relatório deste recall ainda não foi gerado (etapa pendente, com falha ou ignorada).',
  '/problems/non-conformity-not-open': () =>
    'Esta não conformidade já foi resolvida. Recarregue a página.',
  '/problems/invalid-import': ({ detail, extensions: ext }) =>
    /empty/i.test(detail ?? '')
      ? 'O arquivo está vazio: a primeira linha deve ser o cabeçalho.'
      : `CSV malformado${typeof ext.line === 'number' ? ` na linha ${ext.line}` : ''}: confira aspas e separadores.`,
  '/problems/import-too-large': () => 'O arquivo tem mais de 5.000 linhas: divida-o em partes.',
};

const STAGE_TEXT: Record<string, string> = {
  PROCESSING: 'Beneficiamento',
  ROASTING: 'Torra',
  BLENDING: 'Blend',
  PACKAGING: 'Embalagem',
};
const TYPE_TEXT: Record<string, string> = {
  GREEN: 'café verde',
  ROASTED: 'torrado',
  BLEND: 'blend',
  PACKAGING: 'embalagem',
};
const typeList = (text: string): string =>
  text
    .split(/,\s*|\s+or\s+/)
    .map((type) => TYPE_TEXT[type.trim()] ?? type.trim())
    .join(', ');

/** `detail` de `/problems/invalid-production` (em inglês) → pt-BR; desconhecido sai como veio. */
function translateProductionDetail(detail: string): string {
  let m = /Output \(([\d.,]+) kg\) cannot exceed the input mass \(([\d.,]+) kg\)/i.exec(detail);
  if (m) {
    return `A massa de saída (${formatQuantityRaw(m[1] ?? '')} kg) não pode exceder a de entrada (${formatQuantityRaw(m[2] ?? '')} kg).`;
  }
  m = /^(\w+) must produce (.+), not (\w+)\.?$/.exec(detail);
  if (m) {
    return `${STAGE_TEXT[m[1] ?? ''] ?? m[1]} deve gerar ${typeList(m[2] ?? '')}, não ${TYPE_TEXT[m[3] ?? ''] ?? m[3]}.`;
  }
  m = /^(\w+) consumes (.+); lot (\S+) is (\w+)\.?$/.exec(detail);
  if (m) {
    return `${STAGE_TEXT[m[1] ?? ''] ?? m[1]} consome ${typeList(m[2] ?? '')}; o lote ${m[3]} é ${TYPE_TEXT[m[4] ?? ''] ?? m[4]}.`;
  }
  m = /^Product (\S+) is inactive/.exec(detail);
  if (m) return `O produto ${m[1]} está inativo.`;
  if (/only once in inputs/i.test(detail)) {
    return 'Cada par (lote, local) só pode aparecer uma vez nos insumos.';
  }
  return detail || 'Ordem de produção inválida.';
}

/** Mensagem amigável (pt-BR) para exibir em toasts e alertas. */
export function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const byType = PROBLEM_MESSAGES[error.type];
    if (byType) return byType(error);
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
      case 413:
        return 'Arquivo grande demais para o envio.';
      case 415:
        return 'Formato de arquivo não aceito.';
      case 429:
        return 'Muitas requisições em pouco tempo. Aguarde um instante e tente de novo.';
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
