import type { Prisma } from '../../generated/prisma/client.js';
import type { LotResponse, MovementResponse } from './inventory.dto.js';
import { formatQuantity, ZERO, type Quantity } from './quantity.js';

/** `include` padrão para montar um `LotResponse`. */
export const LOT_INCLUDE = {
  product: { select: { id: true, sku: true, name: true, type: true } },
  supplier: { select: { id: true, name: true, farmName: true } },
} as const satisfies Prisma.LotInclude;

export type LotWithRelations = Prisma.LotGetPayload<{ include: typeof LOT_INCLUDE }>;

const LOCATION_SELECT = { select: { id: true, code: true, name: true, type: true } } as const;

/** `include` padrão para montar um `MovementResponse`. */
export const MOVEMENT_INCLUDE = {
  lot: { select: { id: true, code: true, status: true } },
  fromLocation: LOCATION_SELECT,
  toLocation: LOCATION_SELECT,
  user: { select: { id: true, name: true } },
  reversedBy: { select: { id: true } },
} as const satisfies Prisma.StockMovementInclude;

export type MovementWithRelations = Prisma.StockMovementGetPayload<{
  include: typeof MOVEMENT_INCLUDE;
}>;

/** Coluna `date` do Postgres → "YYYY-MM-DD" (sem fuso). */
export const toDateOnly = (value: Date | null): string | null =>
  value ? value.toISOString().slice(0, 10) : null;

/** "YYYY-MM-DD" → Date em UTC, como o Prisma grava em colunas `date`. */
export const fromDateOnly = (value: string): Date => new Date(`${value}T00:00:00.000Z`);

const toNumber = (value: Prisma.Decimal | null): number | null =>
  value === null ? null : value.toNumber();

export function toLotResponse(lot: LotWithRelations, balance: Quantity = ZERO): LotResponse {
  return {
    id: lot.id,
    code: lot.code,
    status: lot.status,
    product: lot.product,
    supplier: lot.supplier,
    unit: lot.unit,
    initialQuantity: formatQuantity(lot.initialQuantity),
    balance: formatQuantity(balance),
    expiresAt: toDateOnly(lot.expiresAt),
    receivedAt: lot.receivedAt,
    harvest: lot.harvest,
    variety: lot.variety,
    altitudeMeters: lot.altitudeMeters,
    screenSize: lot.screenSize,
    moisturePercent: toNumber(lot.moisturePercent),
    roastLevel: lot.roastLevel,
    cuppingScore: toNumber(lot.cuppingScore),
    notes: lot.notes,
    createdAt: lot.createdAt,
    updatedAt: lot.updatedAt,
  };
}

export function toMovementResponse(movement: MovementWithRelations): MovementResponse {
  return {
    id: movement.id,
    type: movement.type,
    lot: movement.lot,
    fromLocation: movement.fromLocation,
    toLocation: movement.toLocation,
    quantity: formatQuantity(movement.quantity),
    user: movement.user,
    occurredAt: movement.occurredAt,
    documentRef: movement.documentRef,
    reason: movement.reason,
    reversalOfId: movement.reversalOfId,
    reversedById: movement.reversedBy?.id ?? null,
    createdAt: movement.createdAt,
  };
}
