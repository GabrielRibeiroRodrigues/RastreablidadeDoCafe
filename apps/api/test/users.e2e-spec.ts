import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resetDatabase } from './support/database.js';
import { createScenario, type Problem, type Scenario } from './support/scenario.js';
import { createTestApp, type TestApp } from './support/test-app.js';

interface UserBody {
  id: string;
  email: string;
  role: string;
  isActive: boolean;
  isCurrentUser: boolean;
}

/** Gestão de usuários da empresa (ADR 0012): só admin, perfil do banco vale na hora. */
describe('Users (e2e)', () => {
  let testApp: TestApp;
  let s: Scenario;

  const tokenFor = async (email: string) =>
    (
      (await testApp.http().post('/v1/dev/token').send({ email }).expect(200)).body as {
        accessToken: string;
      }
    ).accessToken;

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

  it('lists the company users and marks the current one', async () => {
    const res = await s.http.get('/v1/users').expect(200);
    const users = (res.body as { data: UserBody[] }).data;

    expect(users).toHaveLength(3);
    expect(users.filter((u) => u.isCurrentUser).map((u) => u.id)).toEqual([s.users.admin.id]);
  });

  it('invites a user who can log in right away with the chosen role', async () => {
    const res = await s.http
      .post('/v1/users', { email: ' Carla@Torrefacao.dev ', name: 'Carla Dias', role: 'operator' })
      .expect(201);
    expect(res.body).toMatchObject({
      email: 'carla@torrefacao.dev',
      role: 'operator',
      isActive: true,
    });

    const token = await tokenFor('carla@torrefacao.dev');
    const me = await testApp.http().get('/v1/me').auth(token, { type: 'bearer' }).expect(200);
    expect(me.body).toMatchObject({ roles: ['operator'], company: { id: s.company.id } });

    const audit = await testApp.prisma.auditLog.findFirst({ where: { action: 'user.invited' } });
    expect(audit?.entityId).toBe((res.body as UserBody).id);
  });

  it('rejects a duplicate e-mail, even from another company, in the field', async () => {
    const other = await createScenario(testApp, 'Outra Empresa');
    const res = await s.http.post('/v1/users', {
      email: other.users.operator.email,
      name: 'Repetido',
      role: 'auditor',
    });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ errors: [{ field: 'email' }] });
  });

  it('role changes take effect on the next request (no token refresh)', async () => {
    const operatorToken = s.tokens.operator;
    const createCustomer = () =>
      testApp
        .http()
        .post('/v1/customers')
        .auth(operatorToken, { type: 'bearer' })
        .send({ name: 'Cliente Novo' });

    await createCustomer().expect(201);
    await s.http.patch(`/v1/users/${s.users.operator.id}`, { role: 'auditor' }).expect(200);
    // Mesmo token de antes: agora é auditor e não pode escrever.
    expect((await createCustomer()).status).toBe(403);
  });

  it('deactivation blocks the existing token immediately', async () => {
    await s.http.post(`/v1/users/${s.users.operator.id}/deactivate`).expect(200);
    const res = await testApp.http().get('/v1/me').auth(s.tokens.operator, { type: 'bearer' });
    expect(res.status).toBe(401);

    await s.http.post(`/v1/users/${s.users.operator.id}/activate`).expect(200);
    await testApp.http().get('/v1/me').auth(s.tokens.operator, { type: 'bearer' }).expect(200);
  });

  it('an admin cannot demote or deactivate themselves', async () => {
    const own = await s.http.patch(`/v1/users/${s.users.admin.id}`, { role: 'operator' });
    expect((own.body as Problem).type).toBe('/problems/own-role');
    const self = await s.http.post(`/v1/users/${s.users.admin.id}/deactivate`);
    expect((self.body as Problem).type).toBe('/problems/own-account');
  });

  it('two admins demoting each other at the same time leave one admin', async () => {
    await s.http.patch(`/v1/users/${s.users.operator.id}`, { role: 'admin' }).expect(200);
    const demote = (token: string, id: string) =>
      testApp
        .http()
        .patch(`/v1/users/${id}`)
        .auth(token, { type: 'bearer' })
        .send({ role: 'operator' });

    const results = await Promise.all([
      demote(s.tokens.admin, s.users.operator.id),
      demote(s.tokens.operator, s.users.admin.id),
    ]);

    const admins = await testApp.prisma.user.count({
      where: { companyId: s.company.id, role: 'ADMIN', isActive: true },
    });
    // A segunda transação espera a trava, vê que sobraria nenhum admin e recusa.
    expect(admins).toBe(1);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const refused = results.find((r) => r.status === 409)!;
    expect((refused.body as Problem).type).toBe('/problems/last-admin');
  });

  it('is admin-only and isolated per company', async () => {
    expect((await s.http.get('/v1/users', 'operator')).status).toBe(403);
    expect((await s.http.get('/v1/users', 'auditor')).status).toBe(403);

    const other = await createScenario(testApp, 'Outra Empresa');
    expect((await s.http.get(`/v1/users/${other.users.admin.id}`)).status).toBe(404);
    expect(
      (await s.http.patch(`/v1/users/${other.users.admin.id}`, { role: 'auditor' })).status,
    ).toBe(404);
    expect((await s.http.post(`/v1/users/${other.users.admin.id}/deactivate`)).status).toBe(404);
  });
});
