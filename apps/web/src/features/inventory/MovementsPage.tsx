import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Loader2Icon, XIcon } from 'lucide-react';
import { useId } from 'react';
import { Link } from 'react-router';
import { DataTable } from '@/components/catalog/DataTable';
import { FilterSelect } from '@/components/catalog/FilterSelect';
import { PaginationBar } from '@/components/catalog/PaginationBar';
import { useListParams, type ListParamsConfig } from '@/components/catalog/use-list-params';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toOptions } from '@/lib/options';
import { startOfLocalDayIso } from '@/lib/quantity';
import { inventoryApi, type MovementsQuery } from './api';
import { EmptyState, PageHeader } from './components';
import { useLocations } from './hooks';
import { MOVEMENT_TYPES, MOVEMENT_TYPE_LABELS } from './labels';
import { movementColumns } from './movement-columns';
import { isDateParam, isUuid } from './url-filters';

const LIST_CONFIG: ListParamsConfig = {
  sorts: [''],
  defaultSort: '',
  filters: {
    type: MOVEMENT_TYPES,
    locationId: isUuid,
    lotId: isUuid,
    from: isDateParam,
    to: isDateParam,
  },
};

const columns = movementColumns({ showLot: true });

/** Razão de estoque: todas as movimentações, mais recentes primeiro. */
export function MovementsPage() {
  const list = useListParams(LIST_CONFIG);
  const { params } = list;
  const { type, locationId, lotId, from, to } = params.filters;
  const locations = useLocations('all');
  const fromId = useId();
  const toId = useId();

  const query = useQuery({
    queryKey: ['movements', 'list', params],
    queryFn: ({ signal }) => {
      const apiQuery: MovementsQuery = {
        page: params.page,
        pageSize: params.pageSize,
        ...(type ? { type: type as MovementsQuery['type'] } : {}),
        ...(locationId ? { locationId } : {}),
        ...(lotId ? { lotId } : {}),
        // Período em dias locais: "até" inclui o dia escolhido (a API trata `to` como exclusivo).
        ...(from ? { from: startOfLocalDayIso(from) } : {}),
        ...(to ? { to: startOfLocalDayIso(to, 1) } : {}),
      };
      return inventoryApi.listMovements(apiQuery, signal);
    },
    placeholderData: keepPreviousData,
  });

  const lotCode = lotId ? query.data?.data[0]?.lot.code : undefined;
  const hasFilters = Object.keys(params.filters).length > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Movimentações"
        description="Razão de estoque: entradas, saídas, transferências, ajustes e estornos. Nenhuma linha é alterada ou apagada."
      />

      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <FilterSelect
            label="Tipo"
            allLabel="Todos os tipos"
            options={toOptions(MOVEMENT_TYPE_LABELS)}
            value={type}
            onChange={(value) => list.setFilter('type', value)}
          />
          <FilterSelect
            label="Local"
            allLabel="Todos os locais"
            options={(locations.data?.data ?? []).map((l) => ({
              value: l.id,
              label: `${l.code} · ${l.name}`,
            }))}
            value={locationId}
            onChange={(value) => list.setFilter('locationId', value)}
          />
          <div className="flex items-center gap-2">
            <label htmlFor={fromId} className="text-sm text-muted-foreground">
              De
            </label>
            <Input
              id={fromId}
              type="date"
              className="w-40"
              value={from ?? ''}
              max={to}
              onChange={(event) => list.setFilter('from', event.target.value || null)}
            />
            <label htmlFor={toId} className="text-sm text-muted-foreground">
              até
            </label>
            <Input
              id={toId}
              type="date"
              className="w-40"
              value={to ?? ''}
              min={from}
              onChange={(event) => list.setFilter('to', event.target.value || null)}
            />
          </div>
          {lotId && (
            <Badge variant="outline" className="h-7 gap-1.5 px-2.5">
              Lote {lotCode ?? '…'}
              <button
                type="button"
                aria-label="Remover filtro de lote"
                onClick={() => list.setFilter('lotId', null)}
              >
                <XIcon />
              </button>
            </Badge>
          )}
          {query.isFetching && !query.isPending && (
            <Loader2Icon
              className="size-4 animate-spin text-muted-foreground sm:ml-auto"
              aria-label="Atualizando"
            />
          )}
        </div>

        <DataTable
          caption="Movimentações de estoque"
          columns={columns}
          rows={query.data?.data}
          isLoading={query.isPending}
          error={query.isError ? query.error : null}
          onRetry={() => void query.refetch()}
          sort=""
          onSortChange={() => undefined}
          isMuted={(movement) => movement.reversedById !== null}
          empty={
            <EmptyState>
              <p>
                {hasFilters
                  ? 'Nenhuma movimentação para os filtros aplicados.'
                  : 'Nenhuma movimentação ainda.'}
              </p>
              {hasFilters ? (
                <Button variant="outline" size="sm" onClick={list.clearFilters}>
                  Limpar filtros
                </Button>
              ) : (
                <Link to="/lotes" className="text-primary underline-offset-4 hover:underline">
                  Ir para Lotes
                </Link>
              )}
            </EmptyState>
          }
        />

        {query.data && query.data.meta.total > 0 && (
          <PaginationBar
            meta={query.data.meta}
            onPageChange={list.setPage}
            onPageSizeChange={list.setPageSize}
            disabled={query.isPlaceholderData}
          />
        )}
      </div>
    </div>
  );
}
