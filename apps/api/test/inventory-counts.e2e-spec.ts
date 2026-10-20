import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resetDatabase } from './support/database.js';
import { createScenario, type Problem, type Scenario } from './support/scenario.js';
import { createTestApp, type TestApp } from './support/test-app.js';

interface CountItem {
  id: string;
  lot: { id: string; code: string; status: string };
  systemQuantity: string;
  currentQuantity: string;
  countedQuantity: string | null;
  difference: string | null;
  adjustmentId: string | null;
}

interface CountBody {
  id: string;
  number: string;
  status: string;
  itemsCount: number;
  countedCount: number;
  items: CountItem[];
}

/** Inventário: abertura com os saldos do local, contagem, aplicação como ajustes e isolamento. */
describe('Inventory counts (e2e)', () => {
  let testApp: TestApp;
  let s: Scenario;
  let a: string;
  let b: string;

  const open = async (locationId = s.locations.warehouse.id) => {
    const res = await s.http.post('/v1/inventory-counts', { locationId }, 'operator');
    expect(res.status).toBe(201);
    return res.body as CountBody;
  };
  const itemOf = (count: CountBody, lotId: string) => {
    const item = count.items.find((i) => i.lot.id === lotId);
    if (!item) throw new Error(`lot ${lotId} not in count`);
    return item;
  };
  const count = (
    c: CountBody,
    lotId: string,
    countedQuantity: string,
    as: 'admin' | 'operator' = 'operator',
  ) =>
    s.http.put(
      `/v1/inventory-counts/${c.id}/items/${itemOf(c, lotId).id}`,
      { countedQuantity },
      as,
    );
  const stockAt = async (lotId: string, locationId: string) => {
    const lot = (await s.http.get(`/v1/lots/${lotId}`).expect(200)).body as {
      stock: Array<{ location: { id: string }; quantity: string }>;
    };
    return lot.stock.find((entry) => entry.location.id === locationId)?.quantity ?? '0.000';
  };

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(testApp.prisma);
    s = await createScenario(testApp);
    a = await s.receive('100');
    b = await s.receive('50');
  });

  afterAll(async () => {
    await testApp.close();
  });

  it('opens with the lots that have stock at the location', async () => {
    await s.receive('30', s.locations.roastery.id); // outro local: fora da lista
    const c = await open();

    expect(c).toMatchObject({ status: 'OPEN', itemsCount: 2, countedCount: 0 });
    expect(c.number).toMatch(/^INV-\d{4}-000001$/);
    expect(itemOf(c, a)).toMatchObject({ systemQuantity: '100.000', countedQuantity: null });
    expect(itemOf(c, b)).toMatchObject({ systemQuantity: '50.000' });
  });

  it('applies gains and losses as adjustments in one go', async () => {
    const c = await open();
    await count(c, a, '97.5').expect(200);
    const counted = (await count(c, b, '52').expect(200)).body as CountBody;
    expect(itemOf(counted, a).difference).toBe('-2.500');
    expect(counted.countedCount).toBe(2);

    const res = await s.http.post(`/v1/inventory-counts/${c.id}/apply`);
    expect(res.status).toBe(200);
    const applied = res.body as CountBody;
    expect(applied.status).toBe('APPLIED');
    expect(itemOf(applied, a)).toMatchObject({ difference: '-2.500', currentQuantity: '100.000' });
    expect(itemOf(applied, b)).toMatchObject({ difference: '2.000' });

    expect(await stockAt(a, s.locations.warehouse.id)).toBe('97.500');
    expect(await stockAt(b, s.locations.warehouse.id)).toBe('52.000');
    const adjustments = await testApp.prisma.stockMovement.findMany({
      where: { type: 'ADJUSTMENT' },
    });
    expect(adjustments).toHaveLength(2);
    expect(adjustments.every((m) => m.documentRef === c.number)).toBe(true);
    expect(itemOf(applied, a).adjustmentId).toBe(adjustments.find((m) => m.lotId === a)?.id);
  });

  it('no difference means no movement; zero counted consumes the lot', async () => {
    const c = await open();
    await count(c, a, '100').expect(200);
    await count(c, b, '0').expect(200);
    const applied = (await s.http.post(`/v1/inventory-counts/${c.id}/apply`).expect(200))
      .body as CountBody;

    expect(itemOf(applied, a)).toMatchObject({ difference: '0.000', adjustmentId: null });
    expect(await testApp.prisma.stockMovement.count({ where: { type: 'ADJUSTMENT' } })).toBe(1);
    expect((await s.lot(b)).status).toBe('CONSUMED');
  });

  it('uses the balance at apply time, so movements during the count are not differences', async () => {
    const c = await open();
    // Saem 10 kg de A durante a contagem; a equipe conta o que sobrou.
    await s.http
      .post('/v1/movements', {
        type: 'TRANSFER',
        lotId: a,
        fromLocationId: s.locations.warehouse.id,
        toLocationId: s.locations.roastery.id,
        quantity: '10',
      })
      .expect(201);
    await count(c, a, '90').expect(200);
    await count(c, b, '50').expect(200);

    const applied = (await s.http.post(`/v1/inventory-counts/${c.id}/apply`).expect(200))
      .body as CountBody;
    expect(itemOf(applied, a)).toMatchObject({ systemQuantity: '100.000', difference: '0.000' });
    expect(await testApp.prisma.stockMovement.count({ where: { type: 'ADJUSTMENT' } })).toBe(0);
  });

  it('accepts a lot found at the location that was not on the list', async () => {
    const elsewhere = await s.receive('20', s.locations.roastery.id);
    const c = await open();
    const res = await s.http.post(
      `/v1/inventory-counts/${c.id}/items`,
      { lotId: elsewhere, countedQuantity: '5' },
      'operator',
    );
    expect(res.status).toBe(200);
    expect(itemOf(res.body as CountBody, elsewhere)).toMatchObject({
      systemQuantity: '0.000',
      difference: '5.000',
    });

    const again = await s.http.post(`/v1/inventory-counts/${c.id}/items`, {
      lotId: elsewhere,
      countedQuantity: '5',
    });
    expect(again.status).toBe(409);
  });

  it('records a counted loss even on a quarantined lot', async () => {
    await s.http
      .post('/v1/non-conformities', { lotId: a, type: 'MOISTURE', description: 'Umidade alta' })
      .expect(201);
    expect((await s.lot(a)).status).toBe('QUARANTINE');

    const c = await open();
    await count(c, a, '90').expect(200);
    await count(c, b, '50').expect(200);
    await s.http.post(`/v1/inventory-counts/${c.id}/apply`).expect(200);
    expect(await stockAt(a, s.locations.warehouse.id)).toBe('90.000');
    expect((await s.lot(a)).status).toBe('QUARANTINE');
  });

  it('refuses to apply while lots are uncounted', async () => {
    const c = await open();
    await count(c, a, '100').expect(200);
    const res = await s.http.post(`/v1/inventory-counts/${c.id}/apply`);
    expect(res.status).toBe(409);
    expect((res.body as Problem).type).toBe('/problems/inventory-count-incomplete');
  });

  it('allows a single open count per location, even concurrently', async () => {
    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        s.http.post('/v1/inventory-counts', { locationId: s.locations.warehouse.id }),
      ),
    );
    expect(results.filter((res) => res.status === 201)).toHaveLength(1);
    for (const res of results.filter((r) => r.status !== 201)) {
      expect(res.status).toBe(409);
      expect((res.body as Problem).type).toBe('/problems/inventory-count-open');
    }
    // Outro local pode ter a sua.
    await open(s.locations.roastery.id);
  });

  it('applying twice concurrently adjusts only once', async () => {
    const c = await open();
    await count(c, a, '90').expect(200);
    await count(c, b, '50').expect(200);
    const results = await Promise.all([
      s.http.post(`/v1/inventory-counts/${c.id}/apply`),
      s.http.post(`/v1/inventory-counts/${c.id}/apply`),
    ]);
    expect(results.map((res) => res.status).sort()).toEqual([200, 409]);
    expect(await stockAt(a, s.locations.warehouse.id)).toBe('90.000');
  });

  it('cancelled and applied counts are frozen; cancel frees the location', async () => {
    const c = await open();
    const cancelled = await s.http.post(`/v1/inventory-counts/${c.id}/cancel`, {
      reason: 'Contagem aberta por engano',
    });
    expect(cancelled.status).toBe(200);
    expect((cancelled.body as CountBody).status).toBe('CANCELLED');

    const late = await count(c, a, '1');
    expect(late.status).toBe(409);
    expect((late.body as Problem).type).toBe('/problems/inventory-count-closed');
    expect(await testApp.prisma.stockMovement.count({ where: { type: 'ADJUSTMENT' } })).toBe(0);

    const next = await open();
    expect(next.number).toMatch(/-000002$/);
  });

  it('enforces roles: auditor reads only; operator counts but does not apply', async () => {
    const c = await open();
    expect((await s.http.get(`/v1/inventory-counts/${c.id}`, 'auditor')).status).toBe(200);
    expect((await count(c, a, '1', 'operator')).status).toBe(200);
    expect(
      (
        await s.http.put(
          `/v1/inventory-counts/${c.id}/items/${itemOf(c, a).id}`,
          { countedQuantity: '1' },
          'auditor',
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await s.http.post(
          '/v1/inventory-counts',
          { locationId: s.locations.roastery.id },
          'auditor',
        )
      ).status,
    ).toBe(403);
    expect((await s.http.post(`/v1/inventory-counts/${c.id}/apply`, {}, 'operator')).status).toBe(
      403,
    );
    expect(
      (
        await s.http.post(
          `/v1/inventory-counts/${c.id}/cancel`,
          { reason: 'Sem permissão' },
          'operator',
        )
      ).status,
    ).toBe(403);
  });

  it('validates quantities', async () => {
    const c = await open();
    expect((await count(c, a, '-1')).status).toBe(400);
    expect((await count(c, a, '1.2345')).status).toBe(400);
  });

  it('isolates companies: another company gets 404 everywhere', async () => {
    const c = await open();
    const other = await createScenario(testApp, 'Outra Empresa');
    const otherLot = await other.receive('10');

    expect((await other.http.get(`/v1/inventory-counts/${c.id}`)).status).toBe(404);
    expect(
      (
        await other.http.put(`/v1/inventory-counts/${c.id}/items/${itemOf(c, a).id}`, {
          countedQuantity: '1',
        })
      ).status,
    ).toBe(404);
    expect((await other.http.post(`/v1/inventory-counts/${c.id}/apply`)).status).toBe(404);
    expect(
      (
        await other.http.post(`/v1/inventory-counts/${c.id}/cancel`, {
          reason: 'Tentativa externa',
        })
      ).status,
    ).toBe(404);
    expect(
      (await other.http.post('/v1/inventory-counts', { locationId: s.locations.warehouse.id }))
        .status,
    ).toBe(404);
    const list = (await other.http.get('/v1/inventory-counts').expect(200)).body as {
      data: unknown[];
    };
    expect(list.data).toHaveLength(0);

    // Lote de outra empresa não entra na minha contagem.
    expect(
      (
        await s.http.post(`/v1/inventory-counts/${c.id}/items`, {
          lotId: otherLot,
          countedQuantity: '1',
        })
      ).status,
    ).toBe(404);
  });

  it('writes audit entries', async () => {
    const c = await open();
    await count(c, a, '100').expect(200);
    await count(c, b, '50').expect(200);
    await s.http.post(`/v1/inventory-counts/${c.id}/apply`).expect(200);
    const actions = (
      await testApp.prisma.auditLog.findMany({
        where: { entityType: 'inventory_count' },
        orderBy: { createdAt: 'asc' },
      })
    ).map((log) => log.action);
    expect(actions).toEqual(['inventory_count.created', 'inventory_count.applied']);
  });
});
