import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getEnv } from '@/config/env';
import { AuthContext } from './auth-context';
import { createAuthStrategy } from './strategies';
import type { AuthContextValue, AuthSession, AuthStatus, AuthStrategy } from './types';

interface AuthProviderProps {
  children: ReactNode;
  /** Permite injetar outra estratégia (testes); por padrão vem de `VITE_AUTH_MODE`. */
  strategy?: AuthStrategy;
}

export function AuthProvider({ children, strategy: injected }: AuthProviderProps) {
  const [strategy] = useState(() => injected ?? createAuthStrategy(getEnv()));
  const queryClient = useQueryClient();
  const [session, setSession] = useState<AuthSession | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');

  const applySession = useCallback((next: AuthSession | null) => {
    setSession(next);
    setStatus(next ? 'authenticated' : 'unauthenticated');
  }, []);

  useEffect(() => {
    let active = true;
    void strategy
      .restoreSession()
      .catch(() => null)
      .then((restored) => {
        if (active) applySession(restored);
      });
    return () => {
      active = false;
    };
  }, [strategy, applySession]);

  const login = useCallback(
    async (email?: string) => {
      const next = await strategy.login(email);
      if (next) applySession(next);
    },
    [strategy, applySession],
  );

  const completeLogin = useCallback(async () => {
    applySession(await strategy.handleCallback());
  }, [strategy, applySession]);

  const logout = useCallback(async () => {
    await strategy.logout();
    // Evita que dados em cache de uma empresa apareçam para o próximo usuário.
    queryClient.clear();
    applySession(null);
  }, [strategy, queryClient, applySession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      mode: strategy.mode,
      status,
      user: session?.user ?? null,
      accessToken: session?.accessToken ?? null,
      isAuthenticated: status === 'authenticated',
      login,
      logout,
      completeLogin,
    }),
    [strategy.mode, status, session, login, logout, completeLogin],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}
