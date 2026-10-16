import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeftRightIcon,
  ArrowRightIcon,
  BoxesIcon,
  CalendarClockIcon,
  FactoryIcon,
  GitForkIcon,
  LayersIcon,
  PackagePlusIcon,
  TruckIcon,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { cn } from 'cn';
import { useAuth } from '@/auth/auth-context';
import { useInventoryPermissions } from '@/auth/permissions';
import { useMe } from '@/auth/use-me';
import { EmptyState, ErrorState } from '@/components/EmptyState';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ExpiryText, MovementRoute, MovementTypeBadge } from '@/features/inventory/components';
import { formatDateTime, formatQuantity } from '@/lib/quantity';
import { EXPIRING_DAYS, fetchDashboard, type DashboardData } from './api';
import { StockByProductChart } from './StockByProductChart';
import { countOf } from '@/lib/plural';

const integer = new Intl.NumberFormat('pt-BR');
const percent = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

function greeting(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

function KpiCard({
  icon: Icon,
  label,
  value,
  to,
  children,
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  to: string;
  children?: ReactNode;
}) {
  return (
    <Card className="relative gap-3 transition-shadow hover:shadow-md hover:ring-foreground/15">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <p className="text-sm font-medium text-muted-foreground">
          {/* Link cobre o card inteiro (alvo grande, um único tab stop). */}
          <Link
            to={to}
            className="after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"
          >
            {label}
          </Link>
        </p>
        <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <Icon className="size-4" aria-hidden />
        </span>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-3xl font-semibold tracking-tight tabular-nums">{value}</p>
        {children && <div className="text-xs text-muted-foreground">{children}</div>}
      </CardContent>
    </Card>
  );
}

function StatusDot({ className }: { className: string }) {
  return <span aria-hidden className={cn('inline-block size-2 rounded-full', className)} />;
}

function Kpis({ data }: { data: DashboardData }) {
  const { lots, production30d: production, shipments30d: shipments } = data;
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        icon={BoxesIcon}
        label="Lotes disponíveis"
        value={integer.format(lots.available)}
        to="/lotes?lotStatus=AVAILABLE"
      >
        <span className="flex flex-wrap gap-x-3 gap-y-1">
          <span className="inline-flex items-center gap-1.5">
            <StatusDot className="bg-warning" />
            {integer.format(lots.quarantine)} em quarentena
          </span>
          <span className="inline-flex items-center gap-1.5">
            <StatusDot className="bg-destructive" />
            {integer.format(lots.blocked)} bloqueado{lots.blocked === 1 ? '' : 's'}
          </span>
        </span>
      </KpiCard>
      <KpiCard
        icon={ArrowLeftRightIcon}
        label="Movimentações hoje"
        value={integer.format(data.movementsToday)}
        to="/movimentacoes"
      >
        Entradas, saídas, transferências e ajustes do dia.
      </KpiCard>
      <KpiCard
        icon={FactoryIcon}
        label="Produção · 30 dias"
        value={integer.format(production.orders)}
        to="/producao"
      >
        {production.orders === 0 ? (
          'Nenhuma ordem no período.'
        ) : (
          <>
            Rendimento médio{' '}
            <span className="font-medium text-foreground">
              {production.avgYieldPercent === null
                ? '—'
                : `${percent.format(production.avgYieldPercent)}%`}
            </span>{' '}
            · perda{' '}
            <span className="font-medium text-foreground">
              {formatQuantity(production.lossKg, 'KG')}
            </span>
          </>
        )}
      </KpiCard>
      <KpiCard
        icon={TruckIcon}
        label="Expedições · 30 dias"
        value={integer.format(shipments.count)}
        to="/expedicao"
      >
        <span className="font-medium text-foreground">{integer.format(shipments.customers)}</span>{' '}
        cliente{shipments.customers === 1 ? '' : 's'} atendido{shipments.customers === 1 ? '' : 's'}
      </KpiCard>
    </div>
  );
}

function SectionCard({
  title,
  action,
  children,
  className,
}: {
  title: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">{title}</CardTitle>
        {action}
      </CardHeader>
      <CardContent className="flex-1">{children}</CardContent>
    </Card>
  );
}

function SeeAll({ to, label = 'Ver todos' }: { to: string; label?: string }) {
  return (
    <Button variant="ghost" size="sm" asChild className="-mr-2 text-muted-foreground">
      <Link to={to}>
        {label}
        <ArrowRightIcon />
      </Link>
    </Button>
  );
}

