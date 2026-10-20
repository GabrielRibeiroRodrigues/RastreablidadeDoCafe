import { useState } from 'react';
import { cn } from 'cn';
import { formatQuantity } from '@/lib/quantity';
import { countOf } from '@/lib/plural';
import { bucketLabel, bucketTick, xLabelIndexes, type YieldBucket } from './performance';

const percent = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

const HEIGHT = 160;
const TICKS = [0, 25, 50, 75, 100];
/**
 * Rendimento da produção por semana ou mês: uma série, barras finas a partir do zero (escala
 * honesta de 0 a 100%), rótulo só na última barra, eixo X com a semana/mês e tooltip em cada barra
 * (mouse e teclado).
 * A massa produzida fica no tooltip, nunca num segundo eixo. Tabela equivalente para leitores
 * de tela.
 */
export function YieldChart({
  series,
  bucket,
}: {
  series: YieldBucket[];
  bucket: 'week' | 'month';
}) {
  const [active, setActive] = useState<number | null>(null);
  const bars = series.filter((item) => item.yieldPercent !== null);
  const last = bars.length - 1;
  const current = active !== null ? bars[active] : undefined;
  const xLabels = xLabelIndexes(bars.length);

  return (
    <figure className="space-y-2">
      {/* pt-2: espaço para o rótulo "100%", centralizado na linha do topo. */}
      <div className="relative pt-2">
        {/* Grade e eixo Y: recessivos, só na altura das barras (o eixo X fica abaixo). Cada linha
            fica exatamente na sua porcentagem (mesma escala das barras); o texto centraliza nela. */}
        <div className="absolute inset-x-0 top-2" style={{ height: HEIGHT }} aria-hidden>
          {TICKS.map((tick) => (
            <div
              key={tick}
              className="absolute inset-x-0 flex translate-y-1/2 items-center gap-2"
              style={{ bottom: `${tick}%` }}
            >
              <span className="w-8 text-right text-[0.6875rem] leading-none text-muted-foreground tabular-nums">
                {tick}%
              </span>
              <span className={cn('h-px flex-1', tick === 0 ? 'bg-border' : 'bg-border/50')} />
            </div>
          ))}
        </div>
        <div
          className="relative ml-10 flex items-end gap-0.5"
          style={{ height: HEIGHT }}
          onMouseLeave={() => setActive(null)}
        >
          {bars.map((item, index) => {
            const value = item.yieldPercent ?? 0;
            const label = `${bucketLabel(item.start, bucket)}: rendimento ${percent.format(value)}%, ${countOf(item.orders, 'ordem', 'ordens')}, ${formatQuantity(item.outputKg)} kg produzidos`;
            return (
              <button
                key={item.start}
                type="button"
                aria-label={label}
                onMouseEnter={() => setActive(index)}
                onFocus={() => setActive(index)}
                onBlur={() => setActive(null)}
                // Alvo maior que a marca: a coluna inteira responde ao hover.
                className="group relative flex h-full max-w-12 min-w-2 flex-1 items-end justify-center rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                {index === last && (
                  <span
                    className="absolute text-[0.6875rem] font-medium text-foreground tabular-nums"
                    style={{ bottom: `calc(${value}% + 4px)` }}
                  >
                    {percent.format(value)}%
                  </span>
                )}
                <span
                  className={cn(
                    'w-full max-w-6 rounded-t-[4px] transition-colors',
                    active === index ? 'bg-primary' : 'bg-chart-1',
                  )}
                  style={{ height: `${Math.max(value, 1)}%` }}
                />
              </button>
            );
          })}
        </div>
        {/* Eixo X: mesma grade de colunas das barras, texto recessivo. */}
        <div className="ml-10 flex gap-0.5 pt-1.5" aria-hidden>
          {bars.map((item, index) => (
            <span
              key={item.start}
              className="max-w-12 min-w-2 flex-1 text-center text-[0.6875rem] whitespace-nowrap text-muted-foreground tabular-nums"
            >
              {xLabels.has(index) ? bucketTick(item.start, bucket) : ''}
            </span>
          ))}
        </div>
        {current && (
          <div
            role="status"
            className="pointer-events-none absolute top-0 right-0 rounded-md border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md"
          >
            <p className="font-medium">{bucketLabel(current.start, bucket)}</p>
            <p className="text-muted-foreground tabular-nums">
              Rendimento {percent.format(current.yieldPercent ?? 0)}% ·{' '}
              {countOf(current.orders, 'ordem', 'ordens')} · {formatQuantity(current.outputKg)} kg
            </p>
          </div>
        )}
      </div>
      <figcaption className="sr-only">
        <table>
          <caption>Rendimento da produção por {bucket === 'week' ? 'semana' : 'mês'}</caption>
          <thead>
            <tr>
              <th>Período</th>
              <th>Rendimento</th>
              <th>Ordens</th>
              <th>Produzido (kg)</th>
            </tr>
          </thead>
          <tbody>
            {bars.map((item) => (
              <tr key={item.start}>
                <td>{bucketLabel(item.start, bucket)}</td>
                <td>{percent.format(item.yieldPercent ?? 0)}%</td>
                <td>{item.orders}</td>
                <td>{formatQuantity(item.outputKg)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </figcaption>
    </figure>
  );
}
