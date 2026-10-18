import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resetDatabase } from './support/database.js';
import { createScenario, type Scenario } from './support/scenario.js';
import { createTestApp, type TestApp } from './support/test-app.js';

interface ImportBody {
  dryRun: boolean;
  total: number;
  valid: number;
  invalid: number;
  created: number;
  errors: Array<{ line: number; field: string; messages: string[] }>;
}

/** Importação de cadastros (tudo ou nada) e relatórios CSV (escape contra fórmulas). */
describe('CSV imports and reports (e2e)', () => {
  let testApp: TestApp;
  let s: Scenario;

  const importCsv = (
    entity: string,
    csv: string,
    dryRun: boolean,
    as: 'admin' | 'operator' = 'admin',
  ) =>
    testApp
      .http()
      .post(`/v1/imports/${entity}?dryRun=${dryRun}`)
      .auth(s.tokens[as], { type: 'bearer' })
      .set('Content-Type', 'text/csv')
      .send(csv);

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

  describe('imports', () => {
    const products = (...rows: string[]) => ['sku;name;type;unit', ...rows].join('\r\n');

    it('dry-run validates without writing', async () => {
      const res = await importCsv('products', products('IMP-1;Bourbon;green;kg'), true).expect(200);
      expect(res.body).toMatchObject({ dryRun: true, total: 1, valid: 1, created: 0 });
      expect(await testApp.prisma.product.count({ where: { sku: 'IMP-1' } })).toBe(0);
    });

    it('writes all rows when every row is valid', async () => {
      const res = await importCsv(
        'products',
        products('IMP-1;Bourbon;GREEN;KG', 'IMP-2;Torrado;roasted;kg'),
        false,
      ).expect(200);
      expect(res.body).toMatchObject({ created: 2, invalid: 0 });
    });

    it('writes nothing when a single row is invalid (all or nothing)', async () => {
      const res = await importCsv(
        'products',
        products('IMP-1;Bourbon;GREEN;KG', 'IMP-2;Sem tipo;CAFE;KG', 'IMP-3;Arara;GREEN;KG'),
        false,
      ).expect(200);
      const body = res.body as ImportBody;

      expect(body).toMatchObject({ total: 3, valid: 2, invalid: 1, created: 0 });
      expect(body.errors).toEqual([expect.objectContaining({ line: 3, field: 'type' })]);
      expect(await testApp.prisma.product.count({ where: { sku: { startsWith: 'IMP-' } } })).toBe(
        0,
      );
    });

    it('reports duplicates inside the file and against existing records', async () => {
      // SKU no formato que a API grava (maiúsculas).
      const existing = 'VERDE-EXISTENTE';
      await testApp.prisma.product.update({
        where: { id: s.products.green.id },
        data: { sku: existing },
      });
      const res = await importCsv(
        'products',
        products('IMP-1;Arara;GREEN;KG', 'IMP-1;Bourbon;GREEN;KG', `${existing};Catuaí;GREEN;KG`),
        false,
      ).expect(200);
      const body = res.body as ImportBody;

      expect(body.created).toBe(0);
      expect(body.errors.map((e) => [e.line, e.messages[0]])).toEqual([
        [3, 'sku repeats line 2'],
        [4, 'sku already exists'],
      ]);
    });

    it('two simultaneous imports of the same records create them only once', async () => {
      const csv = products('IMP-1;Arara;GREEN;KG', 'IMP-2;Bourbon;GREEN;KG');
      const results = await Promise.all([
        importCsv('products', csv, false),
        importCsv('products', csv, false),
      ]);

      const created = results.map((res) => (res.body as ImportBody).created ?? 0);
      expect(created.reduce((a, b) => a + b, 0)).toBe(2);
      for (const res of results) expect([200, 409]).toContain(res.status);
      expect(await testApp.prisma.product.count({ where: { sku: { startsWith: 'IMP-' } } })).toBe(
        2,
      );
    });

    it('rejects unknown columns and is admin-only', async () => {
      const res = await importCsv('products', 'sku;nome\r\nX;Y', true).expect(200);
      expect((res.body as ImportBody).errors[0]).toMatchObject({ line: 1, field: 'nome' });

      const operator = await importCsv(
        'products',
        products('IMP-1;Arara;GREEN;KG'),
        true,
        'operator',
      );
      expect(operator.status).toBe(403);
    });

    it('imports customers as a different company never collide with this one', async () => {
      const other = await createScenario(testApp, 'Outra Empresa');
      const csv = 'name;document\r\nCafeteria Igual;11222333000181';
      await importCsv('customers', csv, false).expect(200);

      const res = await testApp
        .http()
        .post('/v1/imports/customers?dryRun=true')
        .auth(other.tokens.admin, { type: 'bearer' })
        .set('Content-Type', 'text/csv')
        .send(csv)
        .expect(200);
      expect((res.body as ImportBody).errors).toEqual([]);
    });
  });

  describe('reports', () => {
    it('exports lots with the same filters as the list', async () => {
      const kept = await s.receive('10');
      const blocked = await s.receive('20');
      await s.http
        .patch(`/v1/lots/${blocked}/status`, { status: 'BLOCKED', reason: 'Teste de filtro' })
        .expect(200);
      const [keptCode, blockedCode] = [(await s.lot(kept)).code, (await s.lot(blocked)).code];

      const all = await s.http.get('/v1/reports/lots.csv').expect(200);
      expect(all.headers['content-disposition']).toMatch(/lotes/);
      expect(all.text).toContain(keptCode);
      expect(all.text).toContain(blockedCode);

      const onlyBlocked = await s.http.get('/v1/reports/lots.csv?status=BLOCKED').expect(200);
      expect(onlyBlocked.text).toContain(blockedCode);
      expect(onlyBlocked.text).not.toContain(keptCode);
      expect(onlyBlocked.text).toContain('Bloqueado');
    });

    it('neutralizes spreadsheet formulas in user-provided text', async () => {
      await testApp.prisma.customer.update({
        where: { id: s.customer.id },
        data: { name: '=HYPERLINK("http://evil.example","clique")' },
      });
      const lot = await s.receive('100');
      const roasted = await s.produce(
        [{ lotId: lot, locationId: s.locations.warehouse.id, quantity: '50' }],
        '40',
      );
      await s.ship(roasted, '5');

      const res = await s.http.get('/v1/reports/shipments.csv').expect(200);
      expect(res.headers['content-type']).toMatch(/text\/csv/);
      expect(res.text).toContain(`"'=HYPERLINK(""http://evil.example"",""clique"")"`);
      expect(res.text).not.toMatch(/(^|;)=HYPERLINK/m);
    });
  });
});
