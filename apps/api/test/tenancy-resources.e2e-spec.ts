import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resetDatabase } from './support/database.js';
import { createScenario, type Scenario } from './support/scenario.js';
import { createTestApp, type TestApp } from './support/test-app.js';

/**
 * Isolamento entre empresas nos recursos das Semanas 2 a 6 (estoque, produção, expedição,
 * rastreabilidade, qualidade, recall, auditoria, relatórios). A empresa B monta uma cadeia
 * completa; a empresa A tenta ler e escrever nela por todos os caminhos. Regra: **404**, nunca 403,
 * e nada de B aparece nas listas de A.
 */
describe('Tenant isolation across business resources (e2e)', () => {
  let testApp: TestApp;
  let a: Scenario;
  let b: Scenario;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    testApp = await createTestApp();
    await resetDatabase(testApp.prisma);
    a = await createScenario(testApp, 'Alfa Cafés');
    b = await createScenario(testApp, 'Beta Cafés');

    // Cadeia de B: recebimento → movimentação → torra → expedição → NC → recall.
    ids['green'] = await b.receive('100');
    const issued = await b.http
      .post('/v1/movements', {
        type: 'ISSUE',
        lotId: ids['green'],
        fromLocationId: b.locations.warehouse.id,
        quantity: '5',
      })
      .expect(201);
    ids['movement'] = (issued.body as { id: string }).id;
    ids['roasted'] = await b.produce(
      [{ lotId: ids['green'], locationId: b.locations.warehouse.id, quantity: '50' }],
      '41',
    );
    ids['order'] = (
      (await b.http.get(`/v1/production-orders?pageSize=1`).expect(200)).body as {
        data: Array<{ id: string }>;
      }
    ).data[0]!.id;
    ids['shipment'] = (await b.ship(ids['roasted'], '10')).id;

    ids['ncLot'] = await b.receive('20');
    const nc = await b.http
      .post('/v1/non-conformities', {
        lotId: ids['ncLot'],
        type: 'MOISTURE',
        description: 'Umidade alta',
      })
      .expect(201);
    ids['nc'] = (nc.body as { id: string }).id;

    const recall = await b.http
      .post('/v1/recalls', { lotId: ids['green'], reason: 'Contaminação', severity: 'HIGH' })
      .expect(201);
    ids['recall'] = (recall.body as { id: string }).id;

    // A também tem dados próprios, para as listas não estarem vazias por acaso.
    ids['ownLot'] = await a.receive('30');
  });

  afterAll(async () => {
    await testApp.close();
  });

  it.each([
    ['lot', () => `/v1/lots/${ids['green']}`],
    ['trace backward', () => `/v1/lots/${ids['roasted']}/trace/backward`],
    ['trace forward', () => `/v1/lots/${ids['green']}/trace/forward`],
    ['movement', () => `/v1/movements/${ids['movement']}`],
    ['production order', () => `/v1/production-orders/${ids['order']}`],
    ['shipment', () => `/v1/shipments/${ids['shipment']}`],
    ['non-conformity', () => `/v1/non-conformities/${ids['nc']}`],
    ['recall', () => `/v1/recalls/${ids['recall']}`],
    ['recall report', () => `/v1/recalls/${ids['recall']}/report`],
  ])('GET another company %s → 404', async (_name, path) => {
    const res = await a.http.get(path());
    expect(res.status).toBe(404);
  });

  it('every write that targets another company answers 404 and changes nothing', async () => {
    const attempts = [
      a.http.patch(`/v1/lots/${ids['green']}`, { notes: 'Tentativa indevida' }),
      a.http.patch(`/v1/lots/${ids['ncLot']}/status`, {
        status: 'AVAILABLE',
        reason: 'Tentativa indevida',
      }),
      a.http.post('/v1/movements', {
        type: 'ISSUE',
        lotId: ids['roasted'],
        fromLocationId: b.locations.roastery.id,
        quantity: '1',
      }),
      // Lote de B com local de A: o lote não é encontrado.
      a.http.post('/v1/movements', {
        type: 'ISSUE',
        lotId: ids['roasted'],
        fromLocationId: a.locations.warehouse.id,
        quantity: '1',
      }),
      a.http.post(`/v1/movements/${ids['movement']}/reverse`, { reason: 'Tentativa indevida' }),
      a.http.post('/v1/production-orders', {
        stage: 'ROASTING',
        inputs: [{ lotId: ids['roasted'], locationId: b.locations.roastery.id, quantity: '1' }],
        outputProductId: a.products.roasted.id,
        outputLocationId: a.locations.roastery.id,
        outputQuantity: '1',
      }),
      a.http.post('/v1/shipments', {
        customerId: a.customer.id,
        items: [{ lotId: ids['roasted'], locationId: b.locations.roastery.id, quantity: '1' }],
      }),
      a.http.post('/v1/shipments', {
        customerId: b.customer.id,
        items: [{ lotId: ids['ownLot'], locationId: a.locations.warehouse.id, quantity: '1' }],
      }),
      a.http.post('/v1/non-conformities', {
        lotId: ids['roasted'],
        type: 'MOISTURE',
        description: 'Tentativa indevida',
      }),
      a.http.post(`/v1/non-conformities/${ids['nc']}/release`, {
        justification: 'Tentativa indevida',
      }),
      a.http.post(`/v1/non-conformities/${ids['nc']}/discard`, {
        justification: 'Tentativa indevida',
      }),
      a.http.post('/v1/recalls/simulate', { lotId: ids['roasted'] }),
      a.http.post('/v1/recalls', {
        lotId: ids['roasted'],
        reason: 'Tentativa indevida',
        severity: 'LOW',
      }),
      a.http.post(`/v1/recalls/${ids['recall']}/retry`),
      a.http.post(`/v1/recalls/${ids['recall']}/close`, { notes: 'Tentativa indevida' }),
    ];

    for (const res of await Promise.all(attempts)) {
      expect(res.status, res.text).toBe(404);
    }

    // B continua exatamente como estava.
    expect(await b.lot(ids['roasted']!)).toMatchObject({ balance: '31.000', status: 'BLOCKED' });
    expect((await b.lot(ids['ncLot']!)).status).toBe('QUARANTINE');
    const nc = await b.http.get(`/v1/non-conformities/${ids['nc']}`).expect(200);
    expect((nc.body as { status: string }).status).toBe('OPEN');
    const recall = await b.http.get(`/v1/recalls/${ids['recall']}`).expect(200);
    expect((recall.body as { status: string }).status).toBe('COMPLETED');
  });

  it('storage-backed routes never expose the other company', async () => {
    // Sem bucket nos testes, anexos e etiqueta respondem 503 antes de ler qualquer dado.
    for (const res of await Promise.all([
      a.http.get(`/v1/lots/${ids['green']}/attachments`),
      a.http.post(`/v1/lots/${ids['roasted']}/label`),
    ])) {
      expect([404, 503], res.text).toContain(res.status);
    }
  });

  it('lists, stock, dashboard and audit never show the other company', async () => {
    const bIds = new Set(Object.values(ids).filter((id) => id !== ids['ownLot']));
    const paths = [
      '/v1/lots?pageSize=100',
      '/v1/movements?pageSize=100',
      '/v1/stock?pageSize=100',
      '/v1/production-orders?pageSize=100',
      '/v1/shipments?pageSize=100',
      '/v1/non-conformities?pageSize=100',
      '/v1/recalls?pageSize=100',
      '/v1/audit-logs?pageSize=100',
      '/v1/alerts/expiring?days=365',
      '/v1/dashboard',
    ];

    for (const path of paths) {
      const res = await a.http.get(path).expect(200);
      const text = JSON.stringify(res.body);
      for (const id of bIds) expect(text, `${path} leaks ${id}`).not.toContain(id);
      expect(text, path).not.toContain('Beta Cafés');
    }

    const lots = await a.http.get('/v1/lots?pageSize=100').expect(200);
    expect((lots.body as { data: Array<{ id: string }> }).data.map((lot) => lot.id)).toEqual([
      ids['ownLot'],
    ]);
  });

  it('CSV reports only contain the requesting company', async () => {
    const own = await a.lot(ids['ownLot']!);
    const other = await b.lot(ids['green']!);

    for (const report of ['stock', 'movements', 'production', 'shipments']) {
      const res = await a.http.get(`/v1/reports/${report}.csv`).expect(200);
      expect(res.text, report).not.toContain(other.code);
      if (report === 'stock' || report === 'movements')
        expect(res.text, report).toContain(own.code);
    }
  });

  it('the audit trail of B records who did what, and A sees none of it', async () => {
    const res = await b.http.get('/v1/audit-logs?pageSize=100').expect(200);
    const actions = (res.body as { data: Array<{ action: string }> }).data.map((e) => e.action);
    expect(actions).toEqual(
      expect.arrayContaining(['lot.received', 'movement.created', 'recall.created']),
    );
  });
});
