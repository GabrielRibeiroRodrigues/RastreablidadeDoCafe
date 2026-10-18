import { ForbiddenException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import type { AuthUser } from '../../auth/auth-user.js';
import { DomainProblemException } from '../../common/http/domain-problem.exception.js';
import { orderBy, pageArgs, toPage, type Page } from '../../common/http/pagination.js';
import { LotStatus, Prisma } from '../../generated/prisma/client.js';
import {
  TenantPrismaService,
  type TenantTransaction,
} from '../../tenancy/tenant-prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { LotDetailResponse, LotResponse } from './inventory.dto.js';
import { fromDateOnly, LOT_INCLUDE, toLotResponse } from './inventory.mappers.js';
import type {
  ChangeLotStatusDto,
  ListLotsQueryDto,
  LotQualityDto,
  UpdateLotDto,
} from './lots.dto.js';
import { formatQuantity, ZERO, type Quantity } from './quantity.js';
import { StockLedgerService } from './stock-ledger.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class LotsService {
  private readonly logger = new Logger(LotsService.name);

  constructor(
    private readonly db: TenantPrismaService,
    private readonly ledger: StockLedgerService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListLotsQueryDto): Promise<Page<LotResponse>> {
    const where = lotsWhere(query);

    const [lots, total] = await Promise.all([
      this.db.client.lot.findMany({
        where,
        include: LOT_INCLUDE,
        orderBy: orderBy(query.sort),
        ...pageArgs(query),
      }),
      this.db.client.lot.count({ where }),
    ]);

    const balances = await this.totalBalances(lots.map((lot) => lot.id));
    return toPage(
      lots.map((lot) => toLotResponse(lot, balances.get(lot.id))),
      total,
      query,
    );
  }

  /**
   * Mesmos filtros e ordem da listagem, sem paginação (exportação CSV). Devolve até `limit` lotes
   * e o total, para o relatório avisar quando cortou.
   */
  async listForExport(
    query: LotsFilter & { sort: ListLotsQueryDto['sort'] },
    limit: number,
  ): Promise<{ data: LotResponse[]; total: number }> {
    const where = lotsWhere(query);
    const [lots, total] = await Promise.all([
      this.db.client.lot.findMany({
        where,
        include: LOT_INCLUDE,
        orderBy: orderBy(query.sort),
        take: limit,
      }),
      this.db.client.lot.count({ where }),
    ]);
    const balances = await this.totalBalances(lots.map((lot) => lot.id));
    return { data: lots.map((lot) => toLotResponse(lot, balances.get(lot.id))), total };
  }

  async get(id: string): Promise<LotDetailResponse> {
    const lot = await this.db.client.lot.findUniqueOrThrow({ where: { id }, include: LOT_INCLUDE });
    const byLocation = await this.ledger.balances(this.db, id);

    const locations = await this.db.client.location.findMany({
      where: { id: { in: [...byLocation.keys()] } },
      select: { id: true, code: true, name: true, type: true },
      orderBy: { code: 'asc' },
    });
    const stock = locations.map((location) => ({
      location,
      quantity: formatQuantity(byLocation.get(location.id) ?? ZERO),
    }));
    const total = [...byLocation.values()].reduce((sum, value) => sum.plus(value), ZERO);

    return { ...toLotResponse(lot, total), stock };
  }

  async update(id: string, dto: UpdateLotDto): Promise<LotDetailResponse> {
    await this.db.transaction(async (tx) => {
      const data = qualityData(dto);
      const fields = Object.keys(data);
      const select = Object.fromEntries(fields.map((field) => [field, true]));
      const before = await tx.lot.findUniqueOrThrow({
        where: { id },
        select: { code: true, ...select },
      });
      const after = await tx.lot.update({ where: { id }, data, select });
      await this.audit.record(
        {
          action: 'lot.updated',
          entityType: 'lot',
          entityId: id,
          before: pick(before, fields),
          after: pick(after, fields),
        },
        tx,
      );
    });
    return this.get(id);
  }

  /**
   * Quarentena: operador ou admin. Bloquear e liberar: só admin. CONSUMED é automático.
   * A troca acontece com o lote travado, para não cruzar com uma movimentação em andamento.
   */
  async changeStatus(
    id: string,
    dto: ChangeLotStatusDto,
    user: AuthUser,
  ): Promise<LotDetailResponse> {
    const isAdmin = user.roles.includes('admin');
    if (dto.status !== LotStatus.QUARANTINE && !isAdmin) {
      throw new ForbiddenException('Only an admin can block or release a lot');
    }

    await this.db.transaction(async (tx) => {
      const lot = await this.ledger.lockLot(tx, id);
      if (lot.status === LotStatus.CONSUMED) {
        throw new DomainProblemException(
          '/problems/lot-consumed',
          `Lot ${lot.code} has no stock left; its status cannot be changed.`,
          HttpStatus.CONFLICT,
        );
      }
      if (lot.status === dto.status) return;
      if (dto.status === LotStatus.AVAILABLE) {
        await assertNotUnderOpenRecall(tx, lot);
      }

      await tx.lot.update({ where: { id }, data: { status: dto.status } });
      await this.audit.record(
        {
          action: 'lot.status_changed',
          entityType: 'lot',
          entityId: id,
          before: { code: lot.code, status: lot.status },
          after: { code: lot.code, status: dto.status, reason: dto.reason },
        },
        tx,
      );
      this.logger.log(
        { lot: lot.code, from: lot.status, to: dto.status, reason: dto.reason, by: user.id },
        'Lot status changed',
      );
    });

    return this.get(id);
  }

  /** Saldo total de vários lotes numa consulta só (para listagens). */
  private async totalBalances(lotIds: string[]): Promise<Map<string, Quantity>> {
    if (lotIds.length === 0) return new Map();
    const rows = await this.db.sql<Array<{ lot_id: string; balance: Quantity }>>(
      (companyId) => Prisma.sql`
        SELECT lot_id,
               SUM(CASE WHEN to_location_id IS NOT NULL THEN quantity ELSE 0 END)
             - SUM(CASE WHEN from_location_id IS NOT NULL THEN quantity ELSE 0 END) AS balance
        FROM stock_movements
        WHERE company_id = ${companyId}::uuid AND lot_id = ANY(${lotIds}::uuid[])
        GROUP BY lot_id`,
    );
    return new Map(rows.map((row) => [row.lot_id, new Prisma.Decimal(row.balance)]));
  }
}

