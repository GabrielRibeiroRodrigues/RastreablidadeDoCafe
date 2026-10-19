import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import {
  DomainProblemException,
  StockProblems,
} from '../../common/http/domain-problem.exception.js';
import {
  LocationType,
  LotStatus,
  MovementType,
  Prisma,
  type StockMovement,
} from '../../generated/prisma/client.js';
import { TenantContext } from '../../tenancy/tenant-context.js';
import type { TenantTransaction } from '../../tenancy/tenant-prisma.service.js';
import { formatQuantity, ZERO, type Quantity } from './quantity.js';

export interface RecordMovementInput {
  type: MovementType;
  lotId: string;
  fromLocationId?: string | null;
  toLocationId?: string | null;
  quantity: Quantity;
  occurredAt?: Date;
  documentRef?: string | null;
  reason?: string | null;
  reversalOfId?: string;
  idempotency?: { key: string; hash: string };
  /**
   * Permite baixar estoque de lote em quarentena/bloqueado. Uso exclusivo do descarte de não
   * conformidade (perda do saldo retido); nenhuma rota pública repassa esta opção.
   */
  allowRestrictedLot?: boolean;
}

interface LockedLot {
  id: string;
  code: string;
  status: LotStatus;
}

/** Quais lados (origem/destino) cada tipo de movimentação usa. */
const DIRECTION: Record<
  MovementType,
  { from: 'required' | 'forbidden' | 'any'; to: 'required' | 'forbidden' | 'any' }
> = {
  RECEIPT: { from: 'forbidden', to: 'required' },
  ISSUE: { from: 'required', to: 'forbidden' },
  TRANSFER: { from: 'required', to: 'required' },
  ADJUSTMENT: { from: 'any', to: 'any' }, // exatamente um dos dois (validado abaixo)
  CONSUMPTION: { from: 'required', to: 'forbidden' },
  PRODUCTION: { from: 'forbidden', to: 'required' },
  REVERSAL: { from: 'any', to: 'any' }, // derivado da movimentação estornada
};

/**
 * Razão de estoque (ADR 0007). Toda escrita passa por `record()`, sempre dentro de uma transação:
 *
 * 1. `SELECT ... FOR UPDATE` na linha do lote → movimentações do mesmo lote ficam em fila;
 * 2. saldo por local calculado do próprio razão (entradas − saídas);
 * 3. regras de status e de saldo; 4. inserção (imutável); 5. status CONSUMED/AVAILABLE automático.
 */
@Injectable()
export class StockLedgerService {
  constructor(private readonly tenant: TenantContext) {}

  /** Trava o lote até o fim da transação. 404 se não existir (ou for de outra empresa). */
  async lockLot(tx: TenantTransaction, lotId: string): Promise<LockedLot> {
    const rows = await tx.sql<LockedLot[]>(
      (companyId) => Prisma.sql`
        SELECT id, code, status FROM lots
        WHERE company_id = ${companyId}::uuid AND id = ${lotId}::uuid
        FOR UPDATE`,
    );
    const lot = rows[0];
    if (!lot) throw new NotFoundException('Lot not found');
    return lot;
  }

  /** Saldo do lote por local, a partir do razão. Locais com saldo zero são omitidos. */
  async balances(
    tx: Pick<TenantTransaction, 'sql'>,
    lotId: string,
  ): Promise<Map<string, Quantity>> {
    const rows = await tx.sql<Array<{ location_id: string; balance: Quantity }>>(
      (companyId) => Prisma.sql`
        SELECT location_id, SUM(qty) AS balance FROM (
          SELECT to_location_id AS location_id, quantity AS qty FROM stock_movements
          WHERE company_id = ${companyId}::uuid AND lot_id = ${lotId}::uuid
            AND to_location_id IS NOT NULL
          UNION ALL
          SELECT from_location_id, -quantity FROM stock_movements
          WHERE company_id = ${companyId}::uuid AND lot_id = ${lotId}::uuid
            AND from_location_id IS NOT NULL
        ) ledger
        GROUP BY location_id
        HAVING SUM(qty) <> 0`,
    );
    return new Map(rows.map((row) => [row.location_id, new Prisma.Decimal(row.balance)]));
  }

  async record(tx: TenantTransaction, input: RecordMovementInput): Promise<StockMovement> {
    assertDirection(input);
    const lot = await this.lockLot(tx, input.lotId);
    const locations = await this.loadLocations(tx, input);

    if (input.fromLocationId && input.type !== MovementType.REVERSAL && !input.allowRestrictedLot) {
      const destination = input.toLocationId ? locations.get(input.toLocationId) : undefined;
      assertLotCanLeave(lot, destination?.type);
    }

    const before = await this.balances(tx, lot.id);
    if (input.fromLocationId) {
      const available = before.get(input.fromLocationId) ?? ZERO;
      if (available.lessThan(input.quantity)) {
        throw StockProblems.insufficientStock(
          formatQuantity(available),
          formatQuantity(input.quantity),
          locations.get(input.fromLocationId)?.code ?? input.fromLocationId,
        );
      }
    }

    const movement = await tx.stockMovement.create({
      data: {
        type: input.type,
        lotId: lot.id,
        fromLocationId: input.fromLocationId ?? null,
        toLocationId: input.toLocationId ?? null,
        quantity: input.quantity,
        userId: this.tenant.requireUserId(),
        occurredAt: input.occurredAt ?? new Date(),
        documentRef: input.documentRef ?? null,
        reason: input.reason ?? null,
        reversalOfId: input.reversalOfId ?? null,
        idempotencyKey: input.idempotency?.key ?? null,
        requestHash: input.idempotency?.hash ?? null,
      } as Prisma.StockMovementUncheckedCreateInput,
    });

    await this.syncConsumedStatus(tx, lot, before, input);
    return movement;
  }

