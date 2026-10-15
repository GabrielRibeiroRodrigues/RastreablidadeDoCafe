import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { fakeJwt } from '@/test/fake-jwt';
import { renderApp } from '@/test/render-app';
import { createMockStrategy, type DevUser } from './strategies/mock';
import type { AuthStrategy } from './types';

const DEV_USERS: DevUser[] = [
  {
    email: 'ana@serraazul.com.br',
    name: 'Ana Torres',
    roles: ['admin'],
    companyName: 'Café Serra Azul',
  },
  {
    email: 'bruno@serraazul.com.br',
    name: 'Bruno Lima',
    roles: ['auditor'],
    companyName: 'Café Serra Azul',
  },
];

const futureExp = () => Math.floor(Date.now() / 1000) + 3600;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Simula a API de desenvolvimento (`/v1/dev/users` e `/v1/dev/token`). */
function urlOf(input: Parameters<typeof fetch>[0]): string {
  return input instanceof Request ? input.url : input.toString();
}

function stubDevApi() {
  const fetchMock = vi.fn<typeof fetch>((input, init) => {
    const url = urlOf(input);
    if (url.endsWith('/v1/dev/users')) return Promise.resolve(json(DEV_USERS));
    if (url.endsWith('/v1/dev/token') && init?.method === 'POST') {
      const token = fakeJwt({ sub: 'user-ana', 'cognito:groups': ['admin'], exp: futureExp() });
      return Promise.resolve(json({ accessToken: token, expiresIn: 3600 }));
    }
    return Promise.resolve(json({ title: 'Not Found', status: 404 }, 404));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('authentication flow', () => {
  it('redirects protected routes to /login when there is no session', async () => {
    stubDevApi();
    const strategy: AuthStrategy = {
      ...createMockStrategy(),
      restoreSession: () => Promise.resolve(null),
    };

    const { router } = renderApp({ path: '/produtos', strategy });

    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
  });

  it('logs in as a dev user and returns to the requested page', async () => {
    const fetchMock = stubDevApi();
    const user = userEvent.setup();

    const { router } = renderApp({ path: '/fornecedores' });

    await user.click(await screen.findByRole('button', { name: /Ana Torres/ }));

    expect(await screen.findByRole('heading', { name: 'Fornecedores' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/fornecedores');
    expect(screen.getAllByText('Café Serra Azul').length).toBeGreaterThan(0);
    expect(screen.getByText('Administrador')).toBeInTheDocument();

    const tokenCall = fetchMock.mock.calls.find(([url]) => urlOf(url).endsWith('/v1/dev/token'));
    expect(tokenCall?.[1]?.body).toBe(JSON.stringify({ email: 'ana@serraazul.com.br' }));
    expect(window.sessionStorage.getItem('traceflow.auth.session')).toContain('Ana Torres');
  });

  it('shows a clear message when the API is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch')),
    );

    renderApp({ path: '/login' });

    expect(await screen.findByText('API indisponível')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Tentar novamente/ })).toBeInTheDocument();
  });

  it('restores the session from sessionStorage and logs out', async () => {
    stubDevApi();
    window.sessionStorage.setItem(
      'traceflow.auth.session',
      JSON.stringify({
        accessToken: fakeJwt({
          sub: 'user-bruno',
          'cognito:groups': ['auditor'],
          exp: futureExp(),
        }),
        user: {
          id: 'user-bruno',
          email: 'bruno@serraazul.com.br',
          name: 'Bruno Lima',
          roles: ['auditor'],
          companyName: 'Café Serra Azul',
        },
      }),
    );
    const user = userEvent.setup();

    const { router } = renderApp({ path: '/' });

    expect(await screen.findByRole('heading', { name: 'Produtos' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Menu do usuário' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Sair' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(window.sessionStorage.getItem('traceflow.auth.session')).toBeNull();
  });
});
