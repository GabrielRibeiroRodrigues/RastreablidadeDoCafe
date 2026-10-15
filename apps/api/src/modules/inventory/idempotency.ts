import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client.js';
import { StockProblems } from '../../common/http/domain-problem.exception.js';

export const IDEMPOTENCY_HEADER = 'idempotency-key';
const KEY_PATTERN = /^[\w.:-]{8,100}$/;

export interface IdempotencyToken {
  key: string;
  hash: string;
}

/**
 * Prepara a idempotência de um POST: valida a chave do header e calcula o hash do corpo.
 * Sem header, a operação simplesmente não é idempotente.
 */
export function idempotencyFor(
  key: string | undefined,
  body: unknown,
): IdempotencyToken | undefined {
  if (key === undefined) return undefined;
  if (!KEY_PATTERN.test(key)) {
    throw new BadRequestException(
      'Idempotency-Key must have 8-100 characters: letters, digits, _ . : -',
    );
  }
  return { key, hash: requestHash(body) };
}

/** SHA-256 do corpo com chaves ordenadas (mesmo conteúdo → mesmo hash, qualquer ordem). */
export function requestHash(body: unknown): string {
  return createHash('sha256').update(stableStringify(body)).digest('hex');
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Mesma chave com outro corpo é erro do cliente; mesma chave e corpo devolve o resultado original. */
export function assertSameRequest(stored: string | null, token: IdempotencyToken): void {
  if (stored !== token.hash) throw StockProblems.idempotencyMismatch();
}

/** Duas requisições simultâneas com a mesma chave: a segunda esbarra no índice único. */
export function isIdempotencyRace(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002' &&
    JSON.stringify(error.meta ?? {}).includes('idempotency_key')
  );
}
