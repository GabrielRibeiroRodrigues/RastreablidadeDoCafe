import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Loader2Icon } from 'lucide-react';
import { Link } from 'react-router';
import { DataTable, type Column } from '@/components/catalog/DataTable';
import { FilterSelect } from '@/components/catalog/FilterSelect';
import { PaginationBar } from '@/components/catalog/PaginationBar';
import { SearchInput } from '@/components/catalog/SearchInput';
import { useListParams, type ListParamsConfig } from '@/components/catalog/use-list-params';
import { Button } from '@/components/ui/button';
import { LOCATION_TYPE_LABELS } from '@/features/locations/api';
import { toOptions } from '@/lib/options';
import { inventoryApi, type StockQuery, type StockRow } from './api';
import { EmptyState, ExpiryText, LotStatusBadge, PageHeader, Quantity } from './components';
import { useLocations, useProducts } from './hooks';
import { LOT_STATUSES, LOT_STATUS_LABELS } from './labels';
import { isUuid } from './url-filters';

const LIST_CONFIG: ListParamsConfig = {
  sorts: [''],
  defaultSort: '',
  filters: { productId: isUuid, locationId: isUuid, lotStatus: LOT_STATUSES },
};

type Row = StockRow & { id: string };

const columns: Column<Row>[] = [
  {
    id: 'lot',
    header: 'Lote',
    cell: (row) => (
      <Link
        to={`/lotes/${row.lot.id}`}
        className="font-mono text-xs font-medium text-primary underline-offset-4 hover:underline"
      >
        {row.lot.code}
      </Link>
    ),
  },
  {
    id: 'product',
    header: 'Produto',
    className: 'whitespace-normal',
    cell: (row) => (
      <div className="min-w-40">
        <div className="font-medium text-foreground">{row.product.name}</div>
        <div className="text-xs text-muted-foreground">{row.product.sku}</div>
      </div>
    ),
  },
  {
    id: 'location',
    header: 'Local',
    cell: (row) => (
      <div>
        <span className="font-mono text-xs">{row.location.code}</span>
        <div className="text-xs text-muted-foreground">
          {row.location.name} · {LOCATION_TYPE_LABELS[row.location.type]}
        </div>
      </div>
    ),
  },
  {
    id: 'quantity',
    header: 'Quantidade',
    className: 'text-right',
    cell: (row) => <Quantity value={row.quantity} unit={row.unit} />,
  },
  { id: 'expiresAt', header: 'Validade', cell: (row) => <ExpiryText value={row.expiresAt} /> },
  { id: 'status', header: 'Status', cell: (row) => <LotStatusBadge status={row.lot.status} /> },
];

/** Posição de estoque: saldo por lote e local. */
export function StockPage() {
  const list = useListParams(LIST_CONFIG);
  const { params } = list;
  const products = useProducts();
  const locations = useLocations('all');

  const query = useQuery({
    queryKey: ['stock', 'list', params],
    queryFn: async ({ signal }) => {
      const { productId, locationId, lotStatus } = params.filters;
      const apiQuery: StockQuery = {
        page: params.page,
        pageSize: params.pageSize,
        ...(params.q ? { q: params.q } : {}),
        ...(productId ? { productId } : {}),
        ...(locationId ? { locationId } : {}),
        ...(lotStatus ? { lotStatus: lotStatus as StockQuery['lotStatus'] } : {}),
      };
      const page = await inventoryApi.stock(apiQuery, signal);
      // Linha = lote × local (a API não devolve um id próprio).
      return {
        ...page,
        data: page.data.map((row) => ({ ...row, id: `${row.lot.id}:${row.location.id}` })),
      };
    },
    placeholderData: keepPreviousData,
  });

  const hasFilters = params.q !== '' || Object.keys(params.filters).length > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Estoque"
        description="Posição atual: quanto há de cada lote em cada local. Calculada do razão de movimentações."
      />

      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <SearchInput
            value={params.q}
            onChange={list.setQuery}
            placeholder="Buscar pelo código do lote"
          />
          <FilterSelect
            label="Produto"
            allLabel="Todos os produtos"
            options={(products.data?.data ?? []).map((p) => ({ value: p.id, label: p.name }))}
            value={params.filters.productId}
            onChange={(value) => list.setFilter('productId', value)}
          />
          <FilterSelect
            label="Local"
            allLabel="Todos os locais"
            options={(locations.data?.data ?? []).map((l) => ({
              value: l.id,
              label: `${l.code} · ${l.name}`,
            }))}
            value={params.filters.locationId}
            onChange={(value) => list.setFilter('locationId', value)}
          />
          <FilterSelect
            label="Status do lote"
            allLabel="Todos os status"
            options={toOptions(LOT_STATUS_LABELS)}
            value={params.filters.lotStatus}
            onChange={(value) => list.setFilter('lotStatus', value)}
          />
          {query.isFetching && !query.isPending && (
            <Loader2Icon
              className="size-4 animate-spin text-muted-foreground sm:ml-auto"
              aria-label="Atualizando"
            />
          )}
        </div>

        <DataTable
          caption="Posição de estoque"
          columns={columns}
          rows={query.data?.data}
          isLoading={query.isPending}
          error={query.isError ? query.error : null}
          onRetry={() => void query.refetch()}
          sort=""
          onSortChange={() => undefined}
          empty={
            <EmptyState>
              <p>{hasFilters ? 'Nenhum saldo para os filtros aplicados.' : 'Estoque vazio.'}</p>
              {hasFilters && (
                <Button variant="outline" size="sm" onClick={list.clearFilters}>
                  Limpar filtros
                </Button>
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
