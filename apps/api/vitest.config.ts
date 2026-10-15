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
    env: { NODE_ENV: 'test', LOG_LEVEL: 'silent' },
  },
});
