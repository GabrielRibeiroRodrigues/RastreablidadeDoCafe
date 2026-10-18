import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AlertsService } from '../src/modules/alerts/alerts.service.js';
import { TenantContext } from '../src/tenancy/tenant-context.js';
import { resetDatabase } from './support/database.js';
import { createScenario, type Scenario } from './support/scenario.js';
import { createTestApp, type TestApp } from './support/test-app.js';

interface NotificationBody {
  id: string;
  event: string;
  category: string;
  title: string;
  link: string | null;
  readAt: string | null;
}
type Page = { data: NotificationBody[]; meta: { total: number } };

/** Central de avisos: um aviso por destinatário, por perfil e preferência; cada um vê os seus. */
describe('In-app notifications (e2e)', () => {
  let testApp: TestApp;
  let s: Scenario;

  const inbox = async (as: 'admin' | 'operator' | 'auditor', query = '') =>
    (await s.http.get(`/v1/notifications${query}`, as).expect(200)).body as Page;

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

  it('a recall notifies every profile, with a link to the recall', async () => {
    const lotId = await s.receive('100');
    const recall = await s.http
      .post('/v1/recalls', { lotId, reason: 'Contaminação', severity: 'HIGH' })
      .expect(201);
    const recallId = (recall.body as { id: string }).id;

    for (const as of ['admin', 'operator', 'auditor'] as const) {
      const page = await inbox(as);
      expect(page.data).toEqual([
        expect.objectContaining({
          event: 'recall.executed',
          category: 'recall',
          link: `/recall/${recallId}`,
          readAt: null,
        }),
      ]);
      expect(page.data[0]!.title).toMatch(/1 lote bloqueado$/);
    }
  });

  it('a non-conformity notifies admins and operators, not auditors', async () => {
    const lotId = await s.receive('100');
    const nc = await s.http
      .post(
        '/v1/non-conformities',
        { lotId, type: 'MOISTURE', description: 'Umidade 13,8%' },
        'operator',
      )
      .expect(201);

    const admin = await inbox('admin');
    expect(admin.data[0]).toMatchObject({
      event: 'non_conformity.opened',
      category: 'quality',
      link: `/qualidade/${(nc.body as { id: string }).id}`,
    });
    expect((await inbox('operator')).meta.total).toBe(1);
    expect((await inbox('auditor')).meta.total).toBe(0);
  });

  it('expiry alerts respect muted categories', async () => {
    await s.http
      .put('/v1/notifications/preferences', { muted: ['expiry'] }, 'operator')
      .expect(200);
    await s.http.post('/v1/receipts', {
      productId: s.products.green.id,
      locationId: s.locations.warehouse.id,
      quantity: '10',
      expiresAt: new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10),
    });

    const alerts = testApp.app.get(AlertsService);
    await testApp.app.get(TenantContext).runAs(s.company.id, () => alerts.notifyExpiring(30));

    const admin = await inbox('admin');
    expect(admin.data.map((n) => [n.event, n.link])).toEqual([
      ['lots.expiring', '/lotes?vencendo=30'],
    ]);
    expect(admin.data[0]!.title).toBe('1 lote vencendo em 30 dias');
    expect((await inbox('operator')).meta.total).toBe(0);

    const prefs = await s.http.get('/v1/notifications/preferences', 'operator').expect(200);
    expect(prefs.body).toEqual({ muted: ['expiry'] });
  });

  it('marks one or all as read, only for the owner', async () => {
    const lotId = await s.receive('100');
    await s.http.post('/v1/recalls', { lotId, reason: 'Teste', severity: 'LOW' }).expect(201);
    await s.http
      .post('/v1/non-conformities', { lotId, type: 'OTHER', description: 'Teste de aviso' })
      .expect(201);

    const unread = async (as: 'admin' | 'operator') =>
      (
        (await s.http.get('/v1/notifications/unread-count', as).expect(200)).body as {
          unread: number;
        }
      ).unread;
    expect(await unread('admin')).toBe(2);

    const [first] = (await inbox('admin')).data;
    // Outro usuário não marca (nem enxerga) o aviso da admin.
    expect((await s.http.post(`/v1/notifications/${first!.id}/read`, {}, 'operator')).status).toBe(
      404,
    );
    await s.http.post(`/v1/notifications/${first!.id}/read`).expect(200);
    expect(await unread('admin')).toBe(1);
    expect((await inbox('admin', '?unread=true')).meta.total).toBe(1);

    const all = await s.http.post('/v1/notifications/read-all').expect(200);
    expect(all.body).toEqual({ updated: 1 });
    expect(await unread('admin')).toBe(0);
    expect(await unread('operator')).toBe(2);
  });

  it('rejects unknown categories in preferences', async () => {
    const res = await s.http.put('/v1/notifications/preferences', { muted: ['spam'] });
    expect(res.status).toBe(400);
  });

  it('another company never sees these notifications', async () => {
    const lotId = await s.receive('100');
    await s.http.post('/v1/recalls', { lotId, reason: 'Teste', severity: 'LOW' }).expect(201);
    const other = await createScenario(testApp, 'Outra Empresa');

    const page = (await other.http.get('/v1/notifications').expect(200)).body as Page;
    expect(page.meta.total).toBe(0);
    const [mine] = (await inbox('admin')).data;
    expect((await other.http.post(`/v1/notifications/${mine!.id}/read`)).status).toBe(404);
  });
});
