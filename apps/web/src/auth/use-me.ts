import type { ApiSchema } from '@traceflow/shared';
import { useQuery } from '@tanstack/react-query';
import { getApiClient, unwrap } from '@/lib/api-client';
import { useAuth } from './auth-context';

export type Me = ApiSchema<'MeResponse'>;

/**
 * Usuário autenticado segundo a API (`GET /v1/me`), com a empresa. Funciona nos dois modos de
 * login — no Cognito o token não traz a empresa.
 */
export function useMe() {
  const { isAuthenticated, user } = useAuth();
  return useQuery({
    queryKey: ['me', user?.id],
    queryFn: ({ signal }) => unwrap(getApiClient().GET('/v1/me', { signal })),
    enabled: isAuthenticated,
    staleTime: 5 * 60_000,
  });
}
