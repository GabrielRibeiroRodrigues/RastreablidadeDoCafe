import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { DomainProblemException } from '../../common/http/domain-problem.exception.js';
import { orderBy, pageArgs, toPage, type Page } from '../../common/http/pagination.js';
import { MovementType, type Prisma } from '../../generated/prisma/client.js';
import { TenantContext } from '../../tenancy/tenant-context.js';
import {
  TenantPrismaService,
  type TenantTransaction,
} from '../../tenancy/tenant-prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import {
  CancellationProblems,
  lockRow,
  toCancellation,
  type CancelOperationDto,
} from '../inventory/cancellation.js';
import { DOCUMENT_KINDS, DocumentNumberService } from '../inventory/document-number.service.js';
import {
  assertSameRequest,
  isIdempotencyRace,
  type IdempotencyToken,
} from '../inventory/idempotency.js';
import { formatQuantity, Quantity } from '../inventory/quantity.js';
import { StockLedgerService } from '../inventory/stock-ledger.service.js';
import type {
  CreateShipmentDto,
  CreateShipmentItemDto,
  ListShipmentsQueryDto,
  ShipmentDetailResponse,
  ShipmentResponse,
} from './shipments.dto.js';

export interface ShipmentResult {
  shipment: ShipmentDetailResponse;
  /** true quando a resposta é a repetição de uma expedição já feita com a mesma chave. */
  replayed: boolean;
}

const USER_SELECT = { select: { id: true, name: true } } as const;

const LIST_INCLUDE = {
  customer: { select: { id: true, name: true } },
  user: USER_SELECT,
  cancelledBy: USER_SELECT,
  items: { select: { movement: { select: { reversedBy: { select: { id: true } } } } } },
} as const satisfies Prisma.ShipmentInclude;

const DETAIL_INCLUDE = {
  customer: { select: { id: true, name: true, document: true, city: true, state: true } },
  user: USER_SELECT,
  cancelledBy: USER_SELECT,
  items: {
    orderBy: { createdAt: 'asc' },
    include: {
      lot: {
        select: {
          id: true,
          code: true,
          status: true,
          unit: true,
          product: { select: { id: true, sku: true, name: true, type: true } },
        },
      },
      location: { select: { id: true, code: true, name: true, type: true } },
      movement: { select: { reversedBy: { select: { id: true, occurredAt: true } } } },
    },
  },
} as const satisfies Prisma.ShipmentInclude;

type ShipmentListRow = Prisma.ShipmentGetPayload<{ include: typeof LIST_INCLUDE }>;
type ShipmentDetailRow = Prisma.ShipmentGetPayload<{ include: typeof DETAIL_INCLUDE }>;

/**
 * Expedição (Semana 3): um documento EXP-AAAA-NNNNNN e uma saída (ISSUE) no razão por item, tudo
 * numa única transação. Não há edição nem exclusão — correção é pelo estorno da saída do item.
 */
@Injectable()
export class ShipmentsService {
  constructor(
    private readonly db: TenantPrismaService,
    private readonly tenant: TenantContext,
    private readonly ledger: StockLedgerService,
    private readonly numbers: DocumentNumberService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateShipmentDto, idempotency?: IdempotencyToken): Promise<ShipmentResult> {
    assertDistinctItems(dto.items);

    const replay = await this.findReplay(idempotency);
    if (replay) return replay;

    try {
      const id = await this.db.transaction((tx) => this.ship(tx, dto, idempotency));
      return { shipment: await this.get(id), replayed: false };
    } catch (error) {
      // Duas requisições simultâneas com a mesma chave: a perdedora devolve o resultado da outra.
      if (idempotency && isIdempotencyRace(error)) {
        const raced = await this.findReplay(idempotency);
        if (raced) return raced;
      }
      throw error;
    }
  }

  /**
   * Cancela a expedição (devolução total, cliente errado): estorna a saída de cada item ainda não
   * estornado, numa transação. O café volta ao local de onde saiu.
   */
  async cancel(id: string, dto: CancelOperationDto): Promise<ShipmentDetailResponse> {
    await this.db.transaction(async (tx) => {
      const shipment = await lockRow(tx, 'shipments', id);
      if (shipment.cancelled_at) throw CancellationProblems.alreadyCancelled(shipment.number);

      const items = await tx.shipmentItem.findMany({
        where: { shipmentId: id, movement: { reversedBy: { is: null } } },
        include: { movement: true },
      });
      // Mesma ordem de travamento da criação (lote, depois local): sem deadlock.
      const ordered = [...items].sort(byLotThenLocation);
      for (const item of ordered) {
        await this.ledger.reverse(
          tx,
          item.movement,
          `Cancelamento da ${shipment.number}: ${dto.reason}`,
        );
      }

      await tx.shipment.update({
        where: { id },
        data: {
          cancelledAt: new Date(),
          cancelReason: dto.reason,
          cancelledById: this.tenant.requireUserId(),
        },
      });
      await this.audit.record(
        {
          action: 'shipment.cancelled',
          entityType: 'shipment',
          entityId: id,
          before: { cancelled: false },
          after: { cancelled: true, reason: dto.reason, reversedItems: ordered.length },
        },
        tx,
      );
    });
    return this.get(id);
  }

