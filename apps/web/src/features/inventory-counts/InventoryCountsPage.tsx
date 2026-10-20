import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ClipboardListIcon, Loader2Icon, PlusIcon, SearchXIcon } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { useInventoryPermissions } from '@/auth/permissions';
import { DataTable, type Column } from '@/components/catalog/DataTable';
import { FilterSelect } from '@/components/catalog/FilterSelect';
import { PaginationBar } from '@/components/catalog/PaginationBar';
import { useListParams, type ListParamsConfig } from '@/components/catalog/use-list-params';
import { EmptyState } from '@/components/EmptyState';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { useLocations } from '@/features/inventory/hooks';
import { isUuid } from '@/features/inventory/url-filters';
import { toOptions } from '@/lib/options';
import { formatDateTime } from '@/lib/quantity';
import { inventoryCountsApi, type InventoryCount, type InventoryCountsQuery } from './api';
import { CountStatusBadge } from './components';
import { COUNT_STATUSES, COUNT_STATUS_LABELS } from './labels';
import { NewCountDialog } from './NewCountDialog';

const LIST_CONFIG: ListParamsConfig = {
  sorts: [''],
  defaultSort: '',
  filters: { countStatus: COUNT_STATUSES, locationId: isUuid },
};

const columns: Column<InventoryCount>[] = [
  {
    id: 'number',
    header: 'Contagem',
    cell: (count) => (
      <Link
        to={`/inventario/${count.id}`}
        className="font-mono text-xs font-medium text-primary underline-offset-4 hover:underline"
      >
        {count.number}
      </Link>
    ),
  },
  {
    id: 'location',
    header: 'Local',
    cell: (count) => (
      <span>
        <span className="font-mono text-xs">{count.location.code}</span> {count.location.name}
      </span>
    ),
  },
  { id: 'status', header: 'Status', cell: (count) => <CountStatusBadge status={count.status} /> },
  {
    id: 'progress',
    header: 'Contados',
    cell: (count) => (
      <span className="tabular-nums">
        {count.countedCount} de {count.itemsCount}
      </span>
    ),
  },
  {
    id: 'created',
    header: 'Aberta em',
    cell: (count) => (
      <div>
        <span className="tabular-nums">{formatDateTime(count.createdAt)}</span>
        <div className="text-xs text-muted-foreground">{count.createdBy.name}</div>
      </div>
    ),
  },
];

/** Contagens de inventário, mais recentes primeiro. */
export function InventoryCountsPage() {
  const { canOperate } = useInventoryPermissions();
  const [opening, setOpening] = useState(false);
  const list = useListParams(LIST_CONFIG);
  const { params } = list;
  const { countStatus, locationId } = params.filters;
  const locations = useLocations('all');

  const query = useQuery({
    queryKey: ['inventory-counts', 'list', params],
    queryFn: ({ signal }) => {
      const apiQuery: InventoryCountsQuery = {
        page: params.page,
        pageSize: params.pageSize,
        ...(countStatus ? { status: countStatus as InventoryCountsQuery['status'] } : {}),
        ...(locationId ? { locationId } : {}),
      };
      return inventoryCountsApi.list(apiQuery, signal);
    },
    placeholderData: keepPreviousData,
  });

  const hasFilters = Object.keys(params.filters).length > 0;
  const openButton = canOperate && (
    <Button onClick={() => setOpening(true)}>
      <PlusIcon />
      Nova contagem
    </Button>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventário"
        breadcrumbs={[{ label: 'Estoque' }, { label: 'Inventário' }]}
        description="Contagem física por local: as diferenças entre o contado e o saldo do sistema viram ajustes no estoque quando um administrador aplica a contagem."
        actions={openButton}
      />

      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <FilterSelect
            label="Status"
            allLabel="Todos os status"
            options={toOptions(COUNT_STATUS_LABELS)}
            value={countStatus}
            onChange={(value) => list.setFilter('countStatus', value)}
          />
          <FilterSelect
            label="Local"
            allLabel="Todos os locais"
            options={(locations.data?.data ?? []).map((item) => ({
              value: item.id,
              label: `${item.code} — ${item.name}`,
            }))}
            value={locationId}
            onChange={(value) => list.setFilter('locationId', value)}
          />
          {query.isFetching && !query.isPending && (
            <Loader2Icon
              className="size-4 animate-spin text-muted-foreground sm:ml-auto"
              aria-label="Atualizando"
            />
          )}
        </div>

        <DataTable
          caption="Contagens de inventário"
          columns={columns}
          rows={query.data?.data}
          isLoading={query.isPending}
          error={query.isError ? query.error : null}
          onRetry={() => void query.refetch()}
          sort=""
          onSortChange={() => undefined}
          isMuted={(count) => count.status === 'CANCELLED'}
          empty={
            hasFilters ? (
              <EmptyState
                icon={SearchXIcon}
                title="Nenhuma contagem encontrada"
                description="Nenhuma contagem corresponde aos filtros aplicados."
                action={
                  <Button variant="outline" size="sm" onClick={list.clearFilters}>
                    Limpar filtros
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={ClipboardListIcon}
                title="Nenhuma contagem"
                description="Abra uma contagem para conferir o estoque físico de um local com o saldo do sistema."
                action={openButton}
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

      {opening && <NewCountDialog onClose={() => setOpening(false)} />}
    </div>
  );
}
