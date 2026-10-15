import { UserManager, WebStorageStateStore, type User } from 'oidc-client-ts';
import type { CognitoConfig } from '@/config/env';
import { extractRoles } from '@/lib/jwt';
import type { AuthSession, AuthStrategy } from '../types';

function toSession(user: User): AuthSession {
  const { profile } = user;
  return {
    accessToken: user.access_token,
    user: {
      id: profile.sub,
      email: profile.email ?? '',
      name: profile.name ?? profile.email ?? 'Usuário',
      // Os grupos do Cognito também vêm no access token, que é o que a API recebe.
      roles: extractRoles(user.access_token),
      companyName: null,
    },
  };
}

/**
 * Login pelo Hosted UI/Managed Login do Cognito: Authorization Code + PKCE
 * (o `oidc-client-ts` gera o code_verifier automaticamente com `response_type=code`).
 */
export function createCognitoStrategy(config: CognitoConfig): AuthStrategy {
  const manager = new UserManager({
    authority: config.authority,
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    post_logout_redirect_uri: config.logoutUri,
    response_type: 'code',
    scope: 'openid email profile',
    userStore: new WebStorageStateStore({ store: window.sessionStorage }),
    automaticSilentRenew: false,
  });

  return {
    mode: 'cognito',

    async restoreSession() {
      const user = await manager.getUser();
      return user && !user.expired ? toSession(user) : null;
    },

    async login(email) {
      await manager.signinRedirect(email ? { login_hint: email } : undefined);
      return null;
    },

    async handleCallback() {
      return toSession(await manager.signinRedirectCallback());
    },

    async logout() {
      await manager.removeUser();
      // O Cognito não publica `end_session_endpoint`; o logout é pelo endpoint do domínio.
      const url = new URL('/logout', config.domain);
      url.searchParams.set('client_id', config.clientId);
      url.searchParams.set('logout_uri', config.logoutUri);
      window.location.assign(url.toString());
    },
  };
}
