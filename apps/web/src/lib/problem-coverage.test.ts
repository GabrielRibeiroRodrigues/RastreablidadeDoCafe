import { describe, expect, it } from 'vitest';
import { GENERIC_PROBLEMS, TRANSLATED_PROBLEMS } from './api';

/** Código-fonte da API (texto), lido pelo Vite no momento do teste. */
const apiSources = import.meta.glob<string>(
  ['../../../api/src/**/*.ts', '!../../../api/src/**/*.spec.ts', '!../../../api/src/generated/**'],
  { query: '?raw', import: 'default', eager: true },
);

describe('API problem types', () => {
  it('every problem type the API emits has a pt-BR message in the front', () => {
    const emitted = new Set(
      Object.values(apiSources).flatMap((source) =>
        [...source.matchAll(/'(\/problems\/[a-z-]+)'/g)].map((match) => match[1] ?? ''),
      ),
    );

    expect(emitted.size).toBeGreaterThan(10);
    const known = new Set<string>([...TRANSLATED_PROBLEMS, ...GENERIC_PROBLEMS]);
    const missing = [...emitted].filter((type) => !known.has(type)).sort();
    expect(missing, 'adicione a mensagem em PROBLEM_MESSAGES (lib/api.ts)').toEqual([]);
  });
});
