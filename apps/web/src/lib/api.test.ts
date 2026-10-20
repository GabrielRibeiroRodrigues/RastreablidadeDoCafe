import { describe, expect, it } from 'vitest';
import { ApiError, getErrorMessage, toApiError, translateFieldMessage } from './api';

function problemResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/problem+json' },
  });
}

describe('toApiError', () => {
  it('parses RFC 9457 problem+json with field errors as message arrays', async () => {
    const error = await toApiError(
      problemResponse(
        {
          type: '/problems/validation-error',
          title: 'Validation error',
          status: 400,
          detail: 'One or more fields are invalid.',
          instance: '/v1/products',
          requestId: 'from-api',
          errors: [{ field: 'sku', messages: ['must be unique', 'other'] }],
        },
        400,
      ),
      'from-client',
    );

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 400,
      type: '/problems/validation-error',
      requestId: 'from-api',
      errors: [{ field: 'sku', messages: ['must be unique', 'other'] }],
    });
  });

  it('falls back to the status text when the body is not problem+json', async () => {
    const error = await toApiError(
      new Response('<html>', { status: 502, statusText: 'Bad Gateway' }),
      'req-1',
    );
    expect(error).toMatchObject({ status: 502, title: 'Bad Gateway', requestId: 'req-1' });
  });
});

describe('getErrorMessage', () => {
  const error = (status: number) => new ApiError({ type: 'x', title: 'T', status }, 'req-9');

  it.each([
    [403, 'Você não tem permissão para esta ação.'],
    [404, 'Registro não encontrado.'],
    [409, 'Já existe um cadastro com estes dados.'],
  ])('translates status %i', (status, message) => {
    expect(getErrorMessage(error(status))).toBe(message);
  });

  it('includes the request id on server errors', () => {
    expect(getErrorMessage(error(500))).toContain('req-9');
  });

  const problem = (body: Record<string, unknown>) =>
    new ApiError({ title: 'Conflict', status: 409, ...body } as never, 'req-1');

  it('shows stock quantities the Portuguese way, without trailing zeros', () => {
    expect(
      getErrorMessage(
        problem({ type: '/problems/insufficient-stock', available: '12.000', location: 'ARM-01' }),
      ),
    ).toBe('Saldo insuficiente em ARM-01: disponível 12');
  });

  it('explains a movement dated before its lot existed', () => {
    expect(
      getErrorMessage(
        problem({
          type: '/problems/invalid-movement',
          status: 400,
          detail: 'Movement date is before lot CAF-2026-000001 was received or produced.',
          lot: 'CAF-2026-000001',
        }),
      ),
    ).toBe('A data não pode ser anterior ao recebimento (ou à produção) do lote CAF-2026-000001.');
  });
});

describe('translateFieldMessage', () => {
  it.each([
    ['must be unique', 'Já existe um cadastro com este valor.'],
    ['name must be longer than or equal to 2 characters', 'Informe pelo menos 2 caracteres.'],
    ['document must be a valid CPF or CNPJ', 'CPF ou CNPJ inválido.'],
    ['occurredAt cannot be in the future', 'A data não pode estar no futuro.'],
    ['something new', 'something new'],
  ])('%s', (input, expected) => {
    expect(translateFieldMessage(input)).toBe(expected);
  });
});
