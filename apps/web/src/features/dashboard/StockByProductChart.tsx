import { Link } from 'react-router';
import { PRODUCT_TYPE_LABELS } from '@/features/products/labels';
import { formatQuantity, toKgMilli } from '@/lib/quantity';
import type { DashboardStockByProduct } from './api';

const kgFormat = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

/**
 * Barras horizontais em CSS puro (sem biblioteca de gráficos). Uma série, um tom: a barra é
 * proporcional à massa em kg (sacas convertidas); itens contados em unidades vão numa lista à
 * parte, porque não dá para compará-los com massa.
 */
export function StockByProductChart({ rows }: { rows: DashboardStockByProduct[] }) {
  const mass = rows
    .map((row) => ({ row, kg: toKgMilli(row.quantity, row.unit) }))
    .filter((item): item is { row: DashboardStockByProduct; kg: bigint } => item.kg !== null)
    .filter((item) => item.kg > 0n)
    .sort((a, b) => (b.kg > a.kg ? 1 : b.kg < a.kg ? -1 : 0));
  const units = rows.filter((row) => row.unit === 'UNIT' && Number(row.quantity) > 0);
  const max = mass[0]?.kg ?? 1n;

  return (
    <div className="space-y-5">
      {mass.length > 0 && (
        <ul className="space-y-3" aria-label="Estoque em massa por produto">
          {mass.map(({ row, kg }) => {
            const percent = Math.max(Number((kg * 1000n) / max) / 10, 1.5);
            const kgText = `${kgFormat.format(Number(kg) / 1000)} kg`;
            const native = formatQuantity(row.quantity, row.unit);
            return (
              <li key={row.productId} className="group space-y-1.5">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <Link
                    to={`/estoque?productId=${row.productId}`}
                    className="min-w-0 truncate font-medium hover:underline"
                    title={`${row.name} (${row.sku}) · ${PRODUCT_TYPE_LABELS[row.type]}`}
                  >
                    {row.name}
                  </Link>
                  <span className="shrink-0 text-muted-foreground tabular-nums">
                    {row.unit === 'BAG_60KG' ? `${native} · ${kgText}` : kgText}
                  </span>
                </div>
                <div
                  className="h-2 w-full overflow-hidden rounded-full bg-muted"
                  title={`${row.name}: ${kgText}`}
                  aria-hidden
                >
                  <div
                    className="h-full rounded-full bg-chart-1 transition-[width] duration-500 group-hover:bg-primary"
                    style={{ width: `${percent}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {units.length > 0 && (
        <div className="space-y-2 border-t pt-4">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Em unidades
          </p>
          <ul className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
            {units.map((row) => (
              <li key={row.productId} className="flex justify-between gap-3">
                <span className="truncate">{row.name}</span>
                <span className="shrink-0 text-muted-foreground tabular-nums">
                  {formatQuantity(row.quantity, 'UNIT')}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
