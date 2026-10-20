import { ArrowDownRightIcon, ArrowUpRightIcon, MinusIcon, TrendingUpIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { cn } from 'cn';
import { EmptyState } from '@/components/EmptyState';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatQuantity } from '@/lib/quantity';
import {
  delta,
  isPeriod,
  PERIODS,
  usePerformance,
  type Performance,
  type PerformanceDays,
} from './performance';
import { YieldChart } from './YieldChart';

const integer = new Intl.NumberFormat('pt-BR');
const oneDecimal = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const signed = new Intl.NumberFormat('pt-BR', {
  maximumFractionDigits: 1,
  signDisplay: 'exceptZero',
});

/**
 * Variação contra o período anterior. Seta e sinal carregam a direção (nunca só a cor); o texto
 * fica na tinta secundária — melhor ou pior depende do indicador, então não pintamos de verde/vermelho.
 */
function Delta({
  value,
  unit,
  previousLabel,
}: {
  value: number | null;
  unit: string;
  previousLabel: string;
}) {
  if (value === null) {
    return <span className="text-muted-foreground">sem base no período anterior</span>;
  }
  const Icon = value > 0 ? ArrowUpRightIcon : value < 0 ? ArrowDownRightIcon : MinusIcon;
  return (
    <span className="inline-flex items-center gap-1 text-muted-foreground">
      <Icon className="size-3.5" aria-hidden />
      <span className="tabular-nums">
        {value === 0 ? 'igual' : `${signed.format(value)}${unit}`}
      </span>
      <span>vs. {previousLabel}</span>
    </span>
  );
}

function Tile({
  label,
  value,
  children,
}: {
  label: string;
  value: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1 rounded-lg border bg-card p-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
      <p className="text-xs">{children}</p>
    </div>
  );
}

function Tiles({ data }: { data: Performance }) {
  const { current, previous } = data;
  const prev = 'anterior';
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Tile label="Ordens de produção" value={integer.format(current.production.orders)}>
        <Delta
          value={delta(current.production.orders, previous.production.orders)}
          unit=""
          previousLabel={prev}
        />
      </Tile>
      <Tile
        label="Rendimento médio"
        value={
          current.production.yieldPercent === null
            ? '—'
            : `${oneDecimal.format(current.production.yieldPercent)}%`
        }
      >
        <Delta
          value={delta(current.production.yieldPercent, previous.production.yieldPercent)}
          unit=" p.p."
          previousLabel={prev}
        />
      </Tile>
      <Tile label="Perda na produção" value={`${formatQuantity(current.production.lossKg)} kg`}>
        <Delta
          value={delta(Number(current.production.lossKg), Number(previous.production.lossKg))}
          unit=" kg"
          previousLabel={prev}
        />
      </Tile>
      <Tile label="Expedições" value={integer.format(current.shipments.count)}>
        <Delta
          value={delta(current.shipments.count, previous.shipments.count)}
          unit=""
          previousLabel={prev}
        />
      </Tile>
    </div>
  );
}

function Turnover({ data }: { data: Performance }) {
  if (data.turnover.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Nenhuma saída de estoque no período.
      </p>
    );
  }
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b text-left text-xs text-muted-foreground">
          <th className="pb-2 font-medium">Produto</th>
          <th className="pb-2 pl-3 text-right font-medium">Saída</th>
          <th className="hidden pb-2 pl-3 text-right font-medium sm:table-cell">Saldo</th>
          <th
            className="pb-2 pl-3 text-right font-medium"
            title="Saldo ÷ saída diária média do período"
          >
            Cobertura
          </th>
        </tr>
      </thead>
      <tbody>
        {data.turnover.map((row) => (
          <tr key={row.productId} className="border-b last:border-0">
            <td className="py-2 pr-3">
              <Link
                to={`/estoque?productId=${row.productId}`}
                className="line-clamp-2 font-medium hover:underline"
                title={`${row.name} (${row.sku})`}
              >
                {row.name}
              </Link>
            </td>
            <td className="py-2 pl-3 text-right whitespace-nowrap tabular-nums">
              {formatQuantity(row.outflow, row.unit)}
            </td>
            <td className="hidden py-2 pl-3 text-right whitespace-nowrap text-muted-foreground tabular-nums sm:table-cell">
              {formatQuantity(row.balance, row.unit)}
            </td>
            <td className="py-2 pl-3 text-right whitespace-nowrap tabular-nums">
              {row.coverageDays === null
                ? '—'
                : `${integer.format(row.coverageDays)} ${row.coverageDays === 1 ? 'dia' : 'dias'}`}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PeriodPicker({
  value,
  onChange,
}: {
  value: PerformanceDays;
  onChange: (days: PerformanceDays) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Período"
      className="inline-flex rounded-lg border bg-muted/40 p-0.5"
    >
      {PERIODS.map((period) => (
        <button
          key={period.days}
          type="button"
          role="radio"
          aria-checked={value === period.days}
          onClick={() => onChange(period.days)}
          className={cn(
            'h-7 rounded-md px-2.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
            value === period.days
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {period.label}
        </button>
      ))}
    </div>
  );
}

/** Desempenho por período no painel: indicadores com comparação, rendimento e giro de estoque. */
export function PerformanceSection() {
  const [params, setParams] = useSearchParams();
  const requested = Number(params.get('periodo'));
  const days: PerformanceDays = isPeriod(requested) ? requested : 30;
  const query = usePerformance(days);

  const setDays = (next: PerformanceDays) =>
    setParams(
      (current) => {
        if (next === 30) current.delete('periodo');
        else current.set('periodo', String(next));
        return current;
      },
      { replace: true },
    );

  return (
    <section aria-labelledby="desempenho" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="desempenho" className="text-lg font-semibold tracking-tight">
            Desempenho
          </h2>
          <p className="text-sm text-muted-foreground">
            Comparado com o período anterior de mesmo tamanho.
          </p>
        </div>
        <PeriodPicker value={days} onChange={setDays} />
      </div>

      {query.isPending ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : query.isError ? (
        <p className="text-sm text-destructive">Não foi possível carregar o desempenho.</p>
      ) : (
        <div className={cn('space-y-4 transition-opacity', query.isFetching && 'opacity-70')}>
          <Tiles data={query.data} />
          <div className="grid gap-4 lg:grid-cols-5">
            <Card className="lg:col-span-3">
              <CardHeader>
                <CardTitle className="text-base">
                  Rendimento da produção por {query.data.bucket === 'week' ? 'semana' : 'mês'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {query.data.yieldSeries.some((item) => item.yieldPercent !== null) ? (
                  <YieldChart series={query.data.yieldSeries} bucket={query.data.bucket} />
                ) : (
                  <EmptyState
                    icon={TrendingUpIcon}
                    title="Sem produção no período"
                    description="O rendimento aparece aqui depois da primeira ordem de produção."
                    className="py-6"
                  />
                )}
              </CardContent>
            </Card>
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Giro de estoque</CardTitle>
              </CardHeader>
              <CardContent>
                <Turnover data={query.data} />
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </section>
  );
}
