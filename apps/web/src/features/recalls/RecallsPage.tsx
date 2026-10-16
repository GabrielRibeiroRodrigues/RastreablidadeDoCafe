import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Loader2Icon, SearchXIcon, SirenIcon } from 'lucide-react';
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
import { isUuid } from '@/features/inventory/url-filters';
import { searchLots } from '@/features/quality/api';
import { toOptions } from '@/lib/options';
import { formatDateTime } from '@/lib/quantity';
import { recallsApi, type Recall, type RecallsQuery } from './api';
import { RecallProgress, RecallStatusBadge, SeverityBadge } from './components';
import { RECALL_STATUSES, RECALL_STATUS_LABELS } from './labels';

const LIST_CONFIG: ListParamsConfig = {
  sorts: [''],
  defaultSort: '',
  filters: { recallStatus: RECALL_STATUSES, lotId: isUuid },
};

const columns: Column<Recall>[] = [
  {
    id: 'number',
    header: 'Recall',
    cell: (recall) => (
      <Link
        to={`/recall/${recall.id}`}
        className="font-mono text-xs font-medium text-primary underline-offset-4 hover:underline"
      >
        {recall.number}
      </Link>
    ),
  },
  {
    id: 'origin',
    header: 'Lote de origem',
    cell: (recall) => (
      <Link
        to={`/lotes/${recall.originLot.id}`}
        className="font-mono text-xs underline-offset-4 hover:underline"
      >
        {recall.originLot.code}
      </Link>
    ),
  },
  {
    id: 'reason',
    header: 'Motivo',
    className: 'whitespace-normal',
    mobile: 'hidden',
    cell: (recall) => <span className="line-clamp-2 min-w-48">{recall.reason}</span>,
  },
  {
    id: 'severity',
    header: 'Severidade',
    cell: (recall) => <SeverityBadge severity={recall.severity} />,
  },
  {
    id: 'status',
    header: 'Status',
    cell: (recall) => (
      <div className="inline-flex flex-col items-end gap-1.5 md:items-start">
        <RecallStatusBadge status={recall.status} />
        <RecallProgress status={recall.status} />
      </div>
    ),
  },
  {
    id: 'lots',
    header: 'Lotes',
    className: 'text-right',
    cell: (recall) => <span className="tabular-nums">{recall.lotsCount}</span>,
  },
  {
    id: 'customers',
    header: 'Clientes',
    className: 'text-right',
    cell: (recall) => <span className="tabular-nums">{recall.customersCount}</span>,
  },
  {
    id: 'createdAt',
    header: 'Aberto em',
    cell: (recall) => (
      <div>
        <span className="tabular-nums">{formatDateTime(recall.createdAt)}</span>
        <div className="text-xs text-muted-foreground">{recall.createdBy.name}</div>
      </div>
    ),
  },
];

/** Recalls da empresa, mais recentes primeiro. */
export function RecallsPage() {
  const { canCreateRecall } = useQualityPermissions();
  const list = useListParams(LIST_CONFIG);
  const { params } = list;
  const { recallStatus, lotId } = params.filters;
  const lotFilter = useQuery({
    queryKey: ['lots', 'detail', lotId],
    queryFn: ({ signal }) => inventoryApi.getLot(lotId ?? '', signal),
    enabled: Boolean(lotId),
  });

  const query = useQuery({
    queryKey: ['recalls', 'list', params],
    queryFn: ({ signal }) => {
      const apiQuery: RecallsQuery = {
        page: params.page,
        pageSize: params.pageSize,
        ...(recallStatus ? { status: recallStatus as RecallsQuery['status'] } : {}),
        ...(lotId ? { lotId } : {}),
      };
      return recallsApi.list(apiQuery, signal);
    },
    placeholderData: keepPreviousData,
    // Recall em execução (Step Functions): a lista acompanha o progresso.
    refetchInterval: (q) =>
      q.state.data?.data.some((r) => r.status === 'EXECUTING' || r.status === 'OPEN')
        ? 3000
        : false,
  });

  const hasFilters = Object.keys(params.filters).length > 0;
  const selectedLot: Lot | null = lotId && lotFilter.data ? lotFilter.data : null;
  // A simulação é aberta a todos os perfis; só o admin executa o recall.
  const newRecall = (
    <Button asChild>
      <Link to="/recall/novo">
        <SirenIcon />
        {canCreateRecall ? 'Novo recall' : 'Simular recall'}
      </Link>
    </Button>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Recall"
        breadcrumbs={[{ label: 'Qualidade' }, { label: 'Recall' }]}
        description="Recolhimento de um lote com problema e de tudo o que foi feito com ele: bloqueio dos lotes, relatório e lista de clientes a contatar."
        actions={newRecall}
      />

      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <FilterSelect
            label="Status"
            allLabel="Todos os status"
            options={toOptions(RECALL_STATUS_LABELS)}
            value={recallStatus}
            onChange={(value) => list.setFilter('recallStatus', value)}
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
          caption="Recalls"
          columns={columns}
          rows={query.data?.data}
          isLoading={query.isPending}
          error={query.isError ? query.error : null}
          onRetry={() => void query.refetch()}
          sort=""
          onSortChange={() => undefined}
          isMuted={(recall) => recall.status === 'CLOSED'}
          empty={
            hasFilters ? (
              <EmptyState
                icon={SearchXIcon}
                title="Nenhum recall encontrado"
                description="Nenhum recall corresponde aos filtros aplicados."
                action={
                  <Button variant="outline" size="sm" onClick={list.clearFilters}>
                    Limpar filtros
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={SirenIcon}
                title="Nenhum recall registrado"
                description="Simule o impacto de um lote com problema para ver os lotes derivados e os clientes que o receberam."
                action={
                  <Button size="sm" asChild>
                    <Link to="/recall/novo">
                      <SirenIcon />
                      Simular um recall
                    </Link>
                  </Button>
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
