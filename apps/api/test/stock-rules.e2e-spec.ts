import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resetDatabase } from './support/database.js';
import { createScenario, type Problem, type Scenario } from './support/scenario.js';
import { createTestApp, type TestApp } from './support/test-app.js';

/** Regras de direção, status e perfil das movimentações manuais e dos estornos (ADR 0007). */
describe('Stock movement rules (e2e)', () => {
  let testApp: TestApp;
  let s: Scenario;
  let lotId: string;

  const move = (body: object, as: 'admin' | 'operator' | 'auditor' = 'operator') =>
    s.http.post('/v1/movements', { lotId, ...body }, as);
  const setStatus = (status: string, as: 'admin' | 'operator' = 'admin') =>
    s.http.patch(`/v1/lots/${lotId}/status`, { status, reason: 'Teste de regra' }, as);

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(testApp.prisma);
    s = await createScenario(testApp);
    lotId = await s.receive('100');
  });

  afterAll(async () => {
    await testApp.close();
  });

  describe('direction per movement type', () => {
    it.each([
      ['ISSUE without origin', { type: 'ISSUE', quantity: '1' }],
      ['ISSUE with destination', { type: 'ISSUE', quantity: '1', to: 'roastery' }],
      ['TRANSFER without destination', { type: 'TRANSFER', quantity: '1', from: 'warehouse' }],
      [
        'TRANSFER to the same location',
        { type: 'TRANSFER', quantity: '1', from: 'warehouse', to: 'warehouse' },
      ],
      [
        'CONSUMPTION with destination',
        { type: 'CONSUMPTION', quantity: '1', from: 'warehouse', to: 'roastery' },
      ],
    ])('rejects %s (400 invalid-movement)', async (_label, spec) => {
      const { from, to, ...body } = spec as { from?: string; to?: string };
      const id = (key?: string) =>
        key ? s.locations[key as keyof Scenario['locations']].id : undefined;
      const res = await move({ ...body, fromLocationId: id(from), toLocationId: id(to) });

      expect(res.status).toBe(400);
      expect((res.body as Problem).type).toBe('/problems/invalid-movement');
    });

    it('rejects manual RECEIPT, PRODUCTION and REVERSAL types (validation)', async () => {
      for (const type of ['RECEIPT', 'PRODUCTION', 'REVERSAL']) {
        const res = await move({ type, quantity: '1', toLocationId: s.locations.roastery.id });
        expect(res.status, type).toBe(400);
      }
    });

    it('rejects zero and negative quantities', async () => {
      for (const quantity of ['0', '-5']) {
        const res = await move({
          type: 'ISSUE',
          quantity,
          fromLocationId: s.locations.warehouse.id,
        });
        expect(res.status, quantity).toBe(400);
      }
    });

    it('transfers between locations keeping the total balance', async () => {
      await move({
        type: 'TRANSFER',
        quantity: '40',
        fromLocationId: s.locations.warehouse.id,
        toLocationId: s.locations.roastery.id,
      }).expect(201);

      expect((await s.lot(lotId)).balance).toBe('100.000');
      // Saída maior que o saldo do local de origem (60), mesmo com total de 100 no lote.
      const res = await move({
        type: 'ISSUE',
        quantity: '61',
        fromLocationId: s.locations.warehouse.id,
      });
      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({ type: '/problems/insufficient-stock', available: '60.000' });
    });
  });

  describe('adjustments', () => {
    it('are admin-only and require a reason', async () => {
      const loss = { type: 'ADJUSTMENT', quantity: '2', fromLocationId: s.locations.warehouse.id };

      expect((await move({ ...loss, reason: 'Quebra' }, 'operator')).status).toBe(403);
      expect((await move(loss, 'admin')).status).toBe(400);
      await move({ ...loss, reason: 'Quebra na pesagem' }, 'admin').expect(201);
      expect((await s.lot(lotId)).balance).toBe('98.000');
    });

    it('need exactly one side (gain or loss)', async () => {
      const res = await move(
        {
          type: 'ADJUSTMENT',
          quantity: '2',
          reason: 'Inventário',
          fromLocationId: s.locations.warehouse.id,
          toLocationId: s.locations.roastery.id,
        },
        'admin',
      );
      expect(res.status).toBe(400);
    });
  });

  describe('lot status', () => {
    it('blocked lots cannot leave their location', async () => {
      await setStatus('BLOCKED').expect(200);

      const res = await move({
        type: 'ISSUE',
        quantity: '1',
        fromLocationId: s.locations.warehouse.id,
      });
      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({ type: '/problems/lot-not-movable', lotStatus: 'BLOCKED' });
    });

    it('quarantined lots may only move to a quarantine area', async () => {
      await setStatus('QUARANTINE', 'operator').expect(200);

      const toRoastery = await move({
        type: 'TRANSFER',
        quantity: '10',
        fromLocationId: s.locations.warehouse.id,
        toLocationId: s.locations.roastery.id,
      });
      expect(toRoastery.status).toBe(409);

      await move({
        type: 'TRANSFER',
        quantity: '10',
        fromLocationId: s.locations.warehouse.id,
        toLocationId: s.locations.quarantine.id,
      }).expect(201);
    });

    it('only admins can block or release; operators may quarantine', async () => {
      expect((await setStatus('BLOCKED', 'operator')).status).toBe(403);
      await setStatus('QUARANTINE', 'operator').expect(200);
      expect((await setStatus('AVAILABLE', 'operator')).status).toBe(403);
      await setStatus('AVAILABLE').expect(200);
    });

    it('auditors cannot post movements', async () => {
      const res = await move(
        { type: 'ISSUE', quantity: '1', fromLocationId: s.locations.warehouse.id },
        'auditor',
      );
      expect(res.status).toBe(403);
    });

    it('a consumed lot has no settable status', async () => {
      await move({
        type: 'ISSUE',
        quantity: '100',
        fromLocationId: s.locations.warehouse.id,
      }).expect(201);
      expect((await s.lot(lotId)).status).toBe('CONSUMED');

      const res = await setStatus('QUARANTINE');
      expect(res.status).toBe(409);
      expect((res.body as Problem).type).toBe('/problems/lot-consumed');
    });
  });

  describe('reversals', () => {
    const issue = async (quantity: string) =>
      (
        await move({
          type: 'ISSUE',
          quantity,
          fromLocationId: s.locations.warehouse.id,
        }).expect(201)
      ).body as { id: string };

    it('swap origin and destination and keep the original row intact', async () => {
      const original = await issue('30');
      const res = await s.http
        .post(`/v1/movements/${original.id}/reverse`, { reason: 'Saída lançada em dobro' })
        .expect(201);

      expect(res.body).toMatchObject({
        type: 'REVERSAL',
        quantity: '30.000',
        toLocation: expect.objectContaining({ id: s.locations.warehouse.id }) as unknown,
      });
      const stored = await testApp.prisma.stockMovement.findUniqueOrThrow({
        where: { id: original.id },
      });
      expect(stored.type).toBe('ISSUE');
      expect((await s.lot(lotId)).balance).toBe('100.000');
    });

    it('bring a consumed lot back to AVAILABLE', async () => {
      const original = await issue('100');
      expect((await s.lot(lotId)).status).toBe('CONSUMED');

      await s.http
        .post(`/v1/movements/${original.id}/reverse`, { reason: 'Saída indevida' })
        .expect(201);
      expect(await s.lot(lotId)).toMatchObject({ status: 'AVAILABLE', balance: '100.000' });
    });

    it('cannot be reversed twice, nor can a reversal be reversed', async () => {
      const original = await issue('10');
      const reversal = (
        await s.http.post(`/v1/movements/${original.id}/reverse`, { reason: 'Erro' }).expect(201)
      ).body as { id: string };

      const again = await s.http.post(`/v1/movements/${original.id}/reverse`, { reason: 'Erro' });
      expect(again.status).toBe(409);
      expect((again.body as Problem).type).toBe('/problems/already-reversed');

      const ofReversal = await s.http.post(`/v1/movements/${reversal.id}/reverse`, {
        reason: 'Erro',
      });
      expect(ofReversal.status).toBe(409);
      expect((ofReversal.body as Problem).type).toBe('/problems/invalid-reversal');
    });

    it('cannot reverse a receipt whose stock has already left', async () => {
      const receipt = await testApp.prisma.stockMovement.findFirstOrThrow({
        where: { lotId, type: 'RECEIPT' },
      });
      await issue('50');

      const res = await s.http.post(`/v1/movements/${receipt.id}/reverse`, {
        reason: 'NF cancelada',
      });
      expect(res.status).toBe(409);
      expect((res.body as Problem).type).toBe('/problems/insufficient-stock');
      expect((await s.lot(lotId)).balance).toBe('50.000');
    });

    it('are admin-only', async () => {
      const original = await issue('10');
      const res = await s.http.post(
        `/v1/movements/${original.id}/reverse`,
        { reason: 'Erro' },
        'operator',
      );
      expect(res.status).toBe(403);
    });
  });
  describe('dates', () => {
    const tomorrow = () => new Date(Date.now() + 86_400_000).toISOString();

    it('refuses operations dated in the future, in the field', async () => {
      const receipt = await s.http.post('/v1/receipts', {
        productId: s.products.green.id,
        locationId: s.locations.warehouse.id,
        quantity: '10',
        receivedAt: tomorrow(),
      });
      expect(receipt.status).toBe(400);
      expect(receipt.body).toMatchObject({ errors: [{ field: 'receivedAt' }] });

      const issue = await move({
        type: 'ISSUE',
        fromLocationId: s.locations.warehouse.id,
        quantity: '1',
        occurredAt: tomorrow(),
      });
      expect(issue.status).toBe(400);
      expect(issue.body).toMatchObject({ errors: [{ field: 'occurredAt' }] });
    });

    it('refuses a movement dated before the lot existed', async () => {
      const res = await move({
        type: 'ISSUE',
        fromLocationId: s.locations.warehouse.id,
        quantity: '1',
        occurredAt: '2020-01-01T12:00:00.000Z',
      });
      expect(res.status).toBe(400);
      expect((res.body as Problem).type).toBe('/problems/invalid-movement');
      expect((await s.lot(lotId)).balance).toBe('100.000');
    });

    it('still accepts a backdated receipt (loading past history)', async () => {
      const res = await s.http.post('/v1/receipts', {
        productId: s.products.green.id,
        locationId: s.locations.warehouse.id,
        quantity: '10',
        receivedAt: '2025-06-01T12:00:00.000Z',
      });
      expect(res.status).toBe(201);
      expect((res.body as { code: string }).code).toMatch(/-2025-/);
    });
  });
});
