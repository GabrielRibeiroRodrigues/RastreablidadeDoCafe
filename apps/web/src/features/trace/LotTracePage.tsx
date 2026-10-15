import { EmptyState } from '@/components/EmptyState';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangleIcon,
  BoxesIcon,
  FactoryIcon,
  RefreshCwIcon,
  SproutIcon,
  TruckIcon,
  UsersIcon,
  type LucideIcon,
} from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { cn } from 'cn';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { inventoryApi } from '@/features/inventory/api';
import { LotStatusBadge } from '@/features/inventory/components';
import { ProductTypeBadge } from '@/features/production/components';
import { getErrorMessage } from '@/lib/api';
import { formatDateTime, formatQuantity } from '@/lib/quantity';
import { traceApi, type BackwardTrace, type ForwardTrace, type TraceDirection } from './api';
import { backwardModel, forwardModel } from './layout';
import { TraceTree } from './TraceTree';
import { DetailPageError } from '@/components/layout/DetailStates';
import { PageHeader, PageHeaderSkeleton } from '@/components/layout/PageHeader';

const TABS: Array<{ value: TraceDirection; param: string; label: string; hint: string }> = [
  {
    value: 'backward',
    param: 'origem',
    label: 'Para trás (origem)',
    hint: 'De onde veio este lote: insumos, ordens de produção e fazendas.',
  },
  {
    value: 'forward',
    param: 'destino',
    label: 'Para frente (destino)',
    hint: 'Para onde foi este lote: derivados e clientes que receberam produto dele.',
  },
];

