import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef } from 'react';
import { getApiClient, unwrap } from '@/lib/api-client';
import { INVENTORY_KEYS } from './api';

/**
 * Chave de idempotência por envio: a mesma chave é reaproveitada enquanto o corpo for o mesmo
 * (retentativa após erro de rede ou timeout); um corpo diferente ganha uma chave nova. Após o
 * sucesso, `reset()` descarta a chave.
 */
export function useIdempotencyKey() {
  const last = useRef<{ body: string; key: string } | null>(null);

  const keyFor = useCallback((body: unknown) => {
    const serialized = JSON.stringify(body);
    if (last.current?.body !== serialized) {
      last.current = { body: serialized, key: crypto.randomUUID() };
    }
    return last.current.key;
  }, []);

  const reset = useCallback(() => {
    last.current = null;
  }, []);

  return { keyFor, reset };
}

/** Invalida lotes, movimentações e posição de estoque após qualquer mudança no razão. */
export function useInvalidateInventory() {
  const queryClient = useQueryClient();
  return useCallback(
    () =>
      Promise.all(INVENTORY_KEYS.map((key) => queryClient.invalidateQueries({ queryKey: [key] }))),
    [queryClient],
  );
}

/** Locais para selects e filtros (até 100; ativos por padrão). */
export function useLocations(status: 'active' | 'all' = 'active') {
  return useQuery({
    queryKey: ['locations', 'lookup', status],
    queryFn: ({ signal }) =>
      unwrap(
        getApiClient().GET('/v1/locations', {
          params: { query: { status, pageSize: 100, sort: 'code' } },
          signal,
        }),
      ),
    staleTime: 60_000,
  });
}

/** Produtos para filtros (até 100, inclusive inativos: lotes antigos podem usá-los). */
export function useProducts() {
  return useQuery({
    queryKey: ['products', 'lookup'],
    queryFn: ({ signal }) =>
      unwrap(
        getApiClient().GET('/v1/products', {
          params: { query: { status: 'all', pageSize: 100, sort: 'name' } },
          signal,
        }),
      ),
    staleTime: 60_000,
  });
}
