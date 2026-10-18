import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resetDatabase } from './support/database.js';
import { createScenario, type Scenario } from './support/scenario.js';
import { createTestApp, type TestApp } from './support/test-app.js';

interface Totals {
  production: { orders: number; inputKg: string; outputKg: string; yieldPercent: number | null };
  shipments: { count: number; customers: number };
}
interface Performance {
  days: number;
  bucket: string;
  current: Totals;
  previous: Totals;
  yieldSeries: Array<{ orders: number; yieldPercent: number | null }>;
  turnover: Array<{
    productId: string;
    outflow: string;
    balance: string;
    coverageDays: number | null;
  }>;
}

/** Painel por período: totais, comparação com o período anterior, série e giro. */
describe('Dashboard performance (e2e)', () => {
  let testApp: TestApp;
  let s: Scenario;

  const performance = async (days?: number) =>
    (await s.http.get(`/v1/dashboard/performance${days ? `?days=${days}` : ''}`).expect(200))
      .body as Performance;

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

  it('sums production and shipments and compares with the previous period', async () => {
    const green = await s.receive('300');
    const roasted = await s.produce(
      [{ lotId: green, locationId: s.locations.warehouse.id, quantity: '100' }],
      '80',
    );
    await s.produce(
      [{ lotId: green, locationId: s.locations.warehouse.id, quantity: '100' }],
      '84',
    );
    // Uma ordem "antiga" cai no período anterior.
    const old = await s.produce(
      [{ lotId: green, locationId: s.locations.warehouse.id, quantity: '100' }],
      '70',
    );
    await testApp.prisma.$executeRaw`
      UPDATE production_orders SET performed_at = now() - interval '45 days'
      WHERE output_lot_id = ${old}::uuid`;
    await s.ship(roasted, '30');

    const result = await performance(30);

    expect(result).toMatchObject({ days: 30, bucket: 'week' });
    expect(result.current.production).toMatchObject({
      orders: 2,
      inputKg: '200.000',
      outputKg: '164.000',
      yieldPercent: 82,
    });
    expect(result.current.shipments).toEqual({ count: 1, customers: 1 });
    expect(result.previous.production).toMatchObject({ orders: 1, yieldPercent: 70 });
    expect(result.previous.shipments.count).toBe(0);
    expect(result.yieldSeries.reduce((sum, b) => sum + b.orders, 0)).toBe(2);
  });

  it('computes turnover net of reversals, with days of coverage', async () => {
    const green = await s.receive('100');
    const issue = await s.http
      .post('/v1/movements', {
        type: 'ISSUE',
        lotId: green,
        fromLocationId: s.locations.warehouse.id,
        quantity: '40',
      })
      .expect(201);
    await s.http
      .post('/v1/movements', {
        type: 'ISSUE',
        lotId: green,
        fromLocationId: s.locations.warehouse.id,
        quantity: '10',
      })
      .expect(201);
    // O estorno de 40 cancela essa saída: sobram 10 de saída e 90 de saldo.
    await s.http
      .post(`/v1/movements/${(issue.body as { id: string }).id}/reverse`, { reason: 'Erro' })
      .expect(201);

    const [turnover] = (await performance(30)).turnover;
    expect(turnover).toMatchObject({
      productId: s.products.green.id,
      outflow: '10.000',
      balance: '90.000',
      coverageDays: 270,
    });
  });

  it('uses monthly buckets for long periods and validates the period', async () => {
    expect((await performance(365)).bucket).toBe('month');
    expect((await s.http.get('/v1/dashboard/performance?days=7')).status).toBe(400);
    expect((await performance()).days).toBe(30);
  });

  it('only counts the requesting company', async () => {
    const other = await createScenario(testApp, 'Outra Empresa');
    const green = await other.receive('100');
    await other.produce(
      [{ lotId: green, locationId: other.locations.warehouse.id, quantity: '50' }],
      '40',
    );

    const result = await performance(30);
    expect(result.current.production.orders).toBe(0);
    expect(result.turnover).toEqual([]);
  });
});
