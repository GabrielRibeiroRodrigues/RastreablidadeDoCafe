import type { LotStatus, MovementType, SettableLotStatus } from './api';

export const LOT_STATUS_LABELS: Record<LotStatus, string> = {
  AVAILABLE: 'Disponível',
  QUARANTINE: 'Quarentena',
  BLOCKED: 'Bloqueado',
  CONSUMED: 'Consumido',
};

export const SETTABLE_STATUS_LABELS: Record<SettableLotStatus, string> = {
  AVAILABLE: 'Disponível',
  QUARANTINE: 'Quarentena',
  BLOCKED: 'Bloqueado',
};

export const MOVEMENT_TYPE_LABELS: Record<MovementType, string> = {
  RECEIPT: 'Entrada',
  ISSUE: 'Saída',
  TRANSFER: 'Transferência',
  ADJUSTMENT: 'Ajuste',
  CONSUMPTION: 'Consumo',
  PRODUCTION: 'Produção',
  REVERSAL: 'Estorno',
};

export const LOT_STATUSES = Object.keys(LOT_STATUS_LABELS) as LotStatus[];
export const MOVEMENT_TYPES = Object.keys(MOVEMENT_TYPE_LABELS) as MovementType[];

/** Filtro "vencendo em N dias" (inclui vencidos). */
export const EXPIRY_WINDOWS = ['7', '15', '30', '60', '90'] as const;

/** Lote vencendo é destacado a partir de 30 dias. */
export const EXPIRY_WARNING_DAYS = 30;
