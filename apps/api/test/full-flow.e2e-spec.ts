import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  LocationType,
  ProductType,
  Role,
  SupplierType,
  Unit,
} from '../src/generated/prisma/client.js';
import { resetDatabase } from './support/database.js';
import { factories } from './support/factories.js';
import { createTestApp, type TestApp } from './support/test-app.js';

/**
 * Teste de ponta a ponta do MVP (v0.1): o caminho do café da fazenda até o cliente, e a pergunta
 * do recall respondida nos dois sentidos — tudo pela API HTTP, sobre um Postgres real.
 *
 *   Fazenda Santa Inês ─┐                      ┌─ torra A ─┐
 *                       ├─ recebimento ─ verde ┤           ├─ blend ─ expedição ─ Cafeteria
 *   Fazenda Pedra Grande┘                      └─ torra B ─┘
 */
describe('Full coffee flow: receive → roast → blend → ship → trace (e2e)', () => {
  let testApp: TestApp;
  let token: string;
  let tokenOtherCompany: string;
  const ids: Record<string, string> = {};

  const api = () => testApp.http();
  const bearer = { type: 'bearer' } as const;
  const post = (path: string, body: object, key?: string) => {
    const req = api().post(path).auth(token, bearer).send(body);
    return key ? req.set('Idempotency-Key', key) : req;
  };
  const get = (path: string, as = token) => api().get(path).auth(as, bearer);

  beforeAll(async () => {
    testApp = await createTestApp();
    await resetDatabase(testApp.prisma);
    const make = factories(testApp.prisma);

    const company = await make.company({ name: 'Torrefação Serra Azul', lotPrefix: 'CAF' });
    const other = await make.company({ name: 'Outra Torrefação', lotPrefix: 'OUT' });
    const admin = await make.user(company.id, { role: Role.ADMIN, email: 'ana@flow.dev' });
    const outsider = await make.user(other.id, { role: Role.ADMIN, email: 'eve@other.dev' });

    const [green, roasted, blend] = await Promise.all([
      make.product(company.id, { sku: 'VRD', type: ProductType.GREEN, unit: Unit.BAG_60KG }),
      make.product(company.id, { sku: 'TOR', type: ProductType.ROASTED, unit: Unit.KG }),
      make.product(company.id, { sku: 'BLD', type: ProductType.BLEND, unit: Unit.KG }),
    ]);
    const [warehouse, roastery] = await Promise.all([
      make.location(company.id, { code: 'ARM-01', type: LocationType.WAREHOUSE }),
      make.location(company.id, { code: 'TORRA', type: LocationType.ROASTERY }),
    ]);
    const [farmA, farmB] = await Promise.all([
      make.supplier(company.id, {
        name: 'José Aparecido da Silva',
        type: SupplierType.PRODUCER,
        farmName: 'Sítio Santa Inês',
        region: 'Mantiqueira de Minas',
      }),
      make.supplier(company.id, {
        name: 'Fazenda Pedra Grande Ltda.',
        type: SupplierType.FARM,
        farmName: 'Fazenda Pedra Grande',
        region: 'Cerrado Mineiro',
      }),
    ]);
    const customer = await make.customer(company.id, { name: 'Cafeteria Grão Fino' });

    Object.assign(ids, {
      green: green.id,
      roasted: roasted.id,
      blend: blend.id,
      warehouse: warehouse.id,
      roastery: roastery.id,
      farmA: farmA.id,
      farmB: farmB.id,
      customer: customer.id,
    });

    const tokenFor = async (email: string) => {
      const res = await api().post('/v1/dev/token').send({ email }).expect(200);
      return (res.body as { accessToken: string }).accessToken;
    };
    token = await tokenFor(admin.email);
    tokenOtherCompany = await tokenFor(outsider.email);
  });

  afterAll(async () => {
    await testApp.close();
  });

  it('1. receives green coffee from two farms (idempotent)', async () => {
    const receipt = (supplierId: string, variety: string) => ({
      productId: ids['green'],
      supplierId,
      locationId: ids['warehouse'],
      quantity: '10',
      harvest: '2025/26',
      variety,
      documentRef: `NF ${variety}`,
    });

    const a = await post('/v1/receipts', receipt(ids['farmA']!, 'Bourbon Amarelo'), 'nf-a-0001');
    expect(a.status).toBe(201);
    expect(a.body).toMatchObject({
      code: 'CAF-2026-000001',
      balance: '10.000',
      status: 'AVAILABLE',
    });

    // Mesma chave: devolve o mesmo lote, sem duplicar estoque.
    const replay = await post(
      '/v1/receipts',
      receipt(ids['farmA']!, 'Bourbon Amarelo'),
      'nf-a-0001',
    );
    expect(replay.headers['idempotent-replayed']).toBe('true');
    expect((replay.body as { id: string }).id).toBe((a.body as { id: string }).id);

    const b = await post('/v1/receipts', receipt(ids['farmB']!, 'Mundo Novo'), 'nf-b-0001');
    expect(b.status).toBe(201);
    ids['greenA'] = (a.body as { id: string }).id;
    ids['greenB'] = (b.body as { id: string }).id;
  });

  it('2. roasts each green lot (5 sacas = 300 kg → 246 kg, 82% yield)', async () => {
    for (const [green, key] of [
      ['greenA', 'roastedA'],
      ['greenB', 'roastedB'],
    ] as const) {
      const res = await post('/v1/production-orders', {
        stage: 'ROASTING',
        inputs: [{ lotId: ids[green], locationId: ids['warehouse'], quantity: '5' }],
        outputProductId: ids['roasted'],
        outputLocationId: ids['roastery'],
        outputQuantity: '246',
      });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        stage: 'ROASTING',
        inputMassKg: '300.000',
        outputMassKg: '246.000',
        yieldPercent: 82,
        lossKg: '54.000',
      });
      ids[key] = (res.body as { output: { id: string } }).output.id;
    }

    // O verde perdeu 5 sacas; o torrado herdou safra e variedade da origem única.
    const greenA = await get(`/v1/lots/${ids['greenA']}`).expect(200);
    expect((greenA.body as { balance: string }).balance).toBe('5.000');
    const roastedA = await get(`/v1/lots/${ids['roastedA']}`).expect(200);
    expect(roastedA.body).toMatchObject({ harvest: '2025/26', variety: 'Bourbon Amarelo' });
  });

  it('3. refuses a roast without enough stock and writes nothing', async () => {
    const before = await get('/v1/production-orders').expect(200);

    const res = await post('/v1/production-orders', {
      stage: 'ROASTING',
      inputs: [{ lotId: ids['greenA'], locationId: ids['warehouse'], quantity: '50' }],
      outputProductId: ids['roasted'],
      outputLocationId: ids['roastery'],
      outputQuantity: '100',
    });
    expect(res.status).toBe(409);
    expect((res.body as { type: string }).type).toBe('/problems/insufficient-stock');

    const after = await get('/v1/production-orders').expect(200);
    expect((after.body as { meta: { total: number } }).meta.total).toBe(
      (before.body as { meta: { total: number } }).meta.total,
    );
  });

  it('4. blends both roasted lots (100 kg + 100 kg → 200 kg)', async () => {
    const res = await post('/v1/production-orders', {
      stage: 'BLENDING',
      inputs: [
        { lotId: ids['roastedA'], locationId: ids['roastery'], quantity: '100' },
        { lotId: ids['roastedB'], locationId: ids['roastery'], quantity: '100' },
      ],
      outputProductId: ids['blend'],
      outputLocationId: ids['roastery'],
      outputQuantity: '200',
    });
    expect(res.status).toBe(201);
    ids['blendLot'] = (res.body as { output: { id: string } }).output.id;

    const blend = await get(`/v1/lots/${ids['blendLot']}`).expect(200);
    // Mesma safra nas duas origens → herdada; variedades diferentes → nenhuma.
    expect(blend.body).toMatchObject({ harvest: '2025/26', variety: null, balance: '200.000' });
  });

  it('5. ships part of the blend to a customer', async () => {
    const res = await post(
      '/v1/shipments',
      {
        customerId: ids['customer'],
        orderRef: 'Pedido 457',
        items: [{ lotId: ids['blendLot'], locationId: ids['roastery'], quantity: '20' }],
      },
      'ship-457-0001',
    );
    expect(res.status).toBe(201);
    expect((res.body as { number: string }).number).toBe('EXP-2026-000001');

    const blend = await get(`/v1/lots/${ids['blendLot']}`).expect(200);
    expect((blend.body as { balance: string }).balance).toBe('180.000');
  });

  it('6. traces the blend backward to both farms', async () => {
    const res = await get(`/v1/lots/${ids['blendLot']}/trace/backward`).expect(200);
    const body = res.body as {
      nodes: Array<{ id: string; depth: number }>;
      edges: unknown[];
      origins: Array<{ farmName: string; region: string }>;
      truncated: boolean;
    };

    expect(body.nodes.map((n) => [n.id, n.depth])).toEqual(
      expect.arrayContaining([
        [ids['blendLot'], 0],
        [ids['roastedA'], 1],
        [ids['roastedB'], 1],
        [ids['greenA'], 2],
        [ids['greenB'], 2],
      ]),
    );
    expect(body.edges).toHaveLength(4);
    expect(body.origins.map((o) => o.farmName).sort()).toEqual([
      'Fazenda Pedra Grande',
      'Sítio Santa Inês',
    ]);
    expect(body.truncated).toBe(false);
  });

  it('7. traces a green lot forward to the customer (the recall question)', async () => {
    const res = await get(`/v1/lots/${ids['greenA']}/trace/forward`).expect(200);
    const body = res.body as {
      nodes: Array<{ id: string }>;
      customers: Array<{ name: string }>;
      shipments: Array<{ number: string; lotId: string; quantity: string }>;
    };

    expect(body.nodes.map((n) => n.id)).toEqual(
      expect.arrayContaining([ids['greenA'], ids['roastedA'], ids['blendLot']]),
    );
    expect(body.customers.map((c) => c.name)).toEqual(['Cafeteria Grão Fino']);
    expect(body.shipments).toEqual([
      expect.objectContaining({
        number: 'EXP-2026-000001',
        lotId: ids['blendLot'],
        quantity: '20.000',
      }),
    ]);
  });

  it('8. keeps the whole chain invisible to another company', async () => {
    await get(`/v1/lots/${ids['blendLot']}`, tokenOtherCompany).expect(404);
    await get(`/v1/lots/${ids['greenA']}/trace/forward`, tokenOtherCompany).expect(404);
    const stock = await get('/v1/stock', tokenOtherCompany).expect(200);
    expect((stock.body as { meta: { total: number } }).meta.total).toBe(0);
  });

  it('9. the ledger is append-only even for direct SQL', async () => {
    await expect(
      testApp.prisma.$executeRawUnsafe('UPDATE stock_movements SET quantity = 1'),
    ).rejects.toThrow(/append-only/);
    await expect(testApp.prisma.$executeRawUnsafe('DELETE FROM lot_origins')).rejects.toThrow(
      /append-only/,
    );
  });
});
