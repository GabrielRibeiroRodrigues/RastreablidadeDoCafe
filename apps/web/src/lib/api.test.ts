import { describe, expect, it, vi } from 'vitest';
import { ApiError, apiFetch } from './api';

function jsonResponse(body: unknown, status: number, contentType = 'application/json') {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': contentType } });
}

describe('apiFetch', () => {
  it('sends the bearer token and a request id', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ ok: true }, 200));
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiFetch('/v1/products', { accessToken: 'abc' })).resolves.toEqual({ ok: true });

    const [url, init] = fetchMock.mock.calls[0]!;
    const headers = new Headers(init?.headers);
    expect(url).toMatch(/^https?:\/\/[^/]+\/v1\/products$/);
    expect(headers.get('Authorization')).toBe('Bearer abc');
    expect(headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('parses RFC 9457 problem+json into an ApiError', async () => {
    const problem = {
      type: 'https://traceflow.dev/problems/validation',
      title: 'Dados inválidos',
      status: 422,
      detail: 'Um ou mais campos são inválidos.',
      errors: [{ field: 'sku', message: 'SKU já cadastrado' }],
    };
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(jsonResponse(problem, 422, 'application/problem+json')),
    );

    const error = await apiFetch('/v1/products', { method: 'POST', json: {} }).catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 422,
      title: 'Dados inválidos',
      detail: 'Um ou mais campos são inválidos.',
      errors: [{ field: 'sku', message: 'SKU já cadastrado' }],
    });
  });

  it('falls back to the status text when the body is not problem+json', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response('<html>', { status: 502, statusText: 'Bad Gateway' })),
    );

    await expect(apiFetch('/v1/products')).rejects.toMatchObject({
      status: 502,
      title: 'Bad Gateway',
    });
  });

  it('turns network failures into an ApiError with status 0', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch')),
    );

    const error = await apiFetch('/v1/dev/users').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).isNetworkError).toBe(true);
    expect((error as ApiError).title).toBe('Não foi possível conectar à API');
  });
});
