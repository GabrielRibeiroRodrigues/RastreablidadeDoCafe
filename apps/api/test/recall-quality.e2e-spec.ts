import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resetDatabase } from './support/database.js';
import { createScenario, newKey, type Problem, type Scenario } from './support/scenario.js';
import { createTestApp, type TestApp } from './support/test-app.js';

interface RecallBody {
  id: string;
  number: string;
  status: string;
  lotsCount: number;
  customersCount: number;
  steps: Array<{ name: string; status: string; attempts: number }>;
  lots: Array<{ lot: { id: string; status: string } }>;
  customers: Array<{ customer: { id: string } }>;
}

/** Recall (impacto, bloqueio, retomada, encerramento), não conformidade e trilha de auditoria. */
describe('Recall, quality and audit (e2e)', () => {
  let testApp: TestApp;
  let s: Scenario;
  /** G → R (torra) → expedido ao cliente; G2 sem relação com G. */
  const lots: Record<string, string> = {};

  const recall = (lotId: string) =>
    s.http.post('/v1/recalls', { lotId, reason: 'Ocratoxina acima do limite', severity: 'HIGH' });

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(testApp.prisma);
    s = await createScenario(testApp);
    lots['g'] = await s.receive('100');
    lots['r'] = await s.produce(
      [{ lotId: lots['g'], locationId: s.locations.warehouse.id, quantity: '50' }],
      '40',
    );
    await s.ship(lots['r'], '10');
    lots['g2'] = await s.receive('100');
  });

  afterAll(async () => {
    await testApp.close();
  });

  describe('recall', () => {
    it('simulation is read-only', async () => {
      const res = await s.http.post('/v1/recalls/simulate', { lotId: lots['g'] }, 'auditor');
      expect(res.status).toBe(200);
      expect((await s.lot(lots['g']!)).status).toBe('AVAILABLE');
      expect(await testApp.prisma.recall.count()).toBe(0);
    });

    it('blocks the origin and every derived lot and lists the customers to contact', async () => {
      const res = await recall(lots['g']!);
      expect(res.status).toBe(201);
      const body = res.body as RecallBody;

      expect(body).toMatchObject({ status: 'COMPLETED', lotsCount: 2, customersCount: 1 });
      expect(body.steps.map((step) => [step.name, step.status])).toEqual([
        ['BLOCK_LOTS', 'COMPLETED'],
        ['REPORT', 'SKIPPED'], // sem bucket nos testes
        ['NOTIFY', 'COMPLETED'],
      ]);
      expect(body.customers.map((c) => c.customer.id)).toEqual([s.customer.id]);
      expect((await s.lot(lots['g']!)).status).toBe('BLOCKED');
      expect((await s.lot(lots['r']!)).status).toBe('BLOCKED');
      expect((await s.lot(lots['g2']!)).status).toBe('AVAILABLE');

      // Lote bloqueado não sai mais.
      const shipment = await s.http.post('/v1/shipments', {
        customerId: s.customer.id,
        items: [{ lotId: lots['r'], locationId: s.locations.roastery.id, quantity: '1' }],
      });
      expect(shipment.status).toBe(409);
      expect((shipment.body as Problem).type).toBe('/problems/lot-not-movable');
    });

    it('only one recall can be opened at a time for the same lot, even concurrently', async () => {
      const results = await Promise.all(Array.from({ length: 4 }, () => recall(lots['g']!)));

      expect(results.filter((res) => res.status === 201)).toHaveLength(1);
      for (const res of results.filter((r) => r.status !== 201)) {
        expect(res.status).toBe(409);
        expect((res.body as Problem).type).toBe('/problems/recall-already-open');
      }
      expect(await testApp.prisma.recall.count()).toBe(1);
    });

    it('retry resumes from the failed step without redoing completed ones', async () => {
      const created = (await recall(lots['g']!).expect(201)).body as RecallBody;
      // Simula falha na notificação (ex.: SNS fora do ar).
      await testApp.prisma.recall.update({
        where: { id: created.id },
        data: { status: 'FAILED', lastError: 'NOTIFY: SNS indisponível' },
      });
      await testApp.prisma.recallStep.updateMany({
        where: { recallId: created.id, name: 'NOTIFY' },
        data: { status: 'FAILED', error: 'SNS indisponível' },
      });

      const results = await Promise.all(
        Array.from({ length: 3 }, () => s.http.post(`/v1/recalls/${created.id}/retry`)),
      );
      const ok = results.filter((res) => res.status < 300);
      expect(ok).toHaveLength(1);
      for (const res of results.filter((r) => r.status >= 300)) {
        expect((res.body as Problem).type).toBe('/problems/recall-not-startable');
      }

      const after = (await s.http.get(`/v1/recalls/${created.id}`).expect(200)).body as RecallBody;
      expect(after.status).toBe('COMPLETED');
      const attempts = Object.fromEntries(after.steps.map((step) => [step.name, step.attempts]));
      expect(attempts).toEqual({ BLOCK_LOTS: 1, REPORT: 1, NOTIFY: 2 });
    });

    it('a completed recall cannot be retried; an open one cannot be closed early', async () => {
      const created = (await recall(lots['g']!).expect(201)).body as RecallBody;
      const retry = await s.http.post(`/v1/recalls/${created.id}/retry`);
      expect(retry.status).toBe(409);

      await testApp.prisma.recall.update({
        where: { id: created.id },
        data: { status: 'EXECUTING' },
      });
      const close = await s.http.post(`/v1/recalls/${created.id}/close`, {
        notes: 'Encerrado cedo demais',
      });
      expect(close.status).toBe(409);
      expect((close.body as Problem).type).toBe('/problems/recall-not-closable');
    });

    it('lots stay blocked until the recall is closed and an admin releases them', async () => {
      const created = (await recall(lots['g']!).expect(201)).body as RecallBody;
      const release = () =>
        s.http.patch(`/v1/lots/${lots['r']}/status`, {
          status: 'AVAILABLE',
          reason: 'Liberado após análise',
        });

      const early = await release();
      expect(early.status).toBe(409);
      expect((early.body as Problem).type).toBe('/problems/lot-under-recall');

      await s.http
        .post(`/v1/recalls/${created.id}/close`, {
          notes: 'Clientes contatados e estoque recolhido',
        })
        .expect(200);
      expect((await s.lot(lots['r']!)).status).toBe('BLOCKED');
      await release().expect(200);
      expect((await s.lot(lots['r']!)).status).toBe('AVAILABLE');

      // Encerrado, um novo recall do mesmo lote volta a ser possível.
      expect((await recall(lots['g']!)).status).toBe(201);
    });

    it('warns consumers on the public page while the recalled lot stays blocked', async () => {
      const TOKEN = 'recallNoticeToken_0001';
      await testApp.prisma.lot.update({ where: { id: lots['r'] }, data: { publicToken: TOKEN } });
      const page = async () =>
        (await testApp.http().get(`/v1/public/trace/${TOKEN}`).expect(200)).body as {
          recall: { severity: string; since: string } | null;
        };

      expect((await page()).recall).toBeNull();

      const created = (await recall(lots['g']!).expect(201)).body as RecallBody;
      const notice = (await page()).recall;
      expect(notice).toMatchObject({ severity: 'HIGH' });
      expect(JSON.stringify(notice)).not.toContain('Ocratoxina'); // motivo interno não vaza

      await s.http
        .post(`/v1/recalls/${created.id}/close`, { notes: 'Análise concluída: sem risco' })
        .expect(200);
      expect((await page()).recall).not.toBeNull(); // encerrado, mas o lote segue bloqueado

      await s.http
        .patch(`/v1/lots/${lots['r']}/status`, { status: 'AVAILABLE', reason: 'Laudo negativo' })
        .expect(200);
      expect((await page()).recall).toBeNull();
    });

    it('only admins create, retry or close recalls', async () => {
      expect(
        (
          await s.http.post(
            '/v1/recalls',
            { lotId: lots['g'], reason: 'Teste', severity: 'LOW' },
            'operator',
          )
        ).status,
      ).toBe(403);
    });
  });

  describe('non-conformity', () => {
    const open = (lotId: string, description = 'Umidade de 13,8% na reanálise') =>
      s.http.post('/v1/non-conformities', { lotId, type: 'MOISTURE', description }, 'operator');

    it('quarantines the lot and releases it only when no NC is left open', async () => {
      const first = (await open(lots['g2']!).expect(201)).body as { id: string };
      const second = (await open(lots['g2']!, 'Defeitos acima do padrão').expect(201)).body as {
        id: string;
      };
      expect((await s.lot(lots['g2']!)).status).toBe('QUARANTINE');

      await s.http
        .post(`/v1/non-conformities/${first.id}/release`, { justification: 'Reanálise ok: 11,9%' })
        .expect(200);
      expect((await s.lot(lots['g2']!)).status).toBe('QUARANTINE');

      await s.http
        .post(`/v1/non-conformities/${second.id}/release`, { justification: 'Catação refeita' })
        .expect(200);
      expect((await s.lot(lots['g2']!)).status).toBe('AVAILABLE');
    });

    it('discard writes off the whole balance in every location and consumes the lot', async () => {
      // 30 kg vão para a quarentena antes: o descarte precisa baixar os dois locais.
      await s.http
        .post('/v1/movements', {
          type: 'TRANSFER',
          lotId: lots['g2'],
          fromLocationId: s.locations.warehouse.id,
          toLocationId: s.locations.quarantine.id,
          quantity: '30',
        })
        .expect(201);
      const nc = (await open(lots['g2']!).expect(201)).body as { id: string; number: string };

      await s.http
        .post(`/v1/non-conformities/${nc.id}/discard`, { justification: 'Lote mofado, destruído' })
        .expect(200);

      expect(await s.lot(lots['g2']!)).toMatchObject({ balance: '0.000', status: 'CONSUMED' });
      const losses = await testApp.prisma.stockMovement.findMany({
        where: { lotId: lots['g2'], type: 'ADJUSTMENT' },
      });
      expect(
        losses.map((m) => [m.fromLocationId, m.quantity.toFixed(3), m.documentRef]).sort(),
      ).toEqual(
        [
          [s.locations.quarantine.id, '30.000', nc.number],
          [s.locations.warehouse.id, '70.000', nc.number],
        ].sort(),
      );
    });

    it('an NC is resolved exactly once even when release and discard race', async () => {
      const nc = (await open(lots['g2']!).expect(201)).body as { id: string };

      const results = await Promise.all([
        s.http.post(`/v1/non-conformities/${nc.id}/release`, { justification: 'Reanálise ok' }),
        s.http.post(`/v1/non-conformities/${nc.id}/discard`, { justification: 'Destruir lote' }),
        s.http.post(`/v1/non-conformities/${nc.id}/release`, { justification: 'Reanálise ok' }),
      ]);

      expect(results.filter((res) => res.status === 200)).toHaveLength(1);
      for (const res of results.filter((r) => r.status !== 200)) {
        expect((res.body as Problem).type).toBe('/problems/non-conformity-not-open');
      }
      const lot = await s.lot(lots['g2']!);
      // Ou foi liberado (saldo intacto) ou descartado (saldo zerado) — nunca uma mistura.
      expect([
        ['AVAILABLE', '100.000'],
        ['CONSUMED', '0.000'],
      ]).toContainEqual([lot.status, lot.balance]);
    });

    it('enforces roles: auditors cannot open, operators cannot resolve', async () => {
      const denied = await s.http.post(
        '/v1/non-conformities',
        { lotId: lots['g2'], type: 'MOISTURE', description: 'Teste de perfil' },
        'auditor',
      );
      expect(denied.status).toBe(403);

      const nc = (await open(lots['g2']!).expect(201)).body as { id: string };
      const release = await s.http.post(
        `/v1/non-conformities/${nc.id}/release`,
        { justification: 'Sem permissão' },
        'operator',
      );
      expect(release.status).toBe(403);
    });
  });

  describe('audit trail', () => {
    const entriesFor = (entityId: string) =>
      testApp.prisma.auditLog.findMany({ where: { entityId }, orderBy: { createdAt: 'asc' } });

    it('records one entry per audited write (no duplicate from the fallback interceptor)', async () => {
      const res = await s.http
        .post('/v1/movements', {
          type: 'ISSUE',
          lotId: lots['g2'],
          fromLocationId: s.locations.warehouse.id,
          quantity: '5',
        })
        .expect(201);
      const entries = await entriesFor((res.body as { id: string }).id);

      expect(entries.map((e) => e.action)).toEqual(['movement.created']);
      expect(entries[0]).toMatchObject({
        companyId: s.company.id,
        userId: s.users.admin.id,
      });
      expect(entries[0]!.requestId).toBeTruthy();
    });

    it('idempotent replays do not add entries', async () => {
      const key = newKey();
      const body = {
        type: 'ISSUE',
        lotId: lots['g2'],
        fromLocationId: s.locations.warehouse.id,
        quantity: '5',
      };
      const first = await s.http.post('/v1/movements', body, 'admin', key).expect(201);
      await s.http.post('/v1/movements', body, 'admin', key).expect(201);

      const id = (first.body as { id: string }).id;
      expect(await entriesFor(id)).toHaveLength(1);
      expect(
        await testApp.prisma.auditLog.count({ where: { action: { startsWith: 'http.' } } }),
      ).toBe(0);
    });

    it('writes without an explicit audit get exactly one fallback entry', async () => {
      const res = await s.http.post('/v1/customers', { name: 'Empório Central' }).expect(201);
      const entries = await entriesFor((res.body as { id: string }).id);

      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({ action: 'http.post', entityType: 'customers' });
    });

    it('failed writes leave no entry', async () => {
      const before = await testApp.prisma.auditLog.count();
      await s.http
        .post('/v1/movements', {
          type: 'ISSUE',
          lotId: lots['g2'],
          fromLocationId: s.locations.warehouse.id,
          quantity: '999',
        })
        .expect(409);
      expect(await testApp.prisma.auditLog.count()).toBe(before);
    });

    it('auditors can read the trail but not write anything', async () => {
      await s.http.get('/v1/audit-logs', 'auditor').expect(200);
      const res = await s.http.post('/v1/customers', { name: 'Cliente' }, 'auditor');
      expect(res.status).toBe(403);
    });
  });
});
