import { ConflictException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { DomainProblemException } from '../../common/http/domain-problem.exception.js';
import { pageArgs, toPage, type Page } from '../../common/http/pagination.js';
import {
  InventoryCountStatus,
  MovementType,
  Prisma,
  type InventoryCountItem,
} from '../../generated/prisma/client.js';
import { TenantContext } from '../../tenancy/tenant-context.js';
import {
  TenantPrismaService,
  type TenantTransaction,
} from '../../tenancy/tenant-prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { DOCUMENT_KINDS, DocumentNumberService } from '../inventory/document-number.service.js';
import { formatQuantity, Quantity, ZERO } from '../inventory/quantity.js';
import { StockLedgerService } from '../inventory/stock-ledger.service.js';
import type {
  AddCountItemDto,
  CountItemDto,
  CreateInventoryCountDto,
  InventoryCountDetailResponse,
  InventoryCountItemResponse,
  InventoryCountResponse,
  ListInventoryCountsQueryDto,
} from './inventory-counts.dto.js';

const USER = { select: { id: true, name: true } } as const;

const LIST_INCLUDE = {
  location: { select: { id: true, code: true, name: true, type: true } },
  createdBy: USER,
  appliedBy: USER,
  cancelledBy: USER,
  items: { select: { countedQuantity: true } },
} as const satisfies Prisma.InventoryCountInclude;

const DETAIL_INCLUDE = {
  ...LIST_INCLUDE,
  items: {
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
      countedBy: USER,
    },
    orderBy: [{ lot: { code: 'asc' } }],
  },
} as const satisfies Prisma.InventoryCountInclude;

type ListRow = Prisma.InventoryCountGetPayload<{ include: typeof LIST_INCLUDE }>;
type DetailRow = Prisma.InventoryCountGetPayload<{ include: typeof DETAIL_INCLUDE }>;

const Problems = {
  alreadyOpen: (location: string, number: string) =>
    new DomainProblemException(
      '/problems/inventory-count-open',
      `Location ${location} already has an open inventory count (${number}).`,
      HttpStatus.CONFLICT,
      { location, count: number },
    ),
  notOpen: (number: string, status: InventoryCountStatus) =>
    new DomainProblemException(
      '/problems/inventory-count-closed',
      `Inventory count ${number} is ${status}; only open counts can change.`,
      HttpStatus.CONFLICT,
      { count: number, countStatus: status },
    ),
  incomplete: (number: string, missing: string[]) =>
    new DomainProblemException(
      '/problems/inventory-count-incomplete',
      `Inventory count ${number} still has ${missing.length} lot(s) without a counted quantity.`,
      HttpStatus.CONFLICT,
      { count: number, missing },
    ),
};

/**
 * Inventário (contagem física) de um local. Abrir a contagem fotografa os lotes com saldo ali;
 * a equipe registra o que contou (inclusive lote encontrado a mais); aplicar lança, numa
 * transação, um ajuste por diferença — contado menos o saldo **do momento da aplicação**, então
 * movimentações feitas durante a contagem não viram diferença falsa.
 */
@Injectable()
export class InventoryCountsService {
  constructor(
    private readonly db: TenantPrismaService,
    private readonly tenant: TenantContext,
    private readonly ledger: StockLedgerService,
    private readonly numbers: DocumentNumberService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateInventoryCountDto): Promise<InventoryCountDetailResponse> {
    const id = await this.db.transaction(async (tx) => {
      const location = await this.lockLocation(tx, dto.locationId);
      const open = await tx.inventoryCount.findFirst({
        where: { locationId: location.id, status: InventoryCountStatus.OPEN },
        select: { number: true },
      });
      if (open) throw Problems.alreadyOpen(location.code, open.number);

      const balances = await this.balancesAt(tx, location.id);
      const number = await this.numbers.next(tx, DOCUMENT_KINDS.inventoryCount);
      const count = await tx.inventoryCount.create({
        data: {
          number,
          locationId: location.id,
          notes: dto.notes ?? null,
          createdById: this.tenant.requireUserId(),
        } as Prisma.InventoryCountUncheckedCreateInput,
        select: { id: true },
      });
      if (balances.size > 0) {
        await tx.inventoryCountItem.createMany({
          data: [...balances].map(([lotId, quantity]) => ({
            countId: count.id,
            lotId,
            systemQuantity: quantity,
          })) as Prisma.InventoryCountItemCreateManyInput[],
        });
      }
      await this.audit.record(
        {
          action: 'inventory_count.created',
          entityType: 'inventory_count',
          entityId: count.id,
          after: { number, location: location.code, lots: balances.size },
        },
        tx,
      );
      return count.id;
    });
    return this.get(id);
  }

