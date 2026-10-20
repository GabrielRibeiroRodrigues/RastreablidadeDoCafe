import type { InventoryCountStatus } from './api';

export const COUNT_STATUS_LABELS: Record<InventoryCountStatus, string> = {
  OPEN: 'Em contagem',
  APPLIED: 'Aplicada',
  CANCELLED: 'Cancelada',
};

export const COUNT_STATUSES = Object.keys(COUNT_STATUS_LABELS) as InventoryCountStatus[];
