import { vi } from 'vitest';

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json',
    },
  });
}

/**
 * Rota simulada: `'GET /v1/products'` ou `'POST /v1/products/:id/deactivate'` → função que
 * recebe a `Request`, a URL e os parâmetros do caminho.
 */
export type MockRoutes = Record<
  string,
  (request: Request, url: URL, params: Record<string, string>) => Response | Promise<Response>
>;

function compile(route: string): { method: string; pattern: RegExp } {
  const [method = '', path = ''] = route.split(' ');
  const source = path.replace(/:(\w+)/g, '(?<$1>[^/]+)');
  return { method, pattern: new RegExp(`^${source}$`) };
}

function toRequest(input: Parameters<typeof fetch>[0], init?: RequestInit): Request {
  return input instanceof Request ? input : new Request(input.toString(), init);
}

/**
 * Substitui o `fetch` global por um roteador simples (método + caminho, sem query string).
 * Rotas não declaradas respondem 404 problem+json. Devolve o mock e as requisições recebidas.
 */
export function mockApi(routes: MockRoutes) {
  const compiled = Object.entries(routes).map(([route, handler]) => ({
    ...compile(route),
    handler,
  }));
  const requests: Request[] = [];
  const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
    const request = toRequest(input, init);
    requests.push(request.clone());
    const url = new URL(request.url);
    for (const { method, pattern, handler } of compiled) {
      const match = method === request.method ? pattern.exec(url.pathname) : null;
      if (match) return handler(request, url, { ...match.groups });
    }
    return json({ type: 'about:blank', title: 'Not Found', status: 404 }, 404);
  });
  vi.stubGlobal('fetch', fetchMock);

  const find = (method: string, pathname: string) =>
    requests.filter((r) => r.method === method && new URL(r.url).pathname === pathname);

  return { fetchMock, requests, find };
}