  async list(query: ListInventoryCountsQueryDto): Promise<Page<InventoryCountResponse>> {
    const where: Prisma.InventoryCountWhereInput = {
      ...(query.status && { status: query.status }),
      ...(query.locationId && { locationId: query.locationId }),
    };
    const [rows, total] = await Promise.all([
      this.db.client.inventoryCount.findMany({
        where,
        include: LIST_INCLUDE,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...pageArgs(query),
      }),
      this.db.client.inventoryCount.count({ where }),
    ]);
    return toPage(rows.map(toSummary), total, query);
  }

  async get(id: string): Promise<InventoryCountDetailResponse> {
    const row = await this.db.client.inventoryCount.findUniqueOrThrow({
      where: { id },
      include: DETAIL_INCLUDE,
    });
    // Enquanto aberta, a prévia da diferença usa o saldo de agora.
    const live =
      row.status === InventoryCountStatus.OPEN
        ? await this.balancesAt(this.db, row.locationId)
        : new Map<string, Quantity>();
    return toDetail(row, live);
  }

  async countItem(id: string, itemId: string, dto: CountItemDto) {
    await this.db.transaction(async (tx) => {
      await this.lockOpenCount(tx, id);
      const item = await tx.inventoryCountItem.findFirst({ where: { id: itemId, countId: id } });
      if (!item) throw new NotFoundException('Resource not found.');
      await tx.inventoryCountItem.update({
        where: { id: itemId },
        data: this.counted(dto.countedQuantity),
      });
    });
    return this.get(id);
  }

  async addItem(id: string, dto: AddCountItemDto) {
    await this.db.transaction(async (tx) => {
      const count = await this.lockOpenCount(tx, id);
      // 404 se o lote não existir ou for de outra empresa (extensão de tenant).
      await tx.lot.findUniqueOrThrow({ where: { id: dto.lotId }, select: { id: true } });
      const exists = await tx.inventoryCountItem.findFirst({
        where: { countId: id, lotId: dto.lotId },
        select: { id: true },
      });
      if (exists) throw new ConflictException('This lot is already in the count');
      const balances = await this.balancesAt(tx, count.location_id);
      await tx.inventoryCountItem.create({
        data: {
          countId: id,
          lotId: dto.lotId,
          systemQuantity: balances.get(dto.lotId) ?? ZERO,
          ...this.counted(dto.countedQuantity),
        } as Prisma.InventoryCountItemUncheckedCreateInput,
      });
    });
    return this.get(id);
  }

  /** Lança as diferenças como ajustes no razão (só admin), numa transação. */
  async apply(id: string): Promise<InventoryCountDetailResponse> {
    await this.db.transaction(
      async (tx) => {
        const count = await this.lockOpenCount(tx, id);
        const items = await tx.inventoryCountItem.findMany({
          where: { countId: id },
          include: { lot: { select: { code: true } } },
          // Mesma ordem de trava do razão (por lote): sem deadlock com outras operações.
          orderBy: { lotId: 'asc' },
        });
        const missing = items.filter((item) => item.countedQuantity === null);
        if (missing.length) {
          throw Problems.incomplete(
            count.number,
            missing.map((item) => item.lot.code),
          );
        }

        const reason = `Inventário ${count.number}`;
        let adjusted = 0;
        for (const item of items) {
          await this.ledger.lockLot(tx, item.lotId);
          const balance =
            (await this.ledger.balances(tx, item.lotId)).get(count.location_id) ?? ZERO;
          const difference = new Quantity(item.countedQuantity ?? ZERO).minus(balance);
          let adjustmentId: string | null = null;
          if (!difference.isZero()) {
            const movement = await this.ledger.record(tx, {
              type: MovementType.ADJUSTMENT,
              lotId: item.lotId,
              ...(difference.isPositive()
                ? { toLocationId: count.location_id }
                : { fromLocationId: count.location_id }),
              quantity: difference.abs(),
              documentRef: count.number,
              reason,
              // Perda contada em lote retido (quarentena, bloqueado) também é real.
              allowRestrictedLot: true,
            });
            adjustmentId = movement.id;
            adjusted++;
          }
          await tx.inventoryCountItem.update({
            where: { id: item.id },
            data: { difference, adjustmentId },
          });
        }

        await tx.inventoryCount.update({
          where: { id },
          data: {
            status: InventoryCountStatus.APPLIED,
            appliedAt: new Date(),
            appliedById: this.tenant.requireUserId(),
          },
        });
        await this.audit.record(
          {
            action: 'inventory_count.applied',
            entityType: 'inventory_count',
            entityId: id,
            before: { status: InventoryCountStatus.OPEN },
            after: {
              status: InventoryCountStatus.APPLIED,
              lots: items.length,
              adjustments: adjusted,
            },
          },
          tx,
        );
      },
      { timeout: 30_000 },
    );
    return this.get(id);
  }

