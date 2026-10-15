import type { Role } from '@traceflow/shared';
import type { AuthMode } from '@/config/env';

export interface AuthUser {
  /** `sub` do token (Cognito ou emissor simulado). */
  id: string;
  email: string;
  name: string;
  roles: Role[];
  /** Nome da empresa (tenant); `null` até existir `GET /v1/me` no modo Cognito. */
  companyName: string | null;
}

export interface AuthSession {
  accessToken: string;
  user: AuthUser;
}

/** Implementação concreta de login/logout (mock ou Cognito). */
export interface AuthStrategy {
  readonly mode: AuthMode;
  /** Recupera uma sessão válida já existente (sessionStorage/oidc store), se houver. */
  restoreSession: () => Promise<AuthSession | null>;
  /**
   * Inicia o login. No mock devolve a sessão; no Cognito redireciona para o
   * Hosted UI e devolve `null` (a sessão chega pelo callback).
   */
  login: (email?: string) => Promise<AuthSession | null>;
  /** Conclui o login após o redirect para `/auth/callback`. */
  handleCallback: () => Promise<AuthSession | null>;
  logout: () => Promise<void>;
}

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

export interface AuthContextValue {
  mode: AuthMode;
  status: AuthStatus;
  user: AuthUser | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  login: (email?: string) => Promise<void>;
  logout: () => Promise<void>;
  completeLogin: () => Promise<void>;
}
