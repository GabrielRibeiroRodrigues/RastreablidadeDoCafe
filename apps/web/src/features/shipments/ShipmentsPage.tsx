import { PageHeader } from '@/components/layout/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Loader2Icon, TruckIcon } from 'lucide-react';
import { Link } from 'react-router';
import { useInventoryPermissions } from '@/auth/permissions';
import { DataTable, type Column } from '@/components/catalog/DataTable';
import { FilterSelect } from '@/components/catalog/FilterSelect';
import { PaginationBar } from '@/components/catalog/PaginationBar';
import { PeriodFilter } from '@/components/catalog/PeriodFilter';
import { SearchInput } from '@/components/catalog/SearchInput';
import { useListParams, type ListParamsConfig } from '@/components/catalog/use-list-params';
import { EntityCombobox } from '@/components/form/EntityCombobox';
import { Button } from '@/components/ui/button';
import { inventoryApi, type Lot } from '@/features/inventory/api';
import { isDateParam, isUuid } from '@/features/inventory/url-filters';
import { getApiClient, unwrap } from '@/lib/api-client';
import { formatDateTime, startOfLocalDayIso } from '@/lib/quantity';
import { shipmentsApi, type Shipment, type ShipmentsQuery } from './api';
import { SearchXIcon } from 'lucide-react';

const LIST_CONFIG: ListParamsConfig = {
  sorts: [''],
  defaultSort: '',
  filters: { customerId: isUuid, lotId: isUuid, from: isDateParam, to: isDateParam },
};

const dash = <span className="text-muted-foreground">—</span>;

const columns: Column<Shipment>[] = [
  {
    id: 'number',
    header: 'Expedição',
    cell: (shipment) => (
      <Link
        to={`/expedicao/${shipment.id}`}
        className="font-mono text-xs font-medium text-primary underline-offset-4 hover:underline"
      >
        {shipment.number}
      </Link>
    ),
  },
  {
    id: 'customer',
    header: 'Cliente',
    className: 'whitespace-normal',
    cell: (shipment) => <span className="font-medium">{shipment.customer.name}</span>,
  },
  { id: 'orderRef', header: 'Pedido / NF', cell: (shipment) => shipment.orderRef ?? dash },
  {
    id: 'items',
    header: 'Itens',
    className: 'text-right',
    cell: (shipment) => <span className="tabular-nums">{shipment.itemsCount}</span>,
  },
  {
    id: 'shippedAt',
    header: 'Data',
    cell: (shipment) => <span className="tabular-nums">{formatDateTime(shipment.shippedAt)}</span>,
  },
  { id: 'user', header: 'Usuário', cell: (shipment) => shipment.user.name },
];

const searchLots = (q: string, signal: AbortSignal) =>
  unwrap(
    getApiClient().GET('/v1/lots', {
      params: { query: { pageSize: 20, sort: '-receivedAt', ...(q && { q }) } },
      signal,
    }),
  ).then((page) => page.data);

function useCustomerOptions() {
  return useQuery({
    queryKey: ['customers', 'lookup'],
    queryFn: ({ signal }) =>
      unwrap(
        getApiClient().GET('/v1/customers', {
          params: { query: { status: 'all', pageSize: 100, sort: 'name' } },
          signal,
        }),
      ),
    staleTime: 60_000,
  });
}

/** Expedições para clientes, mais recentes primeiro. */
export function ShipmentsPage() {
  const { canOperate } = useInventoryPermissions();
  const list = useListParams(LIST_CONFIG);
  const { params } = list;
  const { customerId, lotId, from, to } = params.filters;
  const customers = useCustomerOptions();
  // Rótulo do filtro de lote (o id vem da URL).
  const lotFilter = useQuery({
    queryKey: ['lots', 'detail', lotId],
    queryFn: ({ signal }) => inventoryApi.getLot(lotId ?? '', signal),
    enabled: Boolean(lotId),
  });

  const query = useQuery({
    queryKey: ['shipments', 'list', params],
    queryFn: ({ signal }) => {
      const apiQuery: ShipmentsQuery = {
        page: params.page,
        pageSize: params.pageSize,
        ...(params.q ? { q: params.q } : {}),
        ...(customerId ? { customerId } : {}),
        ...(lotId ? { lotId } : {}),
        ...(from ? { from: startOfLocalDayIso(from) } : {}),
        ...(to ? { to: startOfLocalDayIso(to, 1) } : {}),
      };
      return shipmentsApi.list(apiQuery, signal);
    },
    placeholderData: keepPreviousData,
  });

  const hasFilters = params.q !== '' || Object.keys(params.filters).length > 0;
  const selectedLot: Lot | null = lotId && lotFilter.data ? lotFilter.data : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Expedição"
        breadcrumbs={[{ label: 'Operação' }, { label: 'Expedição' }]}
        description="Saídas de café para clientes. Cada item baixa o estoque de um lote num local; correções são feitas por estorno da saída."
        actions={
          canOperate && (
            <Button asChild>
              <Link to="/expedicao/nova">
                <TruckIcon />
                Nova expedição
              </Link>
            </Button>
          )
        }
      />

      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <SearchInput
            value={params.q}
            onChange={list.setQuery}
            placeholder="Número da EXP ou pedido/NF"
          />
          <FilterSelect
            label="Cliente"
            allLabel="Todos os clientes"
            options={(customers.data?.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
            value={customerId}
            onChange={(value) => list.setFilter('customerId', value)}
          />
          <div className="w-full sm:w-56">
            <EntityCombobox<Lot>
              queryKey="lots"
              search={searchLots}
              value={selectedLot}
              clearable
              onChange={(lot) => list.setFilter('lotId', lot?.id ?? null)}
              placeholder={lotId && !selectedLot ? 'Carregando lote…' : 'Filtrar por lote'}
              getLabel={(lot) => lot.code}
              renderOption={(lot) => (
                <div>
                  <div className="font-mono text-xs font-medium">{lot.code}</div>
                  <div className="truncate text-xs text-muted-foreground">{lot.product.name}</div>
                </div>
              )}
            />
          </div>
          <PeriodFilter
            from={from}
            to={to}
            onChange={(name, value) => list.setFilter(name, value)}
          />
          {query.isFetching && !query.isPending && (
            <Loader2Icon
              className="size-4 animate-spin text-muted-foreground sm:ml-auto"
              aria-label="Atualizando"
            />
          )}
        </div>

        <DataTable
          caption="Expedições"
          columns={columns}
          rows={query.data?.data}
          isLoading={query.isPending}
          error={query.isError ? query.error : null}
          onRetry={() => void query.refetch()}
          sort=""
          onSortChange={() => undefined}
          empty={
            hasFilters ? (
              <EmptyState
                icon={SearchXIcon}
                title="Nenhuma expedição encontrada"
                description="Nenhuma expedição corresponde aos filtros aplicados."
                action={
                  <Button variant="outline" size="sm" onClick={list.clearFilters}>
                    Limpar filtros
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={TruckIcon}
                title="Nenhuma expedição ainda"
                description="Cada expedição baixa o estoque dos lotes enviados e registra o cliente de destino."
                action={
                  canOperate && (
                    <Button size="sm" asChild>
                      <Link to="/expedicao/nova">
                        <TruckIcon />
                        Registrar a primeira expedição
                      </Link>
                    </Button>
                  )
                }
              />
            )
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
