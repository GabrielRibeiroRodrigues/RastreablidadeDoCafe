import { getEnv } from '@/config/env';

export type ClientErrorKind = 'render' | 'route' | 'unhandled' | 'rejection';

/** No máximo isto por carregamento de página: um erro em loop não vira uma enxurrada. */
const MAX_REPORTS = 10;
const reported = new Set<string>();

function describe(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) {
    return { message: error.message || error.name, ...(error.stack && { stack: error.stack }) };
  }
  return { message: typeof error === 'string' ? error : (JSON.stringify(error) ?? 'unknown') };
}

/**
 * Envia um erro do navegador para a API (`POST /v1/client-errors`), que o registra no log
 * estruturado (CloudWatch). Melhor esforço: nunca lança, ignora duplicados e não roda em testes.
 */
export function reportClientError(kind: ClientErrorKind, error: unknown): void {
  try {
    if (import.meta.env.MODE === 'test') return;
    const { message, stack } = describe(error);
    const fingerprint = `${kind}:${message}`;
    if (reported.has(fingerprint) || reported.size >= MAX_REPORTS) return;
    reported.add(fingerprint);

    const body = JSON.stringify({
      kind,
      message: message.slice(0, 500),
      ...(stack && { stack: stack.slice(0, 4000) }),
      url: window.location.href.slice(0, 500),
      release: import.meta.env.VITE_RELEASE ?? 'dev',
      userAgent: navigator.userAgent.slice(0, 300),
    });
    // keepalive: o envio sobrevive a um reload logo em seguida (ex.: botão "Recarregar").
    void fetch(`${getEnv().apiUrl}/v1/client-errors`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // Relatar erro nunca pode causar outro.
  }
}

/** Erros que escapam de tudo (event handlers, timers, promessas sem catch). */
export function installGlobalErrorReporting(): void {
  window.addEventListener('error', (event) => {
    reportClientError('unhandled', event.error ?? event.message);
  });
  window.addEventListener('unhandledrejection', (event) => {
    reportClientError('rejection', event.reason);
  });
}
