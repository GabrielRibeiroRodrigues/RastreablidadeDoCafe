import type { ApiSchema } from '@traceflow/shared';
import { getApiClient, unwrap } from '@/lib/api-client';
import { decodeJwtPayload, extractRoles } from '@/lib/jwt';
import { sessionStore } from '../session-storage';
import type { AuthSession, AuthStrategy } from '../types';

/** Usuário de desenvolvimento servido por `GET /v1/dev/users` (só com AUTH_MODE=mock na API). */
export type DevUser = ApiSchema<'DevUser'>;

export function fetchDevUsers(signal?: AbortSignal): Promise<DevUser[]> {
  return unwrap(getApiClient().GET('/v1/dev/users', signal ? { signal } : {}));
}

export function createMockStrategy(): AuthStrategy {
  return {
    mode: 'mock',

    restoreSession() {
      return Promise.resolve(sessionStore.read());
    },

    async login(email) {
      if (!email) throw new Error('Selecione um usuário de desenvolvimento.');

      const { accessToken } = await unwrap(
        getApiClient().POST('/v1/dev/token', { body: { email } }),
      );

      // Nome e empresa vêm da lista de usuários de dev (melhor esforço).
      const devUser = await fetchDevUsers()
        .then((users) => users.find((user) => user.email === email))
        .catch(() => undefined);

      const claims = decodeJwtPayload(accessToken) ?? {};
      const claimString = (key: string) => {
        const value = claims[key];
        return typeof value === 'string' ? value : undefined;
      };

      const session: AuthSession = {
        accessToken,
        user: {
          id: claimString('sub') ?? email,
          email,
          name: devUser?.name ?? claimString('name') ?? email,
          roles: extractRoles(accessToken),
          companyName: devUser?.companyName ?? null,
        },
      };

      sessionStore.write(session);
      return session;
    },

    handleCallback() {
      // Não há redirect no modo mock.
      return Promise.resolve(sessionStore.read());
    },

    logout() {
      sessionStore.clear();
      return Promise.resolve();
    },
  };
}