  /**
   * Estorno: nova linha com origem e destino trocados; a original continua intacta. O banco
   * garante um estorno por movimentação (`reversal_of_id` único).
   */
  reverse(tx: TenantTransaction, original: StockMovement, reason: string): Promise<StockMovement> {
    return this.record(tx, {
      type: MovementType.REVERSAL,
      lotId: original.lotId,
      fromLocationId: original.toLocationId,
      toLocationId: original.fromLocationId,
      quantity: original.quantity,
      documentRef: original.documentRef,
      reason,
      reversalOfId: original.id,
    });
  }

  /** CONSUMED quando o saldo total zera; volta a AVAILABLE se um estorno repõe saldo. */
  private async syncConsumedStatus(
    tx: TenantTransaction,
    lot: LockedLot,
    before: Map<string, Quantity>,
    input: RecordMovementInput,
  ): Promise<void> {
    let total = [...before.values()].reduce((sum, value) => sum.plus(value), ZERO);
    if (input.toLocationId) total = total.plus(input.quantity);
    if (input.fromLocationId) total = total.minus(input.quantity);

    if (total.isZero() && lot.status === LotStatus.AVAILABLE) {
      await tx.lot.update({ where: { id: lot.id }, data: { status: LotStatus.CONSUMED } });
    } else if (total.greaterThan(0) && lot.status === LotStatus.CONSUMED) {
      await tx.lot.update({ where: { id: lot.id }, data: { status: LotStatus.AVAILABLE } });
    }
  }

  private async loadLocations(tx: TenantTransaction, input: RecordMovementInput) {
    const ids = [input.fromLocationId, input.toLocationId].filter((id): id is string => !!id);
    const found = await tx.location.findMany({
      where: { id: { in: ids } },
      select: { id: true, code: true, type: true, isActive: true },
    });
    const byId = new Map(found.map((location) => [location.id, location]));

    for (const id of ids) {
      if (!byId.has(id)) throw new NotFoundException('Location not found');
    }
    const destination = input.toLocationId ? byId.get(input.toLocationId) : undefined;
    if (destination && !destination.isActive && input.type !== MovementType.REVERSAL) {
      throw new DomainProblemException(
        '/problems/inactive-location',
        `Location ${destination.code} is inactive and cannot receive stock.`,
        HttpStatus.CONFLICT,
      );
    }
    return byId;
  }
}

function assertDirection(input: RecordMovementInput): void {
  const rule = DIRECTION[input.type];
  const has = { from: !!input.fromLocationId, to: !!input.toLocationId };
  const invalid = (['from', 'to'] as const).filter(
    (side) =>
      (rule[side] === 'required' && !has[side]) || (rule[side] === 'forbidden' && has[side]),
  );
  const adjustmentInvalid = input.type === MovementType.ADJUSTMENT && has.from === has.to;

  if (invalid.length || adjustmentInvalid) {
    throw new DomainProblemException(
      '/problems/invalid-movement',
      input.type === MovementType.ADJUSTMENT
        ? 'An adjustment needs exactly one of fromLocationId (loss) or toLocationId (gain).'
        : `${input.type} requires ${describe(rule)}.`,
      HttpStatus.BAD_REQUEST,
    );
  }
  if (input.fromLocationId && input.fromLocationId === input.toLocationId) {
    throw new DomainProblemException(
      '/problems/invalid-movement',
      'Origin and destination must be different locations.',
      HttpStatus.BAD_REQUEST,
    );
  }
}

function describe(rule: (typeof DIRECTION)[MovementType]): string {
  const parts = [
    rule.from === 'required'
      ? 'fromLocationId'
      : rule.from === 'forbidden'
        ? 'no fromLocationId'
        : '',
    rule.to === 'required' ? 'toLocationId' : rule.to === 'forbidden' ? 'no toLocationId' : '',
  ].filter(Boolean);
  return parts.join(' and ');
}

/**
 * Lote bloqueado ou em quarentena não sai do lugar — exceto lote em quarentena sendo levado
 * para uma área de quarentena.
 */
function assertLotCanLeave(lot: LockedLot, destinationType: LocationType | undefined): void {
  if (lot.status === LotStatus.AVAILABLE || lot.status === LotStatus.CONSUMED) return;
  if (lot.status === LotStatus.QUARANTINE && destinationType === LocationType.QUARANTINE) return;
  throw StockProblems.lotNotMovable(lot.code, lot.status);
}
