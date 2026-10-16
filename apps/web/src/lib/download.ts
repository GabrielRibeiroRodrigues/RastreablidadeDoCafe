import { getEnv } from '@/config/env';
import { networkError, toApiError, type ApiError } from './api';
import { apiSession } from './api-client';

export interface DownloadResult {
  fileName: string;
  /** `X-Report-Truncated: true`: o arquivo foi cortado no limite de linhas. */
  truncated: boolean;
  /** `X-Report-Rows`, se vier. */
  rows: number | null;
}

/** `attachment; filename="estoque-2026-10-15.csv"` → `estoque-2026-10-15.csv`. */
export function fileNameFrom(disposition: string | null, fallback: string): string {
  if (!disposition) return fallback;
  const star = /filename\*=(?:UTF-8'')?([^;]+)/i.exec(disposition);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].trim().replace(/^"|"$/g, ''));
    } catch {
      // segue para o `filename=` comum
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(disposition);
  return plain?.[1]?.trim() || fallback;
}

/** Entrega um blob ao navegador como download (âncora temporária). */
export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  // Dá tempo ao navegador de iniciar o download antes de liberar a URL.
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Baixa um arquivo autenticado da API (relatórios CSV): `fetch` com o Bearer da sessão, blob e
 * âncora com o nome do `Content-Disposition`. Erros viram `ApiError`, como no cliente tipado.
 */
export async function downloadFromApi(
  path: string,
  query: Record<string, string | undefined>,
  fallbackName: string,
): Promise<DownloadResult> {
  const { apiUrl } = getEnv();
  const url = new URL(path, apiUrl);
  for (const [key, value] of Object.entries(query)) {
    if (value) url.searchParams.set(key, value);
  }
  const requestId = crypto.randomUUID();
  const headers: Record<string, string> = { 'x-request-id': requestId, Accept: 'text/csv' };
  if (apiSession.accessToken) headers.Authorization = `Bearer ${apiSession.accessToken}`;

  let response: Response;
  try {
    response = await fetch(url, { headers });
  } catch (cause) {
    throw networkError(apiUrl, requestId, cause);
  }
  if (!response.ok) {
    const error: ApiError = await toApiError(response, requestId);
    if (error.status === 401) apiSession.onUnauthorized?.(error);
    throw error;
  }

  const blob = await response.blob();
  const fileName = fileNameFrom(response.headers.get('Content-Disposition'), fallbackName);
  saveBlob(blob, fileName);
  const rows = Number.parseInt(response.headers.get('X-Report-Rows') ?? '', 10);
  return {
    fileName,
    truncated: response.headers.get('X-Report-Truncated') === 'true',
    rows: Number.isNaN(rows) ? null : rows,
  };
}