function ExpiringList({ data }: { data: DashboardData }) {
  const { items, count } = data.expiringSoon;
  if (items.length === 0) {
    return (
      <EmptyState
        icon={CalendarClockIcon}
        title="Nada vencendo"
        description={`Nenhum lote com saldo vence nos próximos ${EXPIRING_DAYS} dias.`}
        className="py-6"
      />
    );
  }
  return (
    <div className="space-y-3">
      <ul className="divide-y">
        {items.map((lot) => (
          <li key={lot.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0">
            <div className="min-w-0">
              <Link
                to={`/lotes/${lot.id}`}
                className="font-mono text-xs font-medium text-primary hover:underline"
              >
                {lot.code}
              </Link>
              <p className="truncate text-sm">{lot.product.name}</p>
            </div>
            <div className="shrink-0 text-right text-sm">
              <ExpiryText value={lot.expiresAt} />
              <p className="text-xs text-muted-foreground tabular-nums">
                {formatQuantity(lot.balance, lot.unit)}
              </p>
            </div>
          </li>
        ))}
      </ul>
      {count > items.length && (
        <p className="text-xs text-muted-foreground">
          E mais {countOf(count - items.length, 'lote', 'lotes')}.
        </p>
      )}
    </div>
  );
}

function RecentMovements({ data }: { data: DashboardData }) {
  if (data.recentMovements.length === 0) {
    return (
      <EmptyState
        icon={ArrowLeftRightIcon}
        title="Nenhuma movimentação ainda"
        description="Recebimentos, produções e expedições aparecem aqui assim que forem registrados."
        className="py-6"
      />
    );
  }
  return (
    <ul className="divide-y">
      {data.recentMovements.map((movement) => (
        <li
          key={movement.id}
          className={cn(
            'grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 py-2.5 first:pt-0 sm:grid-cols-[9rem_8rem_1fr_auto]',
            movement.reversedById && 'opacity-60',
          )}
        >
          <span className="text-xs text-muted-foreground tabular-nums sm:text-sm">
            {formatDateTime(movement.occurredAt)}
          </span>
          <span className="justify-self-end sm:justify-self-start">
            <MovementTypeBadge movement={movement} />
          </span>
          <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <Link
              to={`/lotes/${movement.lot.id}`}
              className="font-mono text-xs font-medium text-primary hover:underline"
            >
              {movement.lot.code}
            </Link>
            <span className="text-muted-foreground">
              <MovementRoute movement={movement} />
            </span>
          </span>
          <span className="justify-self-end text-sm font-medium tabular-nums">
            {formatQuantity(movement.quantity, movement.unit)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-hidden>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((key) => (
          <Skeleton key={key} className="h-36 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-5">
        <Skeleton className="h-72 rounded-xl lg:col-span-3" />
        <Skeleton className="h-72 rounded-xl lg:col-span-2" />
      </div>
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}

function QuickActions() {
  const { canOperate } = useInventoryPermissions();
  if (!canOperate) {
    return (
      <>
        <Button variant="outline" asChild>
          <Link to="/estoque">
            <LayersIcon />
            Ver estoque
          </Link>
        </Button>
        <Button asChild>
          <Link to="/rastreabilidade">
            <GitForkIcon />
            Rastrear lote
          </Link>
        </Button>
      </>
    );
  }
  return (
    <>
      <Button variant="outline" asChild>
        <Link to="/expedicao/nova">
          <TruckIcon />
          Nova expedição
        </Link>
      </Button>
      <Button variant="outline" asChild>
        <Link to="/producao/nova">
          <FactoryIcon />
          Nova ordem
        </Link>
      </Button>
      <Button asChild>
        <Link to="/recebimento">
          <PackagePlusIcon />
          Novo recebimento
        </Link>
      </Button>
    </>
  );
}

/** Página inicial: indicadores do estoque, da produção e das expedições. */
export function DashboardPage() {
  const { user } = useAuth();
  const me = useMe();
  const query = useQuery({
    queryKey: ['dashboard'],
    queryFn: ({ signal }) => fetchDashboard(signal),
    staleTime: 15_000,
    refetchOnMount: 'always',
  });

  const firstName = user?.name.split(' ')[0];
  const company = me.data?.company.name ?? user?.companyName;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Painel"
        description={
          <>
            {greeting()}
            {firstName ? `, ${firstName}` : ''}. Resumo da operação
            {company ? ` — ${company}` : ''}.
          </>
        }
        actions={<QuickActions />}
      />

      {query.isPending ? (
        <DashboardSkeleton />
      ) : query.isError ? (
        <ErrorState
          error={query.error}
          title="Não foi possível carregar o painel"
          onRetry={() => void query.refetch()}
        />
      ) : (
        <>
          <Kpis data={query.data} />

          <div className="grid gap-4 lg:grid-cols-5">
            <SectionCard
              title="Estoque por produto"
              action={<SeeAll to="/estoque" label="Ver estoque" />}
              className="lg:col-span-3"
            >
              {query.data.stockByProduct.length === 0 ? (
                <EmptyState
                  icon={LayersIcon}
                  title="Estoque vazio"
                  description="O saldo aparece aqui depois do primeiro recebimento."
                  className="py-6"
                />
              ) : (
                <StockByProductChart rows={query.data.stockByProduct} />
              )}
            </SectionCard>
            <SectionCard
              title={
                <span className="flex items-center gap-2">
                  Vencendo em {EXPIRING_DAYS} dias
                  {query.data.expiringSoon.count > 0 && (
                    <span className="rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning-foreground tabular-nums">
                      {integer.format(query.data.expiringSoon.count)}
                    </span>
                  )}
                </span>
              }
              action={<SeeAll to={`/lotes?vencendo=${EXPIRING_DAYS}`} />}
              className="lg:col-span-2"
            >
              <ExpiringList data={query.data} />
            </SectionCard>
          </div>

          <SectionCard
            title="Movimentações recentes"
            action={<SeeAll to="/movimentacoes" label="Ver razão" />}
          >
            <RecentMovements data={query.data} />
          </SectionCard>
        </>
      )}
    </div>
  );
}
