import { useQuery } from '@tanstack/react-query';
import type { ApiSchema } from '@traceflow/shared';
import { getApiClient, unwrap } from '@/lib/api-client';

/**
 * A API devolve também `status`, `daysToExpiry` e `expired` em cada item, mas o contrato OpenAPI
 * ainda não os declara (TODO(openapi)); por isso ficam opcionais aqui.
 */
export type ExpiringLot = ApiSchema<'ExpiringLot'> & {
  status?: ApiSchema<'LotStatus'>;
  daysToExpiry?: number;
  expired?: boolean;
};

/** Janela padrão do alerta de validade (igual a `ALERT_EXPIRY_DAYS` da API). */
export const ALERT_DAYS = 30;

export const alertsApi = {
  expiring: async (days: number, signal?: AbortSignal) => {
    const response = await unwrap(
      getApiClient().GET('/v1/alerts/expiring', {
        params: { query: { days } },
        ...(signal ? { signal } : {}),
      }),
    );
    return { ...response, data: response.data as ExpiringLot[] };
  },
};

/** Lotes com saldo vencidos ou vencendo na janela. Cache de 5 min (sino do cabeçalho). */
export function useExpiringLots(days = ALERT_DAYS, enabled = true) {
  return useQuery({
    queryKey: ['alerts', 'expiring', days],
    queryFn: ({ signal }) => alertsApi.expiring(days, signal),
    staleTime: 5 * 60_000,
    enabled,
  });
}
