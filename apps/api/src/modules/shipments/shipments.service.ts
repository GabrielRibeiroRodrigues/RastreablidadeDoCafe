import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { DomainProblemException } from '../../common/http/domain-problem.exception.js';
import { orderBy, pageArgs, toPage, type Page } from '../../common/http/pagination.js';
import { MovementType, type Prisma } from '../../generated/prisma/client.js';
import { TenantContext } from '../../tenancy/tenant-context.js';
import {
  TenantPrismaService,
  type TenantTransaction,
} from '../../tenancy/tenant-prisma.service.js';
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
  _count: { select: { items: true } },
} as const satisfies Prisma.ShipmentInclude;

const DETAIL_INCLUDE = {
  customer: { select: { id: true, name: true, document: true, city: true, state: true } },
  user: USER_SELECT,
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

const byLotThenLocation = (a: CreateShipmentItemDto, b: CreateShipmentItemDto): number =>
  a.lotId === b.lotId ? a.locationId.localeCompare(b.locationId) : a.lotId.localeCompare(b.lotId);

function toShipmentResponse(row: ShipmentListRow): ShipmentResponse {
  return {
    id: row.id,
    number: row.number,
    customer: row.customer,
    orderRef: row.orderRef,
    shippedAt: row.shippedAt,
    itemsCount: row._count.items,
    user: row.user,
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
    })),
    user: row.user,
    createdAt: row.createdAt,
  };
}