/** DTO de qualidade → colunas do lote (datas só-dia em UTC). */
export function qualityData(dto: LotQualityDto): Prisma.LotUncheckedUpdateInput {
  const { expiresAt, ...rest } = dto;
  // Só campos enviados: a instância do DTO tem as propriedades ausentes como `undefined`, e
  // espalhá-las apagaria valores herdados (ex.: safra/variedade herdadas dos insumos na produção).
  const sent = Object.fromEntries(Object.entries(rest).filter(([, value]) => value !== undefined));
  return {
    ...sent,
    ...(expiresAt !== undefined && {
      expiresAt: expiresAt === null ? null : fromDateOnly(expiresAt),
    }),
  };
}

/**
 * Lote num recall não encerrado não volta a ficar disponível (nem por troca manual de status, nem
 * por liberação de não conformidade): a liberação exige encerrar o recall antes.
 */
export async function assertNotUnderOpenRecall(
  tx: TenantTransaction,
  lot: { id: string; code: string },
): Promise<void> {
  const open = await tx.recallLot.findFirst({
    where: { lotId: lot.id, recall: { status: { not: 'CLOSED' } } },
    select: { recall: { select: { id: true, number: true } } },
  });
  if (open) {
    throw new DomainProblemException(
      '/problems/lot-under-recall',
      `Lot ${lot.code} is under recall ${open.recall.number} and cannot be released.`,
      HttpStatus.CONFLICT,
      { lot: lot.code, recall: open.recall.number, recallId: open.recall.id },
    );
  }
}

function pick(source: Record<string, unknown>, fields: string[]): Record<string, unknown> {
  return Object.fromEntries(fields.map((field) => [field, source[field] ?? null]));
}

/** Filtros da listagem de lotes (também usados na exportação CSV). */
export type LotsFilter = Pick<
  ListLotsQueryDto,
  'status' | 'productId' | 'supplierId' | 'q' | 'expiresWithinDays'
>;

export function lotsWhere(query: LotsFilter): Prisma.LotWhereInput {
  return {
    ...(query.status && { status: query.status }),
    ...(query.productId && { productId: query.productId }),
    ...(query.supplierId && { supplierId: query.supplierId }),
    ...(query.q && {
      OR: [
        { code: { contains: query.q, mode: 'insensitive' } },
        { product: { name: { contains: query.q, mode: 'insensitive' } } },
        { product: { sku: { contains: query.q, mode: 'insensitive' } } },
        { supplier: { name: { contains: query.q, mode: 'insensitive' } } },
        { supplier: { farmName: { contains: query.q, mode: 'insensitive' } } },
      ],
    }),
    ...(query.expiresWithinDays !== undefined && {
      expiresAt: { not: null, lte: new Date(Date.now() + query.expiresWithinDays * DAY_MS) },
    }),
  };
}