function SummaryChip({
  icon: Icon,
  value,
  label,
  hint,
  tone = 'default',
}: {
  icon: LucideIcon;
  value: number;
  label: string;
  hint?: string;
  tone?: 'default' | 'farm' | 'customer';
}) {
  return (
    <div
      className={cn(
        'flex min-w-0 items-center gap-3 rounded-lg border bg-card px-3 py-2',
        tone === 'farm' && 'border-emerald-600/30',
        tone === 'customer' && 'border-sky-600/30',
      )}
    >
      <Icon
        aria-hidden
        className={cn(
          'size-5 shrink-0 text-muted-foreground',
          tone === 'farm' && 'text-emerald-700 dark:text-emerald-400',
          tone === 'customer' && 'text-sky-700 dark:text-sky-400',
        )}
      />
      <div className="min-w-0">
        <p className="text-sm">
          <span className="text-lg font-semibold tabular-nums">{value}</span> {label}
        </p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}

const distinctOrders = (trace: BackwardTrace | ForwardTrace) =>
  new Set(trace.edges.map((edge) => edge.productionOrder.id)).size;

function TruncatedBanner() {
  return (
    <Alert>
      <AlertTriangleIcon />
      <AlertTitle>Grafo truncado</AlertTitle>
      <AlertDescription>
        A cadeia passa do limite de profundidade (20 níveis). Abra um lote da última coluna para
        continuar a partir dele.
      </AlertDescription>
    </Alert>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function BackwardView({ trace }: { trace: BackwardTrace }) {
  const model = useMemo(() => backwardModel(trace), [trace]);
  const empty = trace.edges.length === 0 && trace.origins.length === 0;
  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-3">
        <SummaryChip
          icon={SproutIcon}
          tone="farm"
          value={trace.origins.length}
          label={trace.origins.length === 1 ? 'origem (fazenda)' : 'origens (fazendas)'}
          hint="Fornecedores de onde o café deste lote veio."
        />
        <SummaryChip
          icon={BoxesIcon}
          value={trace.nodes.length - 1}
          label={trace.nodes.length - 1 === 1 ? 'lote de origem' : 'lotes de origem'}
        />
        <SummaryChip
          icon={FactoryIcon}
          value={distinctOrders(trace)}
          label={distinctOrders(trace) === 1 ? 'ordem de produção' : 'ordens de produção'}
        />
      </div>
      {trace.truncated && <TruncatedBanner />}
      {empty ? (
        <EmptyState>Lote sem origem registrada (sem fornecedor nem insumos).</EmptyState>
      ) : (
        <TraceTree model={model} direction="backward" />
      )}
      {trace.origins.length > 0 && (
        <Section title="Fazendas de origem">
          <div className="overflow-hidden rounded-xl border bg-card">
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow className="hover:bg-transparent">
                  <TableHead>Fazenda</TableHead>
                  <TableHead>Produtor</TableHead>
                  <TableHead>Região</TableHead>
                  <TableHead>Cidade/UF</TableHead>
                  <TableHead className="text-right">Altitude</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trace.origins.map((origin) => (
                  <TableRow key={origin.id}>
                    <TableCell className="font-medium">{origin.farmName ?? '—'}</TableCell>
                    <TableCell>{origin.name}</TableCell>
                    <TableCell>{origin.region ?? '—'}</TableCell>
                    <TableCell>
                      {[origin.city, origin.state].filter(Boolean).join('/') || '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {origin.altitudeMeters === null
                        ? '—'
                        : `${origin.altitudeMeters.toLocaleString('pt-BR')} m`}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Section>
      )}
    </div>
  );
}

function ForwardView({ trace }: { trace: ForwardTrace }) {
  const model = useMemo(() => forwardModel(trace), [trace]);
  const shipments = new Set(trace.shipments.map((s) => s.shipmentId)).size;
  const empty = trace.edges.length === 0 && trace.shipments.length === 0;
  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-3">
        <SummaryChip
          icon={UsersIcon}
          tone="customer"
          value={trace.customers.length}
          label={trace.customers.length === 1 ? 'cliente afetado' : 'clientes afetados'}
          hint="Clientes que receberam produto derivado deste lote."
        />
        <SummaryChip
          icon={TruckIcon}
          value={shipments}
          label={shipments === 1 ? 'expedição' : 'expedições'}
        />
        <SummaryChip
          icon={BoxesIcon}
          value={trace.nodes.length - 1}
          label={trace.nodes.length - 1 === 1 ? 'lote derivado' : 'lotes derivados'}
        />
      </div>
      {trace.truncated && <TruncatedBanner />}
      {empty ? (
        <EmptyState>Nenhum derivado nem expedição deste lote ainda.</EmptyState>
      ) : (
        <TraceTree model={model} direction="forward" />
      )}
      {trace.shipments.length > 0 && (
        <Section title="Expedições do lote e dos derivados">
          <div className="overflow-hidden rounded-xl border bg-card">
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow className="hover:bg-transparent">
                  <TableHead>Expedição</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Lote</TableHead>
                  <TableHead className="text-right">Quantidade</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trace.shipments.map((s, index) => (
                  <TableRow key={`${s.shipmentId}:${s.lotId}:${index}`}>
                    <TableCell>
                      <Link
                        to={`/expedicao/${s.shipmentId}`}
                        className="font-mono text-xs font-medium text-primary underline-offset-4 hover:underline"
                      >
                        {s.number}
                      </Link>
                    </TableCell>
                    <TableCell className="tabular-nums">{formatDateTime(s.shippedAt)}</TableCell>
                    <TableCell className="font-medium">
                      {s.customer.name}
                      {s.customer.city && (
                        <span className="font-normal text-muted-foreground">
                          {' '}
                          · {s.customer.city}/{s.customer.state}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Link
                        to={`/lotes/${s.lotId}`}
                        className="font-mono text-xs text-primary underline-offset-4 hover:underline"
                      >
                        {s.lotCode}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatQuantity(s.quantity, s.unit)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Section>
      )}
    </div>
  );
}

function ErrorState({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <EmptyState>
      <p className="font-medium text-foreground">Não foi possível carregar a rastreabilidade</p>
      <p>{getErrorMessage(error)}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RefreshCwIcon />
        Tentar novamente
      </Button>
    </EmptyState>
  );
}

/** Rastreabilidade de um lote: árvore visual para trás (origem) e para frente (destino). */
export function LotTracePage() {
  const { id = '' } = useParams();
  const [search, setSearch] = useSearchParams();
  const direction: TraceDirection = search.get('aba') === 'destino' ? 'forward' : 'backward';

  const lot = useQuery({
    queryKey: ['lots', 'detail', id],
    queryFn: ({ signal }) => inventoryApi.getLot(id, signal),
  });
  const backward = useQuery({
    queryKey: ['trace', 'backward', id],
    queryFn: ({ signal }) => traceApi.backward(id, signal),
    enabled: direction === 'backward',
  });
  const forward = useQuery({
    queryKey: ['trace', 'forward', id],
    queryFn: ({ signal }) => traceApi.forward(id, signal),
    enabled: direction === 'forward',
  });
  const active = direction === 'backward' ? backward : forward;

  const crumbs = [
    { label: 'Rastreabilidade', to: '/rastreabilidade' },
    ...(lot.data ? [{ label: lot.data.code, to: `/lotes/${id}` }] : []),
    { label: 'Árvore' },
  ];

  if (lot.isError) {
    return (
      <DetailPageError
        breadcrumbs={crumbs}
        error={lot.error}
        onRetry={() => void lot.refetch()}
        entity="Lote"
        backTo="/rastreabilidade"
        backLabel="Buscar outro lote"
      />
    );
  }

  return (
    <div className="space-y-6">
      {lot.data ? (
        <PageHeader
          mono
          title={lot.data.code}
          documentTitle={`Rastreabilidade ${lot.data.code}`}
          breadcrumbs={crumbs}
          badges={
            <>
              <ProductTypeBadge type={lot.data.product.type} className="h-6 px-2.5 text-sm" />
              <LotStatusBadge status={lot.data.status} className="h-6 px-2.5 text-sm" />
            </>
          }
          description={
            <>
              <span className="font-medium text-foreground">{lot.data.product.name}</span>
              {lot.data.harvest && <> · Safra {lot.data.harvest}</>}
              {lot.data.variety && <> · {lot.data.variety}</>}
            </>
          }
        />
      ) : (
        <PageHeaderSkeleton breadcrumbs={crumbs} />
      )}

      <div className="space-y-2">
        <div
          role="tablist"
          aria-label="Sentido da rastreabilidade"
          className="inline-flex rounded-lg border bg-muted/40 p-1"
        >
          {TABS.map((tab) => {
            const selected = tab.value === direction;
            return (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() =>
                  setSearch(tab.value === 'backward' ? {} : { aba: tab.param }, { replace: true })
                }
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                  selected
                    ? 'bg-background text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
        <p className="text-sm text-muted-foreground">
          {TABS.find((tab) => tab.value === direction)?.hint}
        </p>
      </div>

      <div role="tabpanel">
        {active.isPending ? (
          <div className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-3">
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
            </div>
            <Skeleton className="h-80" />
          </div>
        ) : active.isError ? (
          <ErrorState error={active.error} onRetry={() => void active.refetch()} />
        ) : direction === 'backward' && backward.data ? (
          <BackwardView trace={backward.data} />
        ) : forward.data ? (
          <ForwardView trace={forward.data} />
        ) : null}
      </div>
    </div>
  );
}
