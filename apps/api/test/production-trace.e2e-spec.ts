import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resetDatabase } from './support/database.js';
import { createScenario, type Problem, type Scenario } from './support/scenario.js';
import { createTestApp, type TestApp } from './support/test-app.js';

/**
 * Produção, expedição e rastreabilidade sob concorrência e em grafos não triviais (ADR 0008):
 * insumo disputado, travas em ordem cruzada (deadlock), diamante, limite de profundidade e a
 * página pública do QR code.
 */
describe('Production, shipments and traceability (e2e)', () => {
  let testApp: TestApp;
  let s: Scenario;

  const roast = (lotId: string, quantity: string, output = '1') =>
    s.http.post(
      '/v1/production-orders',
      {
        stage: 'ROASTING',
        inputs: [{ lotId, locationId: s.locations.warehouse.id, quantity }],
        outputProductId: s.products.roasted.id,
        outputLocationId: s.locations.roastery.id,
        outputQuantity: output,
      },
      'operator',
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

  describe('concurrency', () => {
    it('concurrent roasts of the same green lot never consume more than its balance', async () => {
      const green = await s.receive('100');

      const results = await Promise.all(Array.from({ length: 7 }, () => roast(green, '20', '16')));

      expect(results.filter((res) => res.status === 201)).toHaveLength(5);
      for (const res of results.filter((r) => r.status !== 201)) {
        expect(res.status).toBe(409);
        expect((res.body as Problem).type).toBe('/problems/insufficient-stock');
      }
      expect(await s.lot(green)).toMatchObject({ balance: '0.000', status: 'CONSUMED' });

      // Nenhuma ordem ou lote órfão das tentativas recusadas.
      expect(await testApp.prisma.productionOrder.count()).toBe(5);
      expect(await testApp.prisma.lot.count({ where: { productId: s.products.roasted.id } })).toBe(
        5,
      );
      const numbers = (await testApp.prisma.productionOrder.findMany()).map((o) => o.number);
      expect(new Set(numbers).size).toBe(5);
    });

    it('blends locking the same inputs in opposite order do not deadlock', async () => {
      const g1 = await s.receive('100');
      const g2 = await s.receive('100');
      const r1 = await s.produce(
        [{ lotId: g1, locationId: s.locations.warehouse.id, quantity: '100' }],
        '80',
      );
      const r2 = await s.produce(
        [{ lotId: g2, locationId: s.locations.warehouse.id, quantity: '100' }],
        '80',
      );

      const blend = (first: string, second: string) =>
        s.http.post('/v1/production-orders', {
          stage: 'BLENDING',
          inputs: [
            { lotId: first, locationId: s.locations.roastery.id, quantity: '5' },
            { lotId: second, locationId: s.locations.roastery.id, quantity: '5' },
          ],
          outputProductId: s.products.blend.id,
          outputLocationId: s.locations.roastery.id,
          outputQuantity: '10',
        });

      const results = await Promise.all(
        Array.from({ length: 10 }, (_, i) => (i % 2 ? blend(r1, r2) : blend(r2, r1))),
      );

      expect(results.map((res) => res.status)).toEqual(Array(10).fill(201));
      expect(await s.lot(r1)).toMatchObject({ balance: '30.000' });
      expect(await s.lot(r2)).toMatchObject({ balance: '30.000' });
    });

    it('concurrent shipments of the same lot only ship what is in stock', async () => {
      const green = await s.receive('100');
      const roasted = await s.produce(
        [{ lotId: green, locationId: s.locations.warehouse.id, quantity: '100' }],
        '50',
      );

      const results = await Promise.all(
        Array.from({ length: 8 }, () =>
          s.http.post('/v1/shipments', {
            customerId: s.customer.id,
            items: [{ lotId: roasted, locationId: s.locations.roastery.id, quantity: '10' }],
          }),
        ),
      );

      const shipped = results.filter((res) => res.status === 201);
      expect(shipped).toHaveLength(5);
      expect(results.filter((res) => res.status === 409)).toHaveLength(3);
      const numbers = shipped.map((res) => (res.body as { number: string }).number).sort();
      expect(numbers).toEqual([1, 2, 3, 4, 5].map((n) => `EXP-2026-00000${n}`));
      expect(await s.lot(roasted)).toMatchObject({ balance: '0.000', status: 'CONSUMED' });
      expect(await testApp.prisma.shipment.count()).toBe(5);
    });

    it('a shipment with one item over the balance writes nothing at all', async () => {
      const g1 = await s.receive('100');
      const g2 = await s.receive('100');
      const r1 = await s.produce(
        [{ lotId: g1, locationId: s.locations.warehouse.id, quantity: '100' }],
        '80',
      );
      const r2 = await s.produce(
        [{ lotId: g2, locationId: s.locations.warehouse.id, quantity: '100' }],
        '80',
      );

      const res = await s.http.post('/v1/shipments', {
        customerId: s.customer.id,
        items: [
          { lotId: r1, locationId: s.locations.roastery.id, quantity: '10' },
          { lotId: r2, locationId: s.locations.roastery.id, quantity: '81' },
        ],
      });

      expect(res.status).toBe(409);
      expect(await s.lot(r1)).toMatchObject({ balance: '80.000' });
      expect(await testApp.prisma.shipment.count()).toBe(0);
    });
  });

  describe('graph shapes', () => {
    it('a diamond lists each lot once, at its shortest distance, in both directions', async () => {
      //        ┌─ R1 ─┐
      //   G ───┤      ├── B ── cliente
      //        └─ R2 ─┘
      const g = await s.receive('100');
      const r1 = await s.produce(
        [{ lotId: g, locationId: s.locations.warehouse.id, quantity: '40' }],
        '32',
      );
      const r2 = await s.produce(
        [{ lotId: g, locationId: s.locations.warehouse.id, quantity: '40' }],
        '32',
      );
      const b = await s.produce(
        [
          { lotId: r1, locationId: s.locations.roastery.id, quantity: '30' },
          { lotId: r2, locationId: s.locations.roastery.id, quantity: '30' },
        ],
        '60',
        'BLENDING',
      );
      await s.ship(b, '12');

      const backward = (await s.http.get(`/v1/lots/${b}/trace/backward`).expect(200)).body as {
        nodes: Array<{ id: string; depth: number }>;
        edges: unknown[];
        origins: unknown[];
      };
      expect(backward.nodes.map((n) => [n.id, n.depth]).sort()).toEqual(
        [
          [b, 0],
          [r1, 1],
          [r2, 1],
          [g, 2],
        ].sort(),
      );
      expect(backward.edges).toHaveLength(4);
      expect(backward.origins).toHaveLength(1);

      const forward = (await s.http.get(`/v1/lots/${g}/trace/forward`).expect(200)).body as {
        nodes: Array<{ id: string; depth: number }>;
        customers: Array<{ id: string }>;
        shipments: unknown[];
      };
      expect(forward.nodes).toHaveLength(4);
      expect(forward.nodes.find((n) => n.id === b)?.depth).toBe(2);
      expect(forward.customers.map((c) => c.id)).toEqual([s.customer.id]);
      expect(forward.shipments).toHaveLength(1);
    });

    it('stops at the maximum depth and flags the result as truncated', async () => {
      let lot = await s.receive('1000');
      const chain = [lot];
      // 22 beneficiamentos em sequência: verde → verde (limite de rastreio = 20 níveis).
      for (let i = 0; i < 22; i++) {
        const res = await s.http
          .post('/v1/production-orders', {
            stage: 'PROCESSING',
            inputs: [{ lotId: lot, locationId: s.locations.warehouse.id, quantity: '10' }],
            outputProductId: s.products.green.id,
            outputLocationId: s.locations.warehouse.id,
            outputQuantity: '10',
          })
          .expect(201);
        lot = (res.body as { output: { id: string } }).output.id;
        chain.push(lot);
      }

      const backward = (await s.http.get(`/v1/lots/${lot}/trace/backward`).expect(200)).body as {
        nodes: Array<{ depth: number }>;
        truncated: boolean;
      };
      expect(backward.truncated).toBe(true);
      expect(Math.max(...backward.nodes.map((n) => n.depth))).toBe(20);
      expect(backward.nodes).toHaveLength(21);

      const short = (await s.http.get(`/v1/lots/${chain[5]}/trace/backward`).expect(200)).body as {
        truncated: boolean;
      };
      expect(short.truncated).toBe(false);
    });
  });

  describe('public trace page', () => {
    const TOKEN = 'publicTokenForTests_0001';

    const publish = async () => {
      const g = await s.receive('100');
      const r = await s.produce(
        [{ lotId: g, locationId: s.locations.warehouse.id, quantity: '50' }],
        '40',
      );
      await testApp.prisma.lot.update({ where: { id: r }, data: { publicToken: TOKEN } });
      return r;
    };

    it('shows only publishable data (no balances, customers, documents or ids)', async () => {
      await publish();
      await testApp.prisma.supplier.update({
        where: { id: s.supplier.id },
        data: { document: '52998224725', email: 'produtor@fazenda.dev', phone: '35999990000' },
      });

      const res = await testApp.http().get(`/v1/public/trace/${TOKEN}`).expect(200);
      const text = JSON.stringify(res.body);

      expect(res.body).toMatchObject({ companyName: s.company.name, truncated: false });
      for (const secret of [
        '52998224725',
        'produtor@fazenda.dev',
        '35999990000',
        s.customer.name,
        s.supplier.id,
        s.company.id,
        s.locations.warehouse.code,
        'balance',
        'status',
        'companyId',
      ]) {
        expect(text, secret).not.toContain(secret);
      }
    });

    it('hides why a lot is unavailable (manual block); only an executed recall warns', async () => {
      const lotId = await publish();
      await s.http
        .patch(`/v1/lots/${lotId}/status`, { status: 'BLOCKED', reason: 'Recall preventivo' })
        .expect(200);

      const res = await testApp.http().get(`/v1/public/trace/${TOKEN}`).expect(200);
      const body = res.body as { lot: { available: boolean }; recall: unknown };
      expect(body.lot.available).toBe(false);
      expect(body.recall).toBeNull();
      expect(JSON.stringify(res.body)).not.toMatch(/BLOCKED|Recall preventivo/);
    });

    it('answers 404 for unknown or malformed tokens', async () => {
      await testApp.http().get('/v1/public/trace/doesNotExistButLooksValid01').expect(404);
      await testApp.http().get('/v1/public/trace/x').expect(404);
      await testApp.http().get("/v1/public/trace/'%20OR%201=1--").expect(404);
    });

    it('limits requests per IP', async () => {
      const statuses: number[] = [];
      for (let i = 0; i < 35; i++) {
        statuses.push(
          (await testApp.http().get('/v1/public/trace/doesNotExistButLooksValid01')).status,
        );
      }
      // 30/min por IP, contando as requisições dos testes anteriores deste arquivo.
      expect(statuses).toContain(429);
      expect(statuses.slice(statuses.indexOf(429))).toEqual(
        Array(statuses.length - statuses.indexOf(429)).fill(429),
      );
    });
  });
});
