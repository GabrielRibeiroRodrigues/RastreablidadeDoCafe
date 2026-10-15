import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { BoxesIcon, Loader2Icon, PackagePlusIcon } from 'lucide-react';
import { Link } from 'react-router';
import { useInventoryPermissions } from '@/auth/permissions';
import { DataTable, type Column } from '@/components/catalog/DataTable';
import { FilterSelect } from '@/components/catalog/FilterSelect';
import { PaginationBar } from '@/components/catalog/PaginationBar';
import { SearchInput } from '@/components/catalog/SearchInput';
import { useListParams, type ListParamsConfig } from '@/components/catalog/use-list-params';
import { Button } from '@/components/ui/button';
import { toOptions } from '@/lib/options';
import { inventoryApi, type Lot, type LotsQuery } from './api';
import { EmptyState, ExpiryText, LotStatusBadge, PageHeader, Quantity } from './components';
import { useProducts } from './hooks';
import { EXPIRY_WINDOWS, LOT_STATUSES, LOT_STATUS_LABELS } from './labels';
import { isUuid } from './url-filters';

const LIST_CONFIG: ListParamsConfig = {
  sorts: ['-receivedAt', 'receivedAt', 'code', '-code', 'expiresAt', '-expiresAt'],
  defaultSort: '-receivedAt',
  filters: {
    // `lotStatus` na URL: `status` já é usado pelo filtro Ativos/Inativos dos cadastros.
    lotStatus: LOT_STATUSES,
    productId: isUuid,
    expiresWithinDays: EXPIRY_WINDOWS,
  },
};

const columns: Column<Lot>[] = [
  {
    id: 'code',
    header: 'Código',
    sortKey: 'code',
    cell: (lot) => (
      <Link
        to={`/lotes/${lot.id}`}
        className="font-mono text-xs font-medium text-primary underline-offset-4 hover:underline"
      >
        {lot.code}
      </Link>
    ),
  },
  {
    id: 'product',
    header: 'Produto',
    className: 'whitespace-normal',
    cell: (lot) => (
      <div className="min-w-40">
        <div className="font-medium text-foreground">{lot.product.name}</div>
        <div className="text-xs text-muted-foreground">{lot.product.sku}</div>
      </div>
    ),
  },
  {
    id: 'supplier',
    header: 'Fornecedor',
    className: 'whitespace-normal',
    cell: (lot) =>
      lot.supplier ? (
        <div className="min-w-32">
          <div>{lot.supplier.name}</div>
          {lot.supplier.farmName && (
            <div className="text-xs text-muted-foreground">{lot.supplier.farmName}</div>
          )}
        </div>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    id: 'balance',
    header: 'Saldo',
    className: 'text-right',
    cell: (lot) => (
      <div>
        <Quantity value={lot.balance} unit={lot.unit} />
        <div className="text-xs text-muted-foreground">
          de <Quantity value={lot.initialQuantity} unit={lot.unit} />
        </div>
      </div>
    ),
  },
  {
    id: 'receivedAt',
    header: 'Recebido',
    sortKey: 'receivedAt',
    cell: (lot) => new Date(lot.receivedAt).toLocaleDateString('pt-BR'),
  },
  {
    id: 'expiresAt',
    header: 'Validade',
    sortKey: 'expiresAt',
    cell: (lot) => <ExpiryText value={lot.expiresAt} />,
  },
  { id: 'status', header: 'Status', cell: (lot) => <LotStatusBadge status={lot.status} /> },
];

export function LotsPage() {
  const { canOperate } = useInventoryPermissions();
  const list = useListParams(LIST_CONFIG);
  const { params } = list;
  const products = useProducts();

  const query = useQuery({
    queryKey: ['lots', 'list', params],
    queryFn: ({ signal }) => {
      const { lotStatus, productId, expiresWithinDays } = params.filters;
      const apiQuery: LotsQuery = {
        page: params.page,
        pageSize: params.pageSize,
        sort: params.sort as LotsQuery['sort'],
        ...(params.q ? { q: params.q } : {}),
        ...(lotStatus ? { status: lotStatus as LotsQuery['status'] } : {}),
        ...(productId ? { productId } : {}),
        ...(expiresWithinDays ? { expiresWithinDays: Number(expiresWithinDays) } : {}),
      };
      return inventoryApi.listLots(apiQuery, signal);
    },
    placeholderData: keepPreviousData,
  });

  const newReceipt = canOperate && (
    <Button asChild>
      <Link to="/recebimento">
        <PackagePlusIcon />
        Novo recebimento
      </Link>
    </Button>
  );

  const hasFilters = params.q !== '' || Object.keys(params.filters).length > 0;
  const empty = hasFilters ? (
    <EmptyState>
      <p>Nenhum lote para os filtros aplicados.</p>
      <Button variant="outline" size="sm" onClick={list.clearFilters}>
        Limpar filtros
      </Button>
    </EmptyState>
  ) : (
    <EmptyState>
      <div className="flex size-11 items-center justify-center rounded-full bg-accent text-accent-foreground">
        <BoxesIcon className="size-5" aria-hidden />
      </div>
      <p className="font-medium text-foreground">Nenhum lote recebido</p>
      <p>Os lotes nascem no recebimento de café dos fornecedores.</p>
      {newReceipt}
    </EmptyState>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Lotes"
        description="Cada recebimento gera um lote rastreável, com qualidade, validade e saldo por local."
        actions={newReceipt}
      />

      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <SearchInput
            value={params.q}
            onChange={list.setQuery}
            placeholder="Buscar pelo código (CAF-2026-…)"
          />
          <FilterSelect
            label="Produto"
            allLabel="Todos os produtos"
            options={(products.data?.data ?? []).map((p) => ({ value: p.id, label: p.name }))}
            value={params.filters.productId}
            onChange={(value) => list.setFilter('productId', value)}
          />
          <FilterSelect
            label="Status"
            allLabel="Todos os status"
            options={toOptions(LOT_STATUS_LABELS)}
            value={params.filters.lotStatus}
            onChange={(value) => list.setFilter('lotStatus', value)}
          />
          <FilterSelect
            label="Validade"
            allLabel="Qualquer validade"
            options={EXPIRY_WINDOWS.map((days) => ({
              value: days,
              label: `Vencendo em ${days} dias`,
            }))}
            value={params.filters.expiresWithinDays}
            onChange={(value) => list.setFilter('expiresWithinDays', value)}
          />
          {query.isFetching && !query.isPending && (
            <Loader2Icon
              className="size-4 animate-spin text-muted-foreground sm:ml-auto"
              aria-label="Atualizando"
            />
          )}
        </div>

        <DataTable
          caption="Lista de lotes"
          columns={columns}
          rows={query.data?.data}
          isLoading={query.isPending}
          error={query.isError ? query.error : null}
          onRetry={() => void query.refetch()}
          sort={params.sort}
          onSortChange={list.setSort}
          empty={empty}
          isMuted={(lot) => lot.status === 'CONSUMED'}
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