  async list(query: ListShipmentsQueryDto): Promise<Page<ShipmentResponse>> {
    const where: Prisma.ShipmentWhereInput = {
      ...(query.customerId && { customerId: query.customerId }),
      ...(query.userId && { userId: query.userId }),
      ...(query.lotId && { items: { some: { lotId: query.lotId } } }),
      ...((query.from || query.to) && {
        shippedAt: {
          ...(query.from && { gte: new Date(query.from) }),
          ...(query.to && { lt: new Date(query.to) }),
        },
      }),
      ...(query.q && {
        OR: [
          { number: { contains: query.q, mode: 'insensitive' } },
          { orderRef: { contains: query.q, mode: 'insensitive' } },
        ],
      }),
    };

    const [rows, total] = await Promise.all([
      this.db.client.shipment.findMany({
        where,
        include: LIST_INCLUDE,
        orderBy: orderBy(query.sort),
        ...pageArgs(query),
      }),
      this.db.client.shipment.count({ where }),
    ]);
    return toPage(rows.map(toShipmentResponse), total, query);
  }

  async get(id: string): Promise<ShipmentDetailResponse> {
    const shipment = await this.db.client.shipment.findUniqueOrThrow({
      where: { id },
      include: DETAIL_INCLUDE,
    });
    return toShipmentDetail(shipment);
  }

  private async ship(
    tx: TenantTransaction,
    dto: CreateShipmentDto,
    idempotency?: IdempotencyToken,
  ): Promise<string> {
    const customer = await tx.customer.findUnique({ where: { id: dto.customerId } });
    if (!customer) throw new NotFoundException('Customer not found');
    if (!customer.isActive) {
      throw new DomainProblemException(
        '/problems/inactive-customer',
        `Customer ${customer.name} is inactive and cannot receive shipments.`,
        HttpStatus.CONFLICT,
      );
    }

    const shippedAt = dto.shippedAt ? new Date(dto.shippedAt) : new Date();
    const number = await this.numbers.next(tx, DOCUMENT_KINDS.shipment, shippedAt);

    const shipment = await tx.shipment.create({
      data: {
        number,
        customerId: customer.id,
        orderRef: dto.orderRef ?? null,
        shippedAt,
        notes: dto.notes ?? null,
        userId: this.tenant.requireUserId(),
        idempotencyKey: idempotency?.key ?? null,
        requestHash: idempotency?.hash ?? null,
      } as Prisma.ShipmentUncheckedCreateInput,
      select: { id: true },
    });

    // Ordem fixa de travamento (lote, depois local): duas expedições concorrentes com os mesmos
    // lotes pegam os `FOR UPDATE` na mesma sequência e uma espera a outra, sem deadlock.
    for (const item of [...dto.items].sort(byLotThenLocation)) {
      const movement = await this.ledger.record(tx, {
        type: MovementType.ISSUE,
        lotId: item.lotId,
        fromLocationId: item.locationId,
        quantity: new Quantity(item.quantity),
        occurredAt: shippedAt,
        documentRef: number,
      });
      await tx.shipmentItem.create({
        data: {
          shipmentId: shipment.id,
          lotId: item.lotId,
          locationId: item.locationId,
          quantity: movement.quantity,
          movementId: movement.id,
        } as Prisma.ShipmentItemUncheckedCreateInput,
      });
    }

    await this.audit.record(
      {
        action: 'shipment.created',
        entityType: 'shipment',
        entityId: shipment.id,
        after: {
          number,
          customer: { id: customer.id, name: customer.name },
          orderRef: dto.orderRef ?? null,
          items: dto.items,
        },
      },
      tx,
    );
    return shipment.id;
  }

  private async findReplay(idempotency?: IdempotencyToken): Promise<ShipmentResult | undefined> {
    if (!idempotency) return undefined;
    const previous = await this.db.client.shipment.findFirst({
      where: { idempotencyKey: idempotency.key },
      select: { id: true, requestHash: true },
    });
    if (!previous) return undefined;

    assertSameRequest(previous.requestHash, idempotency);
    return { shipment: await this.get(previous.id), replayed: true };
  }
}

function assertDistinctItems(items: CreateShipmentItemDto[]): void {
  const seen = new Set<string>();
  for (const item of items) {
    const pair = `${item.lotId}:${item.locationId}`;
    if (seen.has(pair)) {
      throw new DomainProblemException(
        '/problems/invalid-shipment',
        'Each (lotId, locationId) pair may appear only once; merge the quantities.',
        HttpStatus.BAD_REQUEST,
        { lotId: item.lotId, locationId: item.locationId },
      );
    }
    seen.add(pair);
  }
}

const byLotThenLocation = (
  a: Pick<CreateShipmentItemDto, 'lotId' | 'locationId'>,
  b: Pick<CreateShipmentItemDto, 'lotId' | 'locationId'>,
): number =>
  a.lotId === b.lotId ? a.locationId.localeCompare(b.locationId) : a.lotId.localeCompare(b.lotId);

function toShipmentResponse(row: ShipmentListRow): ShipmentResponse {
  return {
    id: row.id,
    number: row.number,
    customer: row.customer,
    orderRef: row.orderRef,
    shippedAt: row.shippedAt,
    itemsCount: row.items.length,
    reversedItemsCount: row.items.filter((item) => item.movement.reversedBy).length,
    user: row.user,
    cancellation: toCancellation(row),
  };
}

function toShipmentDetail(row: ShipmentDetailRow): ShipmentDetailResponse {
  return {
    id: row.id,
    number: row.number,
    customer: row.customer,
    orderRef: row.orderRef,
    shippedAt: row.shippedAt,
    notes: row.notes,
    items: row.items.map((item) => ({
      lot: { id: item.lot.id, code: item.lot.code, status: item.lot.status },
      product: item.lot.product,
      location: item.location,
      quantity: formatQuantity(item.quantity),
      unit: item.lot.unit,
      movementId: item.movementId,
      reversal: item.movement.reversedBy,
    })),
    user: row.user,
    cancellation: toCancellation(row),
    createdAt: row.createdAt,
  };
}
