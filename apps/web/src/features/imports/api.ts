import type { ApiSchema } from '@traceflow/shared';
import { getEnv } from '@/config/env';
import { networkError, toApiError } from '@/lib/api';
import { apiSession } from '@/lib/api-client';

export type ImportResult = ApiSchema<'ImportResult'>;
export type ImportEntity = ImportResult['entity'];

/** Limite do corpo na API (413 acima disso). */
export const IMPORT_MAX_BYTES = 2 * 1024 * 1024;

export const IMPORT_ENTITY_LABELS: Record<ImportEntity, string> = {
  products: 'Produtos',
  suppliers: 'Fornecedores',
  customers: 'Clientes',
  locations: 'Locais',
};

interface TemplateColumn {
  name: string;
  required?: boolean;
  hint?: string;
}

/** Colunas documentadas em docs/relatorios-importacao.md (nomes iguais aos campos da API). */
export const IMPORT_TEMPLATES: Record<
  ImportEntity,
  { columns: TemplateColumn[]; example: string[]; notes: string }
> = {
  products: {
    columns: [
      { name: 'sku', required: true },
      { name: 'name', required: true },
      { name: 'type', required: true, hint: 'GREEN, ROASTED, BLEND, PACKAGING' },
      { name: 'unit', required: true, hint: 'KG, BAG_60KG, UNIT' },
      { name: 'defaultRoastLevel', hint: 'só ROASTED/BLEND' },
      { name: 'description' },
    ],
    example: ['VRD-CATUAI', 'Café verde Catuaí Vermelho', 'GREEN', 'BAG_60KG', '', 'Safra 2025/26'],
    notes: 'Chave única: sku. Grau de torra só para torrado e blend.',
  },
  suppliers: {
    columns: [
      { name: 'name', required: true },
      { name: 'type', required: true, hint: 'PRODUCER, FARM, COOPERATIVE, TRADER' },
      { name: 'document', hint: 'CPF/CNPJ' },
      { name: 'farmName' },
      { name: 'region' },
      { name: 'city' },
      { name: 'state', hint: 'UF' },
      { name: 'altitudeMeters' },
      { name: 'varieties', hint: 'separadas por |' },
      { name: 'email' },
      { name: 'phone' },
    ],
    example: [
      'José da Silva',
      'PRODUCER',
      '111.222.333-96',
      'Sítio Boa Vista',
      'Sul de Minas',
      'Carmo de Minas',
      'MG',
      '1150',
      'Bourbon Amarelo|Catuaí Vermelho',
      '',
      '',
    ],
    notes: 'Chave única: document. Variedades separadas por "|".',
  },
  customers: {
    columns: [
      { name: 'name', required: true },
      { name: 'document', hint: 'CPF/CNPJ' },
      { name: 'email' },
      { name: 'phone' },
      { name: 'city' },
      { name: 'state', hint: 'UF' },
    ],
    example: [
      'Cafeteria Grão Fino',
      '11.222.333/0001-81',
      'compras@graofino.com.br',
      '11988887777',
      'São Paulo',
      'SP',
    ],
    notes: 'Chave única: document.',
  },
  locations: {
    columns: [
      { name: 'code', required: true },
      { name: 'name', required: true },
      { name: 'type', required: true, hint: 'WAREHOUSE, SILO, ROASTERY, QUARANTINE, SHIPPING' },
      { name: 'description' },
    ],
    example: ['ARM-02', 'Armazém 2', 'WAREHOUSE', 'Galpão dos fundos'],
    notes: 'Chave única: code.',
  },
};

const quote = (cell: string) => (/[;"\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell);

/** Marca UTF-8 no início do arquivo (o Excel reconhece acentos). */
const BOM = String.fromCharCode(0xfeff);

/** Modelo CSV (BOM + `;` + CRLF, como os relatórios): cabeçalho e uma linha de exemplo. */
export function templateCsv(entity: ImportEntity): string {
  const { columns, example } = IMPORT_TEMPLATES[entity];
  const lines = [columns.map((c) => c.name), example].map((row) => row.map(quote).join(';'));
  return `${BOM}${lines.join('\r\n')}\r\n`;
}

/** `POST /v1/imports/{entity}?dryRun=` com o arquivo em multipart (campo `file`). */
export async function runImport(
  entity: ImportEntity,
  file: File,
  dryRun: boolean,
): Promise<ImportResult> {
  const { apiUrl } = getEnv();
  const url = new URL(`/v1/imports/${entity}`, apiUrl);
  url.searchParams.set('dryRun', String(dryRun));
  const requestId = crypto.randomUUID();
  const headers: Record<string, string> = {
    'x-request-id': requestId,
    Accept: 'application/json, application/problem+json',
  };
  if (apiSession.accessToken) headers.Authorization = `Bearer ${apiSession.accessToken}`;
  const body = new FormData();
  body.append('file', file, file.name);

  let response: Response;
  try {
    response = await fetch(url, { method: 'POST', headers, body });
  } catch (cause) {
    throw networkError(apiUrl, requestId, cause);
  }
  if (!response.ok) {
    const error = await toApiError(response, requestId);
    if (error.status === 401) apiSession.onUnauthorized?.(error);
    throw error;
  }
  return (await response.json()) as ImportResult;
}
