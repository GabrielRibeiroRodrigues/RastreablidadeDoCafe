import { defineConfig } from 'vitest/config';

export default defineConfig({
  // O DI do Nest depende da metadata de decorators; o transformador oxc do Vite a emite.
  oxc: {
    decorator: { legacy: true, emitDecoratorMetadata: true },
  },
  test: {
    include: ['src/**/*.spec.ts', 'test/**/*.e2e-spec.ts'],
    environment: 'node',
    restoreMocks: true,
    // DATABASE_URL fictícia: o Prisma só conecta na primeira consulta. Testes com banco usam Testcontainers.
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      DATABASE_URL: 'postgresql://unused:unused@localhost:1/unused',
    },
  },
});
