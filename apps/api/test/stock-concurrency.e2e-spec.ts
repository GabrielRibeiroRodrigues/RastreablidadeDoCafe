import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resetDatabase } from './support/database.js';
import { createScenario, newKey, type Problem, type Scenario } from './support/scenario.js';
import { createTestApp, type TestApp } from './support/test-app.js';

/**
 * Regras do razão que só aparecem sob concorrência (ADR 0007): requisições disparadas ao mesmo
 * tempo contra um Postgres real. O `SELECT ... FOR UPDATE` no lote coloca as transações em fila.
 */
describe('Stock ledger under concurrency (e2e)', () => {
  let testApp: TestApp;
  let s: Scenario;

  const issue = (lotId: string, quantity: string, key?: string) =>
    s.http.post(
      '/v1/movements',
      { type: 'ISSUE', lotId, fromLocationId: s.locations.warehouse.id, quantity },
      'operator',
      key,
    );

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(testApp.prisma);
    s = await createScenario(testApp);
  });

  afterAll(async () => {
    await testApp.close();
  });

  it('accepts only the simultaneous issues that fit the balance (never negative)', async () => {
    const lotId = await s.receive('100');

    // 10 saídas de 15 kg ao mesmo tempo sobre 100 kg: no máximo 6 cabem (90 kg).
    const results = await Promise.all(Array.from({ length: 10 }, () => issue(lotId, '15')));
    const statuses = results.map((res) => res.status);

    expect(statuses.filter((status) => status === 201)).toHaveLength(6);
    expect(statuses.filter((status) => status === 409)).toHaveLength(4);
    for (const res of results.filter((r) => r.status === 409)) {
      expect((res.body as Problem).type).toBe('/problems/insufficient-stock');
    }

    const lot = await s.lot(lotId);
    expect(lot.balance).toBe('10.000');

    // O saldo do razão confere com a soma das linhas gravadas.
    const movements = await testApp.prisma.stockMovement.findMany({ where: { lotId } });
    expect(movements.filter((m) => m.type === 'ISSUE')).toHaveLength(6);
  });

  it('marks the lot CONSUMED exactly once when concurrent issues drain it', async () => {
    const lotId = await s.receive('40');

    const results = await Promise.all(Array.from({ length: 6 }, () => issue(lotId, '10')));
    expect(results.filter((res) => res.status === 201)).toHaveLength(4);

    const lot = await s.lot(lotId);
    expect(lot).toMatchObject({ balance: '0.000', status: 'CONSUMED' });
  });

  it('writes a single movement for simultaneous requests with the same Idempotency-Key', async () => {
    const lotId = await s.receive('100');
    const key = newKey();

    const results = await Promise.all(Array.from({ length: 5 }, () => issue(lotId, '10', key)));

    expect(results.every((res) => res.status === 201)).toBe(true);
    const ids = new Set(results.map((res) => (res.body as { id: string }).id));
    expect(ids.size).toBe(1);
    expect(results.filter((res) => res.headers['idempotent-replayed'] === 'true')).toHaveLength(4);

    expect((await s.lot(lotId)).balance).toBe('90.000');
    const issues = await testApp.prisma.stockMovement.count({ where: { lotId, type: 'ISSUE' } });
    expect(issues).toBe(1);
  });

  it('rejects an Idempotency-Key reused with a different body (422) and writes nothing', async () => {
    const lotId = await s.receive('100');
    const key = newKey();

    await issue(lotId, '10', key).expect(201);
    const reused = await issue(lotId, '20', key);

    expect(reused.status).toBe(422);
    expect((reused.body as Problem).type).toBe('/problems/idempotency-key-reused');
    expect((await s.lot(lotId)).balance).toBe('90.000');
  });

  it('rejects malformed Idempotency-Keys', async () => {
    const lotId = await s.receive('100');
    const res = await issue(lotId, '10', 'short');
    expect(res.status).toBe(400);
  });

  it('reverses a movement only once, even when two reversals race', async () => {
    const lotId = await s.receive('100');
    const issued = await issue(lotId, '30').expect(201);
    const movementId = (issued.body as { id: string }).id;

    const results = await Promise.all(
      Array.from({ length: 3 }, () =>
        s.http.post(`/v1/movements/${movementId}/reverse`, { reason: 'Lançamento duplicado' }),
      ),
    );

    expect(results.filter((res) => res.status === 201)).toHaveLength(1);
    for (const res of results.filter((r) => r.status !== 201)) {
      expect(res.status).toBe(409);
    }
    expect((await s.lot(lotId)).balance).toBe('100.000');
  });

  it('generates unique, sequential lot codes for simultaneous receipts', async () => {
    const ids = await Promise.all(Array.from({ length: 8 }, () => s.receive('10')));
    const codes = await Promise.all(ids.map(async (id) => (await s.lot(id)).code));

    expect(new Set(codes).size).toBe(8);
    const numbers = codes.map((code) => Number(code.split('-').at(-1))).sort((a, b) => a - b);
    expect(numbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('keeps the ledger and the audit trail append-only even for direct SQL', async () => {
    const lotId = await s.receive('100');
    await issue(lotId, '10').expect(201);
    const audits = await testApp.prisma.auditLog.count();
    expect(audits).toBeGreaterThan(0);

    for (const sql of [
      'UPDATE stock_movements SET quantity = 1',
      'DELETE FROM stock_movements',
      "UPDATE audit_logs SET action = 'tampered'",
      'DELETE FROM audit_logs',
    ]) {
      await expect(testApp.prisma.$executeRawUnsafe(sql), sql).rejects.toThrow(/append-only/);
    }
    expect((await s.lot(lotId)).balance).toBe('90.000');
    expect(await testApp.prisma.auditLog.count()).toBe(audits);
  });
});
