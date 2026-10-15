import { ForbiddenException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import type { AuthUser } from '../../auth/auth-user.js';
import { DomainProblemException } from '../../common/http/domain-problem.exception.js';
import { orderBy, pageArgs, toPage, type Page } from '../../common/http/pagination.js';
import { LotStatus, Prisma } from '../../generated/prisma/client.js';
import { TenantPrismaService } from '../../tenancy/tenant-prisma.service.js';
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
  ) {}

  async list(query: ListLotsQueryDto): Promise<Page<LotResponse>> {
    const where: Prisma.LotWhereInput = {
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
    await this.db.client.lot.update({ where: { id }, data: qualityData(dto) });
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

      await tx.lot.update({ where: { id }, data: { status: dto.status } });
      // Auditoria estruturada chega na Semana 4; por ora, o motivo fica no log da requisição.
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
