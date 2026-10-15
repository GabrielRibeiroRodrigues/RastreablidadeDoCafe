import { defineConfig } from 'vitest/config';

export default defineConfig({
  // O DI do Nest depende da metadata de decorators; o transformador oxc do Vite a emite.
  oxc: {
    decorator: { legacy: true, emitDecoratorMetadata: true },
  },
  test: {
    environment: 'node',
    restoreMocks: true,
    env: { NODE_ENV: 'test', LOG_LEVEL: 'silent' },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['src/**/*.spec.ts'],
          // URL fictícia: testes unitários nunca abrem conexão.
          env: { DATABASE_URL: 'postgresql://unused:unused@localhost:1/unused' },
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['test/**/*.e2e-spec.ts'],
          // Um Postgres real (Testcontainers) por execução, compartilhado pelos arquivos.
          globalSetup: ['./test/support/global-setup.ts'],
          setupFiles: ['./test/support/setup-env.ts'],
          // Os arquivos compartilham o banco e limpam as tabelas: rodar em série evita interferência.
          fileParallelism: false,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
