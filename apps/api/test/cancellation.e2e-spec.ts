import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resetDatabase } from './support/database.js';
import { createScenario, type Problem, type Scenario } from './support/scenario.js';
import { createTestApp, type TestApp } from './support/test-app.js';

interface ShipmentDetail {
  id: string;
  number: string;
  items: Array<{ movementId: string; reversal: { id: string } | null }>;
  cancellation: { reason: string; user: { id: string } } | null;
}

interface ForwardTrace {
  shipments: Array<{ number: string; reversed: boolean }>;
  customers: Array<{ id: string }>;
  edges: Array<{ productionOrder: { number: string; cancelled: boolean } }>;
}

interface OrderBody {
  id: string;
  number: string;
  cancellation: { reason: string } | null;
}

/**
 * Estorno e cancelamento de operações: o que foi desfeito continua visível (rastreio, relatórios),
 * mas não conta como entregue — nem no recall, nem no painel.
 */
describe('Cancellation of shipments and production orders (e2e)', () => {
  let testApp: TestApp;
  let s: Scenario;

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

  /** Lote verde → torra (lote gerado no local de torra) e o id da ordem. */
  async function roast() {
    const green = await s.receive('100');
    const roasted = await s.produce(
      [{ lotId: green, locationId: s.locations.warehouse.id, quantity: '50' }],
      '42',
    );
    const orders = await s.http.get(`/v1/production-orders?lotId=${roasted}`).expect(200);
    const order = (orders.body as { data: OrderBody[] }).data[0]!;
    return { green, roasted, order };
  }

  const shipmentDetail = async (id: string) =>
    (await s.http.get(`/v1/shipments/${id}`).expect(200)).body as ShipmentDetail;

  const forward = async (lotId: string) =>
    (await s.http.get(`/v1/lots/${lotId}/trace/forward`).expect(200)).body as ForwardTrace;

  describe('reversed shipment items', () => {
    it('stay in the trace but no longer make the customer affected, nor count in the recall', async () => {
      const { green, roasted } = await roast();
      const shipment = await s.ship(roasted, '10');
      const detail = await shipmentDetail(shipment.id);
      await s.http
        .post(`/v1/movements/${detail.items[0]!.movementId}/reverse`, { reason: 'Devolução' })
        .expect(201);

      const trace = await forward(green);
      expect(trace.shipments).toEqual([
        expect.objectContaining({ number: shipment.number, reversed: true }),
      ]);
      expect(trace.customers).toEqual([]);

      const simulation = await s.http.post('/v1/recalls/simulate', { lotId: green }).expect(200);
      expect(simulation.body).toMatchObject({
        customers: [],
        totals: { customers: 0, shipments: 0, shipped: [] },
      });

      const after = await shipmentDetail(shipment.id);
      expect(after.items[0]!.reversal).not.toBeNull();
      expect(after.cancellation).toBeNull();
    });
  });

  describe('POST /v1/shipments/:id/cancel', () => {
    it('reverses every item, returns the stock and marks the shipment', async () => {
      const { roasted } = await roast();
      const shipment = await s.ship(roasted, '12');
      expect((await s.lot(roasted)).balance).toBe('30.000');

      const res = await s.http
        .post(`/v1/shipments/${shipment.id}/cancel`, { reason: 'Pedido cancelado pelo cliente' })
        .expect(200);
      const body = res.body as ShipmentDetail;
      expect(body.cancellation).toMatchObject({
        reason: 'Pedido cancelado pelo cliente',
        user: { id: s.users.admin.id },
      });
      expect(body.items.every((item) => item.reversal !== null)).toBe(true);
      expect((await s.lot(roasted)).balance).toBe('42.000');

      const list = await s.http.get('/v1/shipments').expect(200);
      expect((list.body as { data: unknown[] }).data[0]).toMatchObject({
        itemsCount: 1,
        reversedItemsCount: 1,
        cancellation: { reason: 'Pedido cancelado pelo cliente' },
      });

      const dashboard = await s.http.get('/v1/dashboard').expect(200);
      expect(dashboard.body).toMatchObject({ shipments30d: { count: 0, customers: 0 } });

      const audit = await testApp.prisma.auditLog.findFirst({
        where: { action: 'shipment.cancelled', entityId: shipment.id },
      });
      expect(audit).not.toBeNull();
    });

    it('cancels only once, even when two cancellations race', async () => {
      const { roasted } = await roast();
      const shipment = await s.ship(roasted, '5');

      const results = await Promise.all(
        [1, 2].map(() =>
          s.http.post(`/v1/shipments/${shipment.id}/cancel`, { reason: 'Lançada em dobro' }),
        ),
      );
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      const conflict = results.find((r) => r.status === 409)!;
      expect((conflict.body as Problem).type).toBe('/problems/already-cancelled');
      expect((await s.lot(roasted)).balance).toBe('42.000');
    });

    it('skips items already reversed one by one', async () => {
      const { roasted } = await roast();
      const shipment = await s.ship(roasted, '5');
      const detail = await shipmentDetail(shipment.id);
      await s.http
        .post(`/v1/movements/${detail.items[0]!.movementId}/reverse`, { reason: 'Devolução' })
        .expect(201);

      await s.http
        .post(`/v1/shipments/${shipment.id}/cancel`, { reason: 'Encerrando a expedição' })
        .expect(200);
      expect((await s.lot(roasted)).balance).toBe('42.000');
    });

    it('is admin-only, validates the reason and is isolated per company', async () => {
      const { roasted } = await roast();
      const shipment = await s.ship(roasted, '5');

      await s.http
        .post(`/v1/shipments/${shipment.id}/cancel`, { reason: 'Operador tentando' }, 'operator')
        .expect(403);
      await s.http.post(`/v1/shipments/${shipment.id}/cancel`, { reason: 'x' }).expect(400);

      const other = await createScenario(testApp, 'Outra Empresa');
      await other.http
        .post(`/v1/shipments/${shipment.id}/cancel`, { reason: 'Empresa errada' })
        .expect(404);
    });
  });

  describe('POST /v1/production-orders/:id/cancel', () => {
    it('reverses production and consumption, giving the inputs back', async () => {
      const { green, roasted, order } = await roast();

      const res = await s.http
        .post(`/v1/production-orders/${order.id}/cancel`, {
          reason: 'Torra lançada no lote errado',
        })
        .expect(200);
      expect((res.body as OrderBody).cancellation).toMatchObject({
        reason: 'Torra lançada no lote errado',
      });

      expect(await s.lot(green)).toMatchObject({ balance: '100.000', status: 'AVAILABLE' });
      expect(await s.lot(roasted)).toMatchObject({ balance: '0.000', status: 'CONSUMED' });

      const trace = await forward(green);
      expect(trace.edges.map((edge) => edge.productionOrder)).toEqual([
        expect.objectContaining({ number: order.number, cancelled: true }),
      ]);

      const dashboard = await s.http.get('/v1/dashboard').expect(200);
      expect(dashboard.body).toMatchObject({ production30d: { orders: 0 } });

      const again = await s.http.post(`/v1/production-orders/${order.id}/cancel`, {
        reason: 'De novo',
      });
      expect(again.status).toBe(409);
      expect((again.body as Problem).type).toBe('/problems/already-cancelled');
    });

    it('refuses when the produced lot was already used, and changes nothing', async () => {
      const { green, roasted, order } = await roast();
      await s.ship(roasted, '10');

      const res = await s.http.post(`/v1/production-orders/${order.id}/cancel`, {
        reason: 'Tarde demais',
      });
      expect(res.status).toBe(409);
      expect((res.body as Problem).type).toBe('/problems/insufficient-stock');

      expect((await s.lot(green)).balance).toBe('50.000');
      expect((await s.lot(roasted)).balance).toBe('32.000');
      const fresh = await s.http.get(`/v1/production-orders/${order.id}`).expect(200);
      expect((fresh.body as OrderBody).cancellation).toBeNull();
    });

    it('is admin-only', async () => {
      const { order } = await roast();
      await s.http
        .post(`/v1/production-orders/${order.id}/cancel`, { reason: 'Operador' }, 'operator')
        .expect(403);
    });
  });

  describe('single reversals of an order movement', () => {
    const movementsOf = async (lotId: string) =>
      (
        (await s.http.get(`/v1/movements?lotId=${lotId}`).expect(200)).body as {
          data: Array<{ id: string; type: string }>;
        }
      ).data;

    it('are refused: the whole order is cancelled instead', async () => {
      const { green, roasted, order } = await roast();
      const production = (await movementsOf(roasted)).find((m) => m.type === 'PRODUCTION')!;
      const consumption = (await movementsOf(green)).find((m) => m.type === 'CONSUMPTION')!;

      for (const movement of [production, consumption]) {
        const res = await s.http.post(`/v1/movements/${movement.id}/reverse`, { reason: 'Erro' });
        expect(res.status).toBe(409);
        expect(res.body).toMatchObject({
          type: '/problems/use-cancellation',
          document: order.number,
        });
      }
    });

    it('still allow reversing a manual consumption', async () => {
      const green = await s.receive('100');
      const manual = await s.http
        .post('/v1/movements', {
          type: 'CONSUMPTION',
          lotId: green,
          fromLocationId: s.locations.warehouse.id,
          quantity: '5',
          documentRef: 'Prova de xícara',
        })
        .expect(201);
      await s.http
        .post(`/v1/movements/${(manual.body as { id: string }).id}/reverse`, { reason: 'Erro' })
        .expect(201);
    });
  });
});