  async cancel(id: string, reason: string): Promise<InventoryCountDetailResponse> {
    await this.db.transaction(async (tx) => {
      await this.lockOpenCount(tx, id);
      await tx.inventoryCount.update({
        where: { id },
        data: {
          status: InventoryCountStatus.CANCELLED,
          cancelledAt: new Date(),
          cancelledById: this.tenant.requireUserId(),
          cancelReason: reason,
        },
      });
      await this.audit.record(
        {
          action: 'inventory_count.cancelled',
          entityType: 'inventory_count',
          entityId: id,
          before: { status: InventoryCountStatus.OPEN },
          after: { status: InventoryCountStatus.CANCELLED, reason },
        },
        tx,
      );
    });
    return this.get(id);
  }

  private counted(quantity: string): Partial<InventoryCountItem> {
    return {
      countedQuantity: new Quantity(quantity),
      countedAt: new Date(),
      countedById: this.tenant.requireUserId(),
    };
  }

  /** Trava o local: duas aberturas simultâneas no mesmo local ficam em fila. */
  private async lockLocation(tx: TenantTransaction, id: string) {
    const [row] = await tx.sql<Array<{ id: string; code: string }>>(
      (companyId) => Prisma.sql`
        SELECT id, code FROM locations
        WHERE company_id = ${companyId}::uuid AND id = ${id}::uuid
        FOR UPDATE`,
    );
    if (!row) throw new NotFoundException('Location not found');
    return row;
  }

  /** Trava a contagem e exige que esteja aberta. 404 se não existir (ou for de outra empresa). */
  private async lockOpenCount(tx: TenantTransaction, id: string) {
    const [row] = await tx.sql<
      Array<{ number: string; status: InventoryCountStatus; location_id: string }>
    >(
      (companyId) => Prisma.sql`
        SELECT number, status, location_id FROM inventory_counts
        WHERE company_id = ${companyId}::uuid AND id = ${id}::uuid
        FOR UPDATE`,
    );
    if (!row) throw new NotFoundException('Resource not found.');
    if (row.status !== InventoryCountStatus.OPEN) throw Problems.notOpen(row.number, row.status);
    return row;
  }

  /** Saldo positivo de cada lote no local, a partir do razão. */
  private async balancesAt(
    db: Pick<TenantTransaction, 'sql'>,
    locationId: string,
  ): Promise<Map<string, Quantity>> {
    const rows = await db.sql<Array<{ lot_id: string; balance: Prisma.Decimal }>>(
      (companyId) => Prisma.sql`
        SELECT lot_id,
               SUM(CASE WHEN to_location_id = ${locationId}::uuid THEN quantity ELSE 0 END)
             - SUM(CASE WHEN from_location_id = ${locationId}::uuid THEN quantity ELSE 0 END)
               AS balance
        FROM stock_movements
        WHERE company_id = ${companyId}::uuid
          AND (to_location_id = ${locationId}::uuid OR from_location_id = ${locationId}::uuid)
        GROUP BY lot_id
        HAVING SUM(CASE WHEN to_location_id = ${locationId}::uuid THEN quantity ELSE 0 END)
             - SUM(CASE WHEN from_location_id = ${locationId}::uuid THEN quantity ELSE 0 END) > 0`,
    );
    return new Map(rows.map((row) => [row.lot_id, new Prisma.Decimal(row.balance)]));
  }
}

function toSummary(row: ListRow): InventoryCountResponse {
  return {
    id: row.id,
    number: row.number,
    status: row.status,
    location: row.location,
    notes: row.notes,
    itemsCount: row.items.length,
    countedCount: row.items.filter((item) => item.countedQuantity !== null).length,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    appliedBy: row.appliedBy,
    appliedAt: row.appliedAt,
    cancelledBy: row.cancelledBy,
    cancelledAt: row.cancelledAt,
    cancelReason: row.cancelReason,
  };
}

function toDetail(row: DetailRow, live: Map<string, Quantity>): InventoryCountDetailResponse {
  const open = row.status === InventoryCountStatus.OPEN;
  const items: InventoryCountItemResponse[] = row.items.map((item) => {
    const counted = item.countedQuantity;
    // Aberta: saldo de agora. Aplicada: saldo da aplicação (contado − diferença lançada).
    const current = open
      ? (live.get(item.lotId) ?? ZERO)
      : counted !== null && item.difference !== null
        ? counted.minus(item.difference)
        : item.systemQuantity;
    const difference = open ? (counted !== null ? counted.minus(current) : null) : item.difference;
    return {
      id: item.id,
      lot: { id: item.lot.id, code: item.lot.code, status: item.lot.status },
      product: item.lot.product,
      unit: item.lot.unit,
      systemQuantity: formatQuantity(item.systemQuantity),
      currentQuantity: formatQuantity(current),
      countedQuantity: counted !== null ? formatQuantity(counted) : null,
      difference: difference !== null ? formatQuantity(difference) : null,
      countedBy: item.countedBy,
      countedAt: item.countedAt,
      adjustmentId: item.adjustmentId,
    };
  });
  return { ...toSummary(row), items };
}
