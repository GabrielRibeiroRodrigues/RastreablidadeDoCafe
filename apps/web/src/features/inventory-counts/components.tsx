import { cn } from 'cn';
import { Badge } from '@/components/ui/badge';
import { formatQuantity, toMilli, type UnitCode } from '@/lib/quantity';
import type { InventoryCountStatus } from './api';
import { COUNT_STATUS_LABELS } from './labels';

const STATUS_STYLES: Record<InventoryCountStatus, string> = {
  OPEN: 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
  APPLIED: 'bg-emerald-600/10 text-emerald-700 dark:text-emerald-400',
  CANCELLED: 'bg-muted text-muted-foreground',
};

export function CountStatusBadge({
  status,
  className,
}: {
  status: InventoryCountStatus;
  className?: string;
}) {
  return (
    <Badge variant="secondary" className={cn(STATUS_STYLES[status], className)}>
      {COUNT_STATUS_LABELS[status]}
    </Badge>
  );
}

/** Diferença com sinal: sobra (+) em verde, falta (−) em vermelho, zero neutro. */
export function Difference({ value, unit }: { value: string | null; unit: UnitCode }) {
  if (value === null) return <span className="text-muted-foreground">—</span>;
  const milli = toMilli(value);
  if (milli === 0n) return <span className="text-muted-foreground tabular-nums">0</span>;
  const positive = milli > 0n;
  return (
    <span
      className={cn(
        'font-medium tabular-nums',
        positive ? 'text-emerald-700 dark:text-emerald-400' : 'text-destructive',
      )}
    >
      {positive ? '+' : '−'}
      {formatQuantity(value.replace('-', ''), unit)}
    </span>
  );
}
