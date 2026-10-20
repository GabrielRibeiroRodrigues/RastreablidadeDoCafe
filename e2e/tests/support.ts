import { expect, test as base, type Page } from '@playwright/test';

export const API_URL = process.env['E2E_API_URL'] ?? 'http://localhost:3000';

/** Usuários do seed (`apps/api/prisma/seed.ts`). */
export const USERS = {
  admin: { email: 'ana@serraazul.dev', name: 'Ana Ribeiro' },
  operator: { email: 'bruno@serraazul.dev', name: 'Bruno Costa' },
  auditor: { email: 'carla@serraazul.dev', name: 'Carla Mendes' },
} as const;
export type UserKey = keyof typeof USERS;

/** Entra pela tela de login simulado e espera sair dela. */
export async function login(page: Page, user: UserKey = 'admin'): Promise<void> {
  await page.goto('/login');
  await page.getByRole('button', { name: new RegExp(USERS[user].email) }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}

/** Token do emissor simulado, para preparar dados pela API sem passar pela interface. */
export async function apiToken(user: UserKey = 'admin'): Promise<string> {
  const res = await fetch(`${API_URL}/v1/dev/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: USERS[user].email }),
  });
  expect(res.ok, `dev token for ${user}`).toBe(true);
  return ((await res.json()) as { accessToken: string }).accessToken;
}

export async function api<T>(path: string, init: RequestInit = {}, user: UserKey = 'admin') {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${await apiToken(user)}`,
      'content-type': 'application/json',
      ...init.headers,
    },
  });
  if (!res.ok)
    throw new Error(`${init.method ?? 'GET'} ${path} → ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

/** Primeiro registro de uma listagem paginada. */
export async function first<T extends { id: string }>(path: string): Promise<T> {
  const page = await api<{ data: T[] }>(path);
  const item = page.data[0];
  if (!item) throw new Error(`no data at ${path}`);
  return item;
}

/**
 * `test` com vigilância de erros: falha se a página registrar erro no console, exceção não tratada
 * ou resposta 5xx da API. Erros 4xx esperados pelo teste vão em `allowConsole`.
 */
export const test = base.extend<{ watch: { allowConsole: RegExp[] } }>({
  watch: [
    async ({ page }, use) => {
      const watch = { allowConsole: [] as RegExp[] };
      const problems: string[] = [];
      page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
      page.on('console', (message) => {
        if (message.type() !== 'error') return;
        const text = message.text();
        if (!watch.allowConsole.some((pattern) => pattern.test(text))) {
          problems.push(`console: ${text}`);
        }
      });
      page.on('response', (response) => {
        if (response.status() >= 500 && response.url().startsWith(API_URL)) {
          problems.push(`http ${response.status()} ${response.url()}`);
        }
      });
      await use(watch);
      expect(problems, 'erros na página').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
