import { Controller, Get, Post } from '@nestjs/common';
import { generateKeyPair, SignJWT, type JWTPayload } from 'jose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Roles } from '../src/auth/decorators.js';
import { MOCK_ISSUER, MockKeyStore } from '../src/auth/mock-key-store.js';
import type { ProblemDetails } from '../src/common/http/problem-details.filter.js';
import { Role, type Company, type User } from '../src/generated/prisma/client.js';
import { resetDatabase } from './support/database.js';
import { factories } from './support/factories.js';
import { createTestApp, type TestApp } from './support/test-app.js';

/** Rotas só de teste para exercitar os perfis. */
@Controller('probe-auth')
class RolesProbeController {
  @Get('any')
  any() {
    return { ok: true };
  }

  @Post('write')
  @Roles('admin', 'operator')
  write() {
    return { ok: true };
  }

  @Post('admin')
  @Roles('admin')
  admin() {
    return { ok: true };
  }
}

describe('Authentication and roles (e2e)', () => {
  let testApp: TestApp;
  let make: ReturnType<typeof factories>;
  let company: Company;
  let admin: User;
  let operator: User;
  let auditor: User;

  const tokenFor = async (user: User): Promise<string> => {
    const res = await testApp.http().post('/v1/dev/token').send({ email: user.email }).expect(200);
    return (res.body as { accessToken: string }).accessToken;
  };

  /** Assina com a chave do emissor simulado, permitindo montar tokens "quase válidos". */
  const signWithMockKey = (claims: JWTPayload & { sub: string }, ttlSeconds = 60) =>
    testApp.app.get(MockKeyStore).sign(claims, ttlSeconds);

  beforeAll(async () => {
    testApp = await createTestApp({ controllers: [RolesProbeController] });
    make = factories(testApp.prisma);
  });

  beforeEach(async () => {
    await resetDatabase(testApp.prisma);
    company = await make.company({ name: 'Torrefação Teste' });
    admin = await make.user(company.id, { role: Role.ADMIN, email: 'admin@test.dev' });
    operator = await make.user(company.id, { role: Role.OPERATOR, email: 'op@test.dev' });
    auditor = await make.user(company.id, { role: Role.AUDITOR, email: 'aud@test.dev' });
  });

  afterAll(async () => {
    await testApp.close();
  });

  describe('mock issuer', () => {
    it('lists active users with company and roles', async () => {
      await make.user(company.id, { email: 'inactive@test.dev', isActive: false });

      const res = await testApp.http().get('/v1/dev/users').expect(200);

      expect(res.body).toEqual(
        expect.arrayContaining([
          {
            email: 'admin@test.dev',
            name: admin.name,
            roles: ['admin'],
            companyName: 'Torrefação Teste',
          },
        ]),
      );
      expect(JSON.stringify(res.body)).not.toContain('inactive@test.dev');
    });

    it('issues a Cognito-shaped access token', async () => {
      const res = await testApp.http().post('/v1/dev/token').send({ email: operator.email });

      expect(res.status).toBe(200);
      const { accessToken, expiresIn } = res.body as { accessToken: string; expiresIn: number };
      expect(expiresIn).toBe(3600);
      const payload = JSON.parse(
        Buffer.from(accessToken.split('.')[1] ?? '', 'base64url').toString(),
      ) as Record<string, unknown>;
      expect(payload).toMatchObject({
        iss: MOCK_ISSUER,
        sub: operator.cognitoSub,
        token_use: 'access',
        client_id: 'traceflow-local',
        'cognito:groups': ['operator'],
      });
    });

    it('returns 404 for an unknown e-mail', async () => {
      await testApp.http().post('/v1/dev/token').send({ email: 'nobody@test.dev' }).expect(404);
    });

    it('publishes its public key as JWKS', async () => {
      const res = await testApp.http().get('/v1/dev/.well-known/jwks.json').expect(200);
      expect((res.body as { keys: Array<{ kty: string }> }).keys[0]).toMatchObject({
        kty: 'RSA',
        alg: 'RS256',
      });
    });
  });

  describe('GET /v1/me', () => {
    it('returns the authenticated user and company', async () => {
      const token = await tokenFor(admin);
      const res = await testApp.http().get('/v1/me').auth(token, { type: 'bearer' }).expect(200);

      expect(res.body).toEqual({
        id: admin.id,
        email: admin.email,
        name: admin.name,
        roles: ['admin'],
        company: { id: company.id, name: 'Torrefação Teste' },
      });
    });

    it('requires a token (problem+json 401)', async () => {
      const res = await testApp.http().get('/v1/me').expect(401);
      expect(res.headers['content-type']).toContain('application/problem+json');
      expect((res.body as ProblemDetails).title).toBe('Unauthorized');
    });
  });

  describe('rejected tokens', () => {
    it('rejects a token signed by another key', async () => {
      const { privateKey } = await generateKeyPair('RS256');
      const forged = await new SignJWT({
        token_use: 'access',
        client_id: 'traceflow-local',
        'cognito:groups': ['admin'],
      })
        .setProtectedHeader({ alg: 'RS256' })
        .setSubject(admin.cognitoSub)
        .setIssuer(MOCK_ISSUER)
        .setExpirationTime('5m')
        .sign(privateKey);

      await testApp.http().get('/v1/me').auth(forged, { type: 'bearer' }).expect(401);
    });

    it('rejects an expired token', async () => {
      const expired = await signWithMockKey({ sub: admin.cognitoSub }, -10);
      await testApp.http().get('/v1/me').auth(expired, { type: 'bearer' }).expect(401);
    });

    it('rejects an ID token used as access token', async () => {
      const idToken = await signWithMockKey({ sub: admin.cognitoSub, token_use: 'id' });
      await testApp.http().get('/v1/me').auth(idToken, { type: 'bearer' }).expect(401);
    });

    it('rejects a token issued for another app client', async () => {
      const token = await signWithMockKey({ sub: admin.cognitoSub, client_id: 'other' });
      await testApp.http().get('/v1/me').auth(token, { type: 'bearer' }).expect(401);
    });

    it('rejects a valid token whose user is unknown', async () => {
      const token = await signWithMockKey({ sub: 'ghost-user' });
      await testApp.http().get('/v1/me').auth(token, { type: 'bearer' }).expect(401);
    });

    it('rejects a valid token whose user was deactivated', async () => {
      const token = await tokenFor(operator);
      await testApp.prisma.user.update({ where: { id: operator.id }, data: { isActive: false } });

      await testApp.http().get('/v1/me').auth(token, { type: 'bearer' }).expect(401);
    });

    it('rejects a malformed Authorization header', async () => {
      await testApp.http().get('/v1/me').set('Authorization', 'Bearer not.a.jwt').expect(401);
    });
  });

  describe('roles', () => {
    it.each([
      ['admin', 'any', 200],
      ['operator', 'any', 200],
      ['auditor', 'any', 200],
      ['admin', 'write', 201],
      ['operator', 'write', 201],
      ['auditor', 'write', 403],
      ['admin', 'admin', 201],
      ['operator', 'admin', 403],
      ['auditor', 'admin', 403],
    ])('%s on /%s -> %i', async (who, route, status) => {
      const user = { admin, operator, auditor }[who] as User;
      const method = route === 'any' ? 'get' : 'post';
      // Token antes da requisição: o supertest não suporta outra requisição no meio da cadeia.
      const token = await tokenFor(user);

      await testApp
        .http()
        [method](`/v1/probe-auth/${route}`)
        .auth(token, { type: 'bearer' })
        .expect(status);
    });

    it('uses the role from the database, not the token groups (ADR 0012)', async () => {
      // Token sem grupos (ex.: emitido antes de uma mudança de perfil): vale o perfil do banco.
      const token = await signWithMockKey({ sub: admin.cognitoSub, 'cognito:groups': [] });
      await testApp.http().post('/v1/probe-auth/admin').auth(token, { type: 'bearer' }).expect(201);

      // Grupos "promovidos" no token também não valem: um operador continua operador.
      const forged = await signWithMockKey({
        sub: operator.cognitoSub,
        'cognito:groups': ['admin'],
      });
      await testApp
        .http()
        .post('/v1/probe-auth/admin')
        .auth(forged, { type: 'bearer' })
        .expect(403);
    });
  });
});
