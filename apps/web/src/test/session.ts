import type { Role } from '@traceflow/shared';
import { fakeJwt } from './fake-jwt';

/** Grava uma sessão do modo mock no sessionStorage, como se o usuário já tivesse entrado. */
export function signInAs(role: Role) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  window.sessionStorage.setItem(
    'traceflow.auth.session',
    JSON.stringify({
      accessToken: fakeJwt({ sub: `user-${role}`, 'cognito:groups': [role], exp }),
      user: {
        id: `user-${role}`,
        email: `${role}@serraazul.dev`,
        name: `Usuário ${role}`,
        roles: [role],
        companyName: 'Torrefação Serra Azul',
      },
    }),
  );
}
