import { cn } from 'cn';
import { Badge } from '@/components/ui/badge';
import type { NonConformityStatus, NonConformityType } from './api';
import { NC_STATUS_LABELS, NC_TYPE_LABELS } from './labels';

const STATUS_STYLES: Record<NonConformityStatus, string> = {
  OPEN: 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
  RELEASED: 'bg-emerald-600/10 text-emerald-700 dark:text-emerald-400',
  DISCARDED: 'bg-destructive/10 text-destructive',
};

export function NcStatusBadge({
  status,
  className,
}: {
  status: NonConformityStatus;
  className?: string;
}) {
  return (
    <Badge variant="secondary" className={cn(STATUS_STYLES[status], className)}>
      {NC_STATUS_LABELS[status]}
    </Badge>
  );
}

export function NcTypeBadge({ type, className }: { type: NonConformityType; className?: string }) {
  return (
    <Badge variant="outline" className={className}>
      {NC_TYPE_LABELS[type]}
    </Badge>
  );
}
