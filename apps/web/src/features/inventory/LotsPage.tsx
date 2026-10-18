import { PageHeader } from '@/components/layout/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  BoxesIcon,
  CalendarClockIcon,
  Loader2Icon,
  PackagePlusIcon,
  SearchXIcon,
  TagIcon,
} from 'lucide-react';
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
import { ExpiryText, LotStatusBadge, Quantity } from './components';
import { ExportLotsButton, SavedViews } from './LotListTools';
import { useProducts } from './hooks';
import { EXPIRY_WINDOWS, LOT_STATUSES, LOT_STATUS_LABELS } from './labels';
import { isUuid } from './url-filters';
import { daysUntil, formatDateTime } from '@/lib/quantity';
import { ALERT_DAYS, useExpiringLots, type ExpiringLot } from '@/features/alerts/api';
import { countOf, plural } from '@/lib/plural';
import { getErrorMessage } from '@/lib/api';

const LIST_CONFIG: ListParamsConfig = {
  sorts: ['-receivedAt', 'receivedAt', 'code', '-code', 'expiresAt', '-expiresAt'],
  defaultSort: '-receivedAt',
  filters: {
    // `lotStatus` na URL: `status` já é usado pelo filtro Ativos/Inativos dos cadastros.
    lotStatus: LOT_STATUSES,
    productId: isUuid,
    expiresWithinDays: EXPIRY_WINDOWS,
    // Visão de alerta (`GET /v1/alerts/expiring`): só lotes com saldo, vencidos ou vencendo.
    vencendo: EXPIRY_WINDOWS,
  },
};

