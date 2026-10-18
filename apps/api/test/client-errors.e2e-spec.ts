import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './support/test-app.js';

/** Erros do navegador: rota pública, corpo truncado, limite próprio. */
describe('Client error reports (e2e)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  afterAll(async () => {
    await testApp.close();
  });

  const report = (body: object) => testApp.http().post('/v1/client-errors').send(body);

  it('accepts a report without login and answers 204', async () => {
    await report({
      kind: 'render',
      message: "Cannot read properties of undefined (reading 'code')",
      stack: 'TypeError: ...\n    at LotDetailPage',
      url: 'https://app.example/lotes/1',
      release: 'abc123',
    }).expect(204);
  });

  it('clips oversized fields instead of rejecting the report', async () => {
    await report({
      kind: 'unhandled',
      message: 'x'.repeat(5000),
      stack: 'y'.repeat(50_000),
    }).expect(204);
  });

  it('rejects unknown kinds and missing messages', async () => {
    await report({ kind: 'other', message: 'oops' }).expect(400);
    await report({ kind: 'render' }).expect(400);
  });

  it('limits reports per IP', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 25; i++) {
      statuses.push((await report({ kind: 'rejection', message: `erro ${i}` })).status);
    }
    expect(statuses).toContain(429);
  });
});
