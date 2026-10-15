import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Violação de regra de negócio com um `type` próprio (RFC 9457) e campos extras de contexto,
 * ex.: `{ type: '/problems/insufficient-stock', available: '12.500' }`.
 */
export class DomainProblemException extends HttpException {
  constructor(
    readonly problemType: string,
    readonly detail: string,
    status: HttpStatus = HttpStatus.CONFLICT,
    readonly extensions: Record<string, unknown> = {},
  ) {
    super(detail, status);
  }
}

/** Atalhos para os problemas de estoque mais comuns. */
export const StockProblems = {
  insufficientStock: (available: string, requested: string, locationCode: string) =>
    new DomainProblemException(
      '/problems/insufficient-stock',
      `Insufficient stock at ${locationCode}: available ${available}, requested ${requested}.`,
      HttpStatus.CONFLICT,
      { available, requested, location: locationCode },
    ),

  lotNotMovable: (code: string, status: string) =>
    new DomainProblemException(
      '/problems/lot-not-movable',
      `Lot ${code} is ${status} and cannot leave its location.`,
      HttpStatus.CONFLICT,
      { lot: code, status },
    ),

  idempotencyMismatch: () =>
    new DomainProblemException(
      '/problems/idempotency-key-reused',
      'This Idempotency-Key was already used with a different request.',
      HttpStatus.UNPROCESSABLE_ENTITY,
    ),
};
