import { describe, expect, it, vi } from 'vitest';
import { ApiError } from './api';
import { createApiClient, unwrap } from './api-client';

function jsonResponse(body: unknown, status = 200, contentType = 'application/json') {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': contentType } });
}

function setup(token: string | null = 'abc') {
  const onUnauthorized = vi.fn();
  const client = createApiClient({
    baseUrl: 'http://api.test',
    getAccessToken: () => token,
    onUnauthorized,
  });
  return { client, onUnauthorized };
}

describe('createApiClient', () => {
  it('sends the bearer token, a request id and typed query params', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        jsonResponse({ data: [], meta: { page: 2, pageSize: 20, total: 0, totalPages: 0 } }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const { client } = setup();

    const page = await unwrap(
      client.GET('/v1/customers', { params: { query: { q: 'grão', state: 'SP' } } }),
    );

    expect(page.meta.page).toBe(2);
    const request = fetchMock.mock.calls[0]![0] as Request;
    const url = new URL(request.url);
    expect(url.origin + url.pathname).toBe('http://api.test/v1/customers');
    expect(url.searchParams.get('q')).toBe('grão');
    expect(url.searchParams.get('state')).toBe('SP');
    expect(request.headers.get('Authorization')).toBe('Bearer abc');
    expect(request.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('sends JSON bodies', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ accessToken: 't', expiresIn: 3600 }));
    vi.stubGlobal('fetch', fetchMock);
    const { client } = setup(null);

    await unwrap(client.POST('/v1/dev/token', { body: { email: 'ana@serraazul.dev' } }));

    const request = fetchMock.mock.calls[0]![0] as Request;
    expect(request.method).toBe('POST');
    expect(request.headers.has('Authorization')).toBe(false);
    expect(await request.json()).toEqual({ email: 'ana@serraazul.dev' });
  });

  it('throws non-2xx responses as ApiError with the field errors', async () => {
    const problem = {
      type: 'about:blank',
      title: 'Conflict',
      status: 409,
      detail: 'A record with the same unique value already exists.',
      errors: [{ field: 'sku', messages: ['must be unique'] }],
    };
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(jsonResponse(problem, 409, 'application/problem+json')),
    );
    const { client, onUnauthorized } = setup();

    const error = await client
      .POST('/v1/products', {
        body: { sku: 'VRD-1', name: 'Café', type: 'GREEN', unit: 'KG' },
      })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 409, errors: problem.errors });
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('notifies 401 responses on authenticated requests', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          jsonResponse({ title: 'Unauthorized', status: 401 }, 401, 'application/problem+json'),
        ),
    );
    const { client, onUnauthorized } = setup();

    await expect(client.GET('/v1/me')).rejects.toMatchObject({ status: 401 });
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it('turns network failures into an ApiError with status 0', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed')));
    const { client } = setup();

    const error = await client.GET('/v1/dev/users').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).isNetworkError).toBe(true);
    expect((error as ApiError).title).toBe('Não foi possível conectar à API');
  });
});