const expiringColumns: Column<ExpiringLot>[] = [
  {
    id: 'code',
    header: 'Código',
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
    id: 'balance',
    header: 'Saldo',
    className: 'text-right',
    cell: (lot) => <Quantity value={lot.balance} unit={lot.unit} />,
  },
  {
    id: 'expiresAt',
    header: 'Validade',
    cell: (lot) => <ExpiryText value={lot.expiresAt} />,
  },
  {
    id: 'days',
    header: 'Situação',
    cell: (lot) => {
      const days = lot.daysToExpiry ?? daysUntil(lot.expiresAt);
      return days < 0 ? (
        <span className="font-medium text-destructive">
          Vencido há {countOf(-days, 'dia', 'dias')}
        </span>
      ) : days === 0 ? (
        <span className="font-medium text-amber-700 dark:text-amber-400">Vence hoje</span>
      ) : (
        <span>Vence em {countOf(days, 'dia', 'dias')}</span>
      );
    },
  },
  {
    id: 'status',
    header: 'Status',
    cell: (lot) => (lot.status ? <LotStatusBadge status={lot.status} /> : null),
  },
];

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
    cell: (lot) => <span className="tabular-nums">{formatDateTime(lot.receivedAt)}</span>,
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
  const expiringWindow = params.filters.vencendo;
  const expiring = useExpiringLots(Number(expiringWindow ?? ALERT_DAYS), Boolean(expiringWindow));
  // Contagem do chip (mesma consulta do sino do cabeçalho, em cache).
  const expiringCount = useExpiringLots();

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
    enabled: !expiringWindow,
  });

  // Seleção para imprimir etiquetas em lote (persiste entre páginas e filtros).
  const [selected, setSelected] = useState<Map<string, string>>(() => new Map());
  const toggle = (lot: Lot, on: boolean) =>
    setSelected((current) => {
      const next = new Map(current);
      if (on) next.set(lot.id, lot.code);
      else next.delete(lot.id);
      return next;
    });
  const pageRows = query.data?.data ?? [];
  const selectPage = () =>
    setSelected((current) => {
      const next = new Map(current);
      for (const lot of pageRows) next.set(lot.id, lot.code);
      return next;
    });
  const printLabels = useMutation({
    mutationFn: (args: { ids: string[]; tab: Window | null }) =>
      inventoryApi.generateLabelsBatch(args.ids),
    onSuccess: (result, { tab }) => {
      if (tab) tab.location.href = result.url;
      else window.open(result.url, '_blank', 'noopener');
      toast.success(`${countOf(result.count, 'etiqueta gerada', 'etiquetas geradas')}`);
      setSelected(new Map());
    },
    onError: (error, { tab }) => {
      tab?.close();
      toast.error(getErrorMessage(error));
    },
  });
  const startPrint = () => {
    // A aba abre no clique (antes do await) para o navegador não bloquear o pop-up.
    const tab = window.open('', '_blank');
    if (tab) tab.opener = null;
    printLabels.mutate({ ids: [...selected.keys()], tab });
  };

  const tableColumns = useMemo<Column<Lot>[]>(
    () =>
      canOperate
        ? [
            {
              id: 'select',
              header: '',
              className: 'w-8',
              mobile: 'hidden',
              cell: (lot) => (
                <input
                  type="checkbox"
                  className="size-4 cursor-pointer accent-primary"
                  aria-label={`Selecionar ${lot.code}`}
                  checked={selected.has(lot.id)}
                  onChange={(event) => toggle(lot, event.target.checked)}
                />
              ),
            },
            ...columns,
          ]
        : columns,
    [canOperate, selected],
  );

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
    <EmptyState
      icon={SearchXIcon}
      title="Nenhum lote encontrado"
      description="Nenhum lote corresponde à busca e aos filtros aplicados."
      action={
        <Button variant="outline" size="sm" onClick={list.clearFilters}>
          Limpar filtros
        </Button>
      }
    />
  ) : (
    <EmptyState
      icon={BoxesIcon}
      title="Nenhum lote recebido"
      description="Os lotes nascem no recebimento de café dos fornecedores."
      action={newReceipt}
    />
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Lotes"
        breadcrumbs={[{ label: 'Estoque' }, { label: 'Lotes' }]}
        description="Cada recebimento gera um lote rastreável, com qualidade, validade e saldo por local."
        actions={newReceipt}
      />

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Visão">
        <Button
          size="sm"
          variant={expiringWindow ? 'outline' : 'secondary'}
          aria-pressed={!expiringWindow}
          className="rounded-full"
          onClick={() => list.setFilter('vencendo', null)}
        >
          Todos os lotes
        </Button>
        <Button
          size="sm"
          variant={expiringWindow ? 'secondary' : 'outline'}
          aria-pressed={Boolean(expiringWindow)}
          className="rounded-full"
          onClick={() => list.setFilter('vencendo', expiringWindow ? null : String(ALERT_DAYS))}
        >
          <CalendarClockIcon />
          Vencendo
          {(expiringCount.data?.data.length ?? 0) > 0 && (
            <span className="rounded-full bg-warning px-1.5 text-[0.7rem] leading-4 font-semibold text-black">
              {expiringCount.data?.data.length}
            </span>
          )}
        </Button>
        <SavedViews />
      </div>

      {expiringWindow ? (
        <div className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <FilterSelect
              label="Janela"
              allLabel={`Vencendo em ${ALERT_DAYS} dias`}
              options={EXPIRY_WINDOWS.filter((days) => days !== String(ALERT_DAYS)).map((days) => ({
                value: days,
                label: `Vencendo em ${days} dias`,
              }))}
              value={expiringWindow === String(ALERT_DAYS) ? undefined : expiringWindow}
              onChange={(value) => list.setFilter('vencendo', value ?? String(ALERT_DAYS))}
            />
            <p className="text-sm text-muted-foreground">
              Lotes com saldo vencidos ou que vencem na janela, os mais urgentes primeiro.
              {(expiring.data?.expiredCount ?? 0) > 0 && (
                <span className="font-medium text-destructive">
                  {' '}
                  {expiring.data?.expiredCount}{' '}
                  {plural(expiring.data?.expiredCount ?? 0, 'já vencido', 'já vencidos')}.
                </span>
              )}
            </p>
          </div>
          <DataTable
            caption="Lotes vencendo"
            columns={expiringColumns}
            rows={expiring.data?.data}
            isLoading={expiring.isPending}
            error={expiring.isError ? expiring.error : null}
            onRetry={() => void expiring.refetch()}
            sort=""
            onSortChange={() => undefined}
            empty={
              <EmptyState
                icon={CalendarClockIcon}
                title="Nada vencendo"
                description={`Nenhum lote com saldo vence nos próximos ${expiringWindow} dias.`}
              />
            }
          />
        </div>
      ) : (
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
                className="size-4 animate-spin text-muted-foreground"
                aria-label="Atualizando"
              />
            )}
            <div className="sm:ml-auto">
              <ExportLotsButton
                query={{
                  sort: params.sort,
                  q: params.q || undefined,
                  status: params.filters.lotStatus,
                  productId: params.filters.productId,
                  expiresWithinDays: params.filters.expiresWithinDays,
                }}
              />
            </div>
          </div>

          {canOperate && selected.size > 0 && (
            <div
              role="region"
              aria-label="Lotes selecionados"
              className="flex flex-wrap items-center gap-2 rounded-lg border bg-accent/50 px-3 py-2 text-sm"
            >
              <span className="font-medium">
                {countOf(selected.size, 'lote selecionado', 'lotes selecionados')}
              </span>
              <Button variant="ghost" size="sm" onClick={selectPage}>
                Selecionar a página
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setSelected(new Map())}>
                Limpar
              </Button>
              <Button
                size="sm"
                className="ml-auto"
                onClick={startPrint}
                disabled={printLabels.isPending || selected.size > 50}
                title={selected.size > 50 ? 'No máximo 50 etiquetas por vez' : undefined}
              >
                {printLabels.isPending ? <Loader2Icon className="animate-spin" /> : <TagIcon />}
                Imprimir etiquetas
              </Button>
            </div>
          )}

          <DataTable
            caption="Lista de lotes"
            columns={tableColumns}
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
      )}
    </div>
  );
}
