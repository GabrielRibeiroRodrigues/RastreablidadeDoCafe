import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';

export const RECORD_STATUSES = ['active', 'inactive', 'all'] as const;
export type RecordStatus = (typeof RECORD_STATUSES)[number];

export const PAGE_SIZES = [10, 20, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 20;

export interface ListParamsConfig {
  sorts: readonly string[];
  defaultSort: string;
  /**
   * Filtros extras aceitos na URL: a lista de valores válidos de cada um, ou uma função de
   * validação (ex.: UUID de um produto, data `AAAA-MM-DD`).
   */
  filters?: Record<string, readonly string[] | ((value: string) => boolean)>;
}

export interface ListParams {
  page: number;
  pageSize: number;
  q: string;
  status: RecordStatus;
  sort: string;
  filters: Record<string, string>;
}

function oneOf<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

/** Lê a URL tolerando valores inválidos (link editado à mão, filtro removido do código...). */
export function parseListParams(search: URLSearchParams, config: ListParamsConfig): ListParams {
  const page = Number.parseInt(search.get('page') ?? '', 10);
  const pageSize = Number.parseInt(search.get('pageSize') ?? '', 10);
  const filters: Record<string, string> = {};
  for (const [name, allowed] of Object.entries(config.filters ?? {})) {
    const value = search.get(name);
    const valid = typeof allowed === 'function' ? allowed : (v: string) => allowed.includes(v);
    if (value !== null && value !== '' && valid(value)) filters[name] = value;
  }

  return {
    page: Number.isInteger(page) && page >= 1 ? page : 1,
    pageSize: (PAGE_SIZES as readonly number[]).includes(pageSize) ? pageSize : DEFAULT_PAGE_SIZE,
    q: (search.get('q') ?? '').trim(),
    status: oneOf(search.get('status'), RECORD_STATUSES, 'active'),
    sort: oneOf(search.get('sort'), config.sorts, config.defaultSort),
    filters,
  };
}

/**
 * Estado da listagem (página, busca, filtros, ordenação) guardado na URL: recarregar a página,
 * voltar/avançar e compartilhar o link preservam a tela. Valores padrão não poluem a URL.
 * Qualquer mudança que não seja de página volta para a página 1.
 */
export function useListParams(config: ListParamsConfig) {
  const [search, setSearch] = useSearchParams();
  const params = useMemo(() => parseListParams(search, config), [search, config]);

  const update = useCallback(
    (changes: Record<string, string | number | null>, options: { replace?: boolean } = {}) => {
      setSearch(
        (current) => {
          const next = new URLSearchParams(current);
          for (const [key, value] of Object.entries(changes)) {
            if (value === null || value === '') next.delete(key);
            else next.set(key, String(value));
          }
          if (!('page' in changes)) next.delete('page');
          if (next.get('page') === '1') next.delete('page');
          if (next.get('status') === 'active') next.delete('status');
          if (next.get('sort') === config.defaultSort) next.delete('sort');
          if (next.get('pageSize') === String(DEFAULT_PAGE_SIZE)) next.delete('pageSize');
          return next;
        },
        { replace: options.replace ?? false },
      );
    },
    [setSearch, config.defaultSort],
  );

  const actions = useMemo(
    () => ({
      setPage: (page: number) => update({ page }),
      setPageSize: (pageSize: number) => update({ pageSize }),
      // Digitação não deve encher o histórico do navegador.
      setQuery: (q: string) => update({ q: q.trim() }, { replace: true }),
      setStatus: (status: RecordStatus) => update({ status }),
      setSort: (sort: string) => update({ sort }),
      setFilter: (name: string, value: string | null) => update({ [name]: value }),
      clearFilters: () =>
        update({
          q: null,
          status: null,
          ...Object.fromEntries(Object.keys(config.filters ?? {}).map((name) => [name, null])),
        }),
    }),
    [update, config.filters],
  );

  const hasFilters =
    params.q !== '' || params.status !== 'active' || Object.keys(params.filters).length > 0;

  return { params, hasFilters, ...actions };
}
