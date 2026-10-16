import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ClipboardCheckIcon, ClipboardPlusIcon, Loader2Icon, SearchXIcon } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { useQualityPermissions } from '@/auth/permissions';
import { DataTable, type Column } from '@/components/catalog/DataTable';
import { FilterSelect } from '@/components/catalog/FilterSelect';
import { PaginationBar } from '@/components/catalog/PaginationBar';
import { useListParams, type ListParamsConfig } from '@/components/catalog/use-list-params';
import { EmptyState } from '@/components/EmptyState';
import { EntityCombobox } from '@/components/form/EntityCombobox';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { inventoryApi, type Lot } from '@/features/inventory/api';
import { LotStatusBadge } from '@/features/inventory/components';
import { isUuid } from '@/features/inventory/url-filters';
import { toOptions } from '@/lib/options';
import { formatDateTime } from '@/lib/quantity';
import {
  nonConformitiesApi,
  searchLots,
  type NonConformitiesQuery,
  type NonConformity,
} from './api';
import { NcStatusBadge, NcTypeBadge } from './components';
import { NC_STATUSES, NC_STATUS_LABELS, NC_TYPES, NC_TYPE_LABELS } from './labels';
import { OpenNcDialog } from './OpenNcDialog';

const LIST_CONFIG: ListParamsConfig = {
  sorts: [''],
  defaultSort: '',
  filters: { ncStatus: NC_STATUSES, type: NC_TYPES, lotId: isUuid },
};

const columns: Column<NonConformity>[] = [
  {
    id: 'number',
    header: 'NC',
    cell: (nc) => (
      <Link
        to={`/qualidade/${nc.id}`}
        className="font-mono text-xs font-medium text-primary underline-offset-4 hover:underline"
      >
        {nc.number}
      </Link>
    ),
  },
  {
    id: 'lot',
    header: 'Lote',
    cell: (nc) => (
      <span className="inline-flex flex-wrap items-center justify-end gap-1.5 md:justify-start">
        <Link
          to={`/lotes/${nc.lot.id}`}
          className="font-mono text-xs underline-offset-4 hover:underline"
        >
          {nc.lot.code}
        </Link>
        <LotStatusBadge status={nc.lot.status} />
      </span>
    ),
  },
  { id: 'type', header: 'Tipo', cell: (nc) => <NcTypeBadge type={nc.type} /> },
  {
    id: 'description',
    header: 'Descrição',
    className: 'whitespace-normal',
    mobile: 'hidden',
    cell: (nc) => <span className="line-clamp-2 min-w-48">{nc.description}</span>,
  },
  { id: 'status', header: 'Status', cell: (nc) => <NcStatusBadge status={nc.status} /> },
  {
    id: 'opened',
    header: 'Aberta em',
    cell: (nc) => (
      <div>
        <span className="tabular-nums">{formatDateTime(nc.openedAt)}</span>
        <div className="text-xs text-muted-foreground">{nc.openedBy.name}</div>
      </div>
    ),
  },
];

/** Não conformidades da empresa, mais recentes primeiro. */
export function NonConformitiesPage() {
  const { canOpenNc } = useQualityPermissions();
  const [opening, setOpening] = useState(false);
  const list = useListParams(LIST_CONFIG);
  const { params } = list;
  const { ncStatus, type, lotId } = params.filters;
  const lotFilter = useQuery({
    queryKey: ['lots', 'detail', lotId],
    queryFn: ({ signal }) => inventoryApi.getLot(lotId ?? '', signal),
    enabled: Boolean(lotId),
  });

  const query = useQuery({
    queryKey: ['non-conformities', 'list', params],
    queryFn: ({ signal }) => {
      const apiQuery: NonConformitiesQuery = {
        page: params.page,
        pageSize: params.pageSize,
        ...(ncStatus ? { status: ncStatus as NonConformitiesQuery['status'] } : {}),
        ...(type ? { type: type as NonConformitiesQuery['type'] } : {}),
        ...(lotId ? { lotId } : {}),
      };
      return nonConformitiesApi.list(apiQuery, signal);
    },
    placeholderData: keepPreviousData,
  });

  const hasFilters = Object.keys(params.filters).length > 0;
  const selectedLot: Lot | null = lotId && lotFilter.data ? lotFilter.data : null;
  const openButton = canOpenNc && (
    <Button onClick={() => setOpening(true)}>
      <ClipboardPlusIcon />
      Abrir NC
    </Button>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Qualidade"
        breadcrumbs={[{ label: 'Qualidade' }, { label: 'Não conformidades' }]}
        description="Não conformidades de lotes: o lote fica em quarentena até a liberação ou o descarte (baixa do saldo) por um administrador."
        actions={openButton}
      />

      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <FilterSelect
            label="Status"
            allLabel="Todos os status"
            options={toOptions(NC_STATUS_LABELS)}
            value={ncStatus}
            onChange={(value) => list.setFilter('ncStatus', value)}
          />
          <FilterSelect
            label="Tipo"
            allLabel="Todos os tipos"
            options={toOptions(NC_TYPE_LABELS)}
            value={type}
            onChange={(value) => list.setFilter('type', value)}
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
          {query.isFetching && !query.isPending && (
            <Loader2Icon
              className="size-4 animate-spin text-muted-foreground sm:ml-auto"
              aria-label="Atualizando"
            />
          )}
        </div>

        <DataTable
          caption="Não conformidades"
          columns={columns}
          rows={query.data?.data}
          isLoading={query.isPending}
          error={query.isError ? query.error : null}
          onRetry={() => void query.refetch()}
          sort=""
          onSortChange={() => undefined}
          isMuted={(nc) => nc.status !== 'OPEN'}
          empty={
            hasFilters ? (
              <EmptyState
                icon={SearchXIcon}
                title="Nenhuma não conformidade encontrada"
                description="Nenhuma NC corresponde aos filtros aplicados."
                action={
                  <Button variant="outline" size="sm" onClick={list.clearFilters}>
                    Limpar filtros
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={ClipboardCheckIcon}
                title="Nenhuma não conformidade"
                description="Registre um problema de qualidade (umidade, defeitos, pragas…) para pôr o lote em quarentena."
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

      {opening && <OpenNcDialog onClose={() => setOpening(false)} />}
    </div>
  );
}
