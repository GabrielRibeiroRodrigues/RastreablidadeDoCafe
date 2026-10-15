import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { FactoryIcon, Loader2Icon } from 'lucide-react';
import { Link } from 'react-router';
import { useInventoryPermissions } from '@/auth/permissions';
import { DataTable, type Column } from '@/components/catalog/DataTable';
import { FilterSelect } from '@/components/catalog/FilterSelect';
import { PaginationBar } from '@/components/catalog/PaginationBar';
import { SearchInput } from '@/components/catalog/SearchInput';
import { useListParams, type ListParamsConfig } from '@/components/catalog/use-list-params';
import { Button } from '@/components/ui/button';
import { EmptyState, PageHeader } from '@/features/inventory/components';
import { isDateParam } from '@/features/inventory/url-filters';
import { toOptions } from '@/lib/options';
import { formatDateTime, startOfLocalDayIso } from '@/lib/quantity';
import { PeriodFilter } from '@/components/catalog/PeriodFilter';
import { productionApi, type ProductionOrder, type ProductionOrdersQuery } from './api';
import { KgText, StageBadge, YieldText } from './components';
import { STAGES, STAGE_LABELS } from './labels';

const LIST_CONFIG: ListParamsConfig = {
  sorts: [''],
  defaultSort: '',
  filters: { stage: STAGES, from: isDateParam, to: isDateParam },
};

const columns: Column<ProductionOrder>[] = [
  {
    id: 'number',
    header: 'Ordem',
    cell: (order) => (
      <Link
        to={`/producao/${order.id}`}
        className="font-mono text-xs font-medium text-primary underline-offset-4 hover:underline"
      >
        {order.number}
      </Link>
    ),
  },
  { id: 'stage', header: 'Etapa', cell: (order) => <StageBadge stage={order.stage} /> },
  {
    id: 'output',
    header: 'Lote gerado',
    className: 'whitespace-normal',
    cell: (order) => (
      <div className="min-w-40">
        <Link
          to={`/lotes/${order.output.id}`}
          className="font-mono text-xs font-medium text-primary underline-offset-4 hover:underline"
        >
          {order.output.code}
        </Link>
        <div className="text-xs text-muted-foreground">{order.output.product.name}</div>
      </div>
    ),
  },
  {
    id: 'inputs',
    header: 'Insumos',
    className: 'text-right',
    cell: (order) => <span className="tabular-nums">{order.inputs.length}</span>,
  },
  {
    id: 'yield',
    header: 'Rendimento',
    className: 'text-right',
    cell: (order) => <YieldText value={order.yieldPercent} stage={order.stage} />,
  },
  {
    id: 'loss',
    header: 'Perda',
    className: 'text-right',
    cell: (order) => <KgText value={order.lossKg} />,
  },
  {
    id: 'performedAt',
    header: 'Data',
    cell: (order) => <span className="tabular-nums">{formatDateTime(order.performedAt)}</span>,
  },
  { id: 'user', header: 'Usuário', cell: (order) => order.user.name },
];

/** Ordens de produção, mais recentes primeiro. */
export function ProductionOrdersPage() {
  const { canOperate } = useInventoryPermissions();
  const list = useListParams(LIST_CONFIG);
  const { params } = list;
  const { stage, from, to } = params.filters;

  const query = useQuery({
    queryKey: ['production-orders', 'list', params],
    queryFn: ({ signal }) => {
      const apiQuery: ProductionOrdersQuery = {
        page: params.page,
        pageSize: params.pageSize,
        ...(params.q ? { q: params.q } : {}),
        ...(stage ? { stage: stage as ProductionOrdersQuery['stage'] } : {}),
        ...(from ? { from: startOfLocalDayIso(from) } : {}),
        ...(to ? { to: startOfLocalDayIso(to, 1) } : {}),
      };
      return productionApi.list(apiQuery, signal);
    },
    placeholderData: keepPreviousData,
  });

  const hasFilters = params.q !== '' || Object.keys(params.filters).length > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Produção"
        description="Cada ordem consome lotes de insumo e gera um lote novo, ligado aos de origem — é isso que permite rastrear do café na xícara até a fazenda."
        actions={
          canOperate && (
            <Button asChild>
              <Link to="/producao/nova">
                <FactoryIcon />
                Nova ordem
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
            placeholder="Número da OP ou lote gerado"
          />
          <FilterSelect
            label="Etapa"
            allLabel="Todas as etapas"
            options={toOptions(STAGE_LABELS)}
            value={stage}
            onChange={(value) => list.setFilter('stage', value)}
          />
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
          caption="Ordens de produção"
          columns={columns}
          rows={query.data?.data}
          isLoading={query.isPending}
          error={query.isError ? query.error : null}
          onRetry={() => void query.refetch()}
          sort=""
          onSortChange={() => undefined}
          empty={
            <EmptyState>
              <p>
                {hasFilters
                  ? 'Nenhuma ordem para os filtros aplicados.'
                  : 'Nenhuma ordem de produção ainda.'}
              </p>
              {hasFilters ? (
                <Button variant="outline" size="sm" onClick={list.clearFilters}>
                  Limpar filtros
                </Button>
              ) : (
                canOperate && (
                  <Link
                    to="/producao/nova"
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    Registrar a primeira ordem
                  </Link>
                )
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
