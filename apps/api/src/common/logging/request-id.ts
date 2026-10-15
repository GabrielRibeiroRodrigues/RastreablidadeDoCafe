import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

export const REQUEST_ID_HEADER = 'x-request-id';

// Aceita IDs vindos de fora (API Gateway, front) apenas se forem seguros para logar.
const SAFE_REQUEST_ID = /^[\w-]{8,128}$/;

/** Reaproveita o x-request-id recebido (se válido) ou gera um UUID, e o devolve no header de resposta. */
export function resolveRequestId(req: IncomingMessage, res: ServerResponse): string {
  const incoming = req.headers[REQUEST_ID_HEADER];
  const id =
    typeof incoming === 'string' && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
  res.setHeader(REQUEST_ID_HEADER, id);
  return id;
}
