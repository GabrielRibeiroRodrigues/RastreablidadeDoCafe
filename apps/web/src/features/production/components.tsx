import { cn } from 'cn';
import { Badge } from '@/components/ui/badge';
import type { ProductType } from '@/features/products/api';
import { PRODUCT_TYPE_LABELS } from '@/features/products/labels';
import { formatQuantity } from '@/lib/quantity';
import type { ProductionStage } from './api';
import { STAGE_LABELS, stageStyle } from './labels';

export function StageBadge({ stage, className }: { stage: ProductionStage; className?: string }) {
  return (
    <Badge variant="secondary" className={cn(stageStyle(stage), className)}>
      {STAGE_LABELS[stage]}
    </Badge>
  );
}

const PRODUCT_TYPE_STYLES: Record<ProductType, string> = {
  GREEN: 'bg-emerald-600/10 text-emerald-700 dark:text-emerald-400',
  ROASTED: 'bg-orange-700/10 text-orange-800 dark:text-orange-300',
  BLEND: 'bg-violet-600/10 text-violet-700 dark:text-violet-300',
  PACKAGING: 'bg-sky-600/10 text-sky-700 dark:text-sky-400',
};

export function ProductTypeBadge({ type, className }: { type: ProductType; className?: string }) {
  return (
    <Badge variant="secondary" className={cn(PRODUCT_TYPE_STYLES[type], className)}>
      {PRODUCT_TYPE_LABELS[type]}
    </Badge>
  );
}

/** Rendimento com destaque quando a torra sai da faixa 75–90%. */
export function YieldText({ value, stage }: { value: number | null; stage: ProductionStage }) {
  if (value === null) return <span className="text-muted-foreground">—</span>;
  const outOfRange = stage === 'ROASTING' && (value < 75 || value > 90);
  return (
    <span
      className={cn('tabular-nums', outOfRange && 'font-medium text-amber-700 dark:text-amber-400')}
      title={outOfRange ? 'Fora da faixa típica da torra (75–90%)' : undefined}
    >
      {value.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%
    </span>
  );
}

/** `"108.000"` → `108 kg`; `null` → traço. */
export function KgText({ value }: { value: string | null }) {
  if (value === null) return <span className="text-muted-foreground">—</span>;
  return <span className="tabular-nums">{formatQuantity(value, 'KG')}</span>;
}
