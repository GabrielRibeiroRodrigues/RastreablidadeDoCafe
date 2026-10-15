import { AlertTriangleIcon, Undo2Icon } from 'lucide-react';
import { cn } from 'cn';
import { Badge } from '@/components/ui/badge';
import { LOCATION_TYPE_LABELS } from '@/features/locations/api';
import { daysUntil, formatDate, formatQuantity, type UnitCode } from '@/lib/quantity';
import type { LotStatus, Movement, MovementType } from './api';
import { EXPIRY_WARNING_DAYS, LOT_STATUS_LABELS, MOVEMENT_TYPE_LABELS } from './labels';

const STATUS_STYLES: Record<LotStatus, string> = {
  AVAILABLE: 'bg-emerald-600/10 text-emerald-700 dark:text-emerald-400',
  QUARANTINE: 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
  BLOCKED: 'bg-destructive/10 text-destructive',
  CONSUMED: 'bg-muted text-muted-foreground',
};

export function LotStatusBadge({ status, className }: { status: LotStatus; className?: string }) {
  return (
    <Badge variant="secondary" className={cn(STATUS_STYLES[status], className)}>
      {LOT_STATUS_LABELS[status]}
    </Badge>
  );
}

/** Validade com destaque: vencida (vermelho) ou vencendo em até 30 dias (âmbar). */
export function ExpiryText({ value }: { value: string | null }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  const days = daysUntil(value);
  const expired = days < 0;
  const warning = !expired && days <= EXPIRY_WARNING_DAYS;
  const hint = expired
    ? `Vencido há ${-days} dia${days === -1 ? '' : 's'}`
    : days === 0
      ? 'Vence hoje'
      : `Vence em ${days} dia${days === 1 ? '' : 's'}`;
  return (
    <span
      title={hint}
      className={cn(
        'inline-flex items-center gap-1 tabular-nums',
        expired && 'font-medium text-destructive',
        warning && 'font-medium text-amber-700 dark:text-amber-400',
      )}
    >
      {(expired || warning) && <AlertTriangleIcon className="size-3.5" aria-hidden />}
      {formatDate(value)}
      {(expired || warning) && <span className="sr-only"> ({hint})</span>}
    </span>
  );
}

export function Quantity({ value, unit }: { value: string; unit: UnitCode }) {
  return <span className="tabular-nums">{formatQuantity(value, unit)}</span>;
}

const TYPE_STYLES: Partial<Record<MovementType, string>> = {
  RECEIPT: 'bg-emerald-600/10 text-emerald-700 dark:text-emerald-400',
  PRODUCTION: 'bg-emerald-600/10 text-emerald-700 dark:text-emerald-400',
  ISSUE: 'bg-sky-600/10 text-sky-700 dark:text-sky-400',
  CONSUMPTION: 'bg-sky-600/10 text-sky-700 dark:text-sky-400',
  ADJUSTMENT: 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
  REVERSAL: 'bg-destructive/10 text-destructive',
};

export function MovementTypeBadge({ movement }: { movement: Movement }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Badge variant="secondary" className={TYPE_STYLES[movement.type]}>
        {MOVEMENT_TYPE_LABELS[movement.type]}
      </Badge>
      {movement.reversedById && (
        <Badge variant="outline" className="text-muted-foreground">
          <Undo2Icon aria-hidden />
          Estornada
        </Badge>
      )}
    </span>
  );
}

type LocationRef = Movement['fromLocation'];

function LocationCode({ location }: { location: LocationRef }) {
  if (!location) return <span className="text-muted-foreground">—</span>;
  return (
    <span title={`${location.name} (${LOCATION_TYPE_LABELS[location.type]})`}>
      <span className="font-mono text-xs">{location.code}</span>
    </span>
  );
}

/** "ARM-01 → SILO-02" (origem → destino). */
export function MovementRoute({ movement }: { movement: Movement }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <LocationCode location={movement.fromLocation} />
      <span className="text-muted-foreground" aria-label="para">
        →
      </span>
      <LocationCode location={movement.toLocation} />
    </span>
  );
}
