import { defineConfig, devices } from '@playwright/test';

/**
 * Testes de navegador contra a aplicação de verdade: API (login simulado) + build do front + Postgres
 * com o seed. Na CI tudo sobe no próprio job (`.github/workflows/ci.yml`); localmente, suba a API e o
 * front e rode `pnpm e2e` (`E2E_CHANNEL=chrome` usa o Chrome instalado em vez do Chromium baixado).
 */
const webUrl = process.env['E2E_WEB_URL'] ?? 'http://localhost:4173';
const channel = process.env['E2E_CHANNEL'];

export default defineConfig({
  testDir: './tests',
  // Os testes criam dados no mesmo banco: em série, um arquivo por vez.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env['CI'] ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: webUrl,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...(channel && { channel }),
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'] },
      // No celular, só a varredura de telas (layout); os fluxos rodam no desktop.
      testMatch: /smoke\.spec\.ts/,
    },
  ],
});
