import { Controller, Get, Injectable, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { ApiPageResponse, PagingDto, toPage, type Page } from '../../common/http/pagination.js';
import { upperTrim } from '../../common/http/transforms.js';
import {
  LocationType,
  LotStatus,
  Prisma,
  ProductType,
  Unit,
} from '../../generated/prisma/client.js';
import { TenantPrismaService } from '../../tenancy/tenant-prisma.service.js';
import { StockRow } from './inventory.dto.js';
import { toDateOnly } from './inventory.mappers.js';
import { formatQuantity } from './quantity.js';

const STOCK_SORTS = ['product', 'lot', 'location', '-quantity', 'quantity', 'expiresAt'] as const;
type StockSort = (typeof STOCK_SORTS)[number];

/** Ordenações fixas (whitelist) — o SQL nunca recebe texto livre do cliente. */
const STOCK_ORDER: Record<StockSort, Prisma.Sql> = {
  product: Prisma.sql`p.name, l.code, loc.code`,
  lot: Prisma.sql`l.code, loc.code`,
  location: Prisma.sql`loc.code, l.code`,
  '-quantity': Prisma.sql`b.quantity DESC, l.code`,
  quantity: Prisma.sql`b.quantity ASC, l.code`,
  expiresAt: Prisma.sql`l.expires_at ASC NULLS LAST, l.code`,
};

export class StockQueryDto extends PagingDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  locationId?: string;

  @ApiPropertyOptional({ enum: LotStatus, enumName: 'LotStatus' })
  @IsOptional()
  @IsEnum(LotStatus)
  lotStatus?: LotStatus;

  @ApiPropertyOptional({ enum: ProductType, enumName: 'ProductType' })
  @IsOptional()
  @IsEnum(ProductType)
  productType?: ProductType;

  @ApiPropertyOptional({ description: 'Busca pelo código do lote' })
  @IsOptional()
  @Transform(upperTrim)
  @IsString()
  @MaxLength(30)
  q?: string;

  @ApiPropertyOptional({ enum: STOCK_SORTS, default: 'product' })
  @IsOptional()
  @IsIn(STOCK_SORTS)
  sort: StockSort = 'product';
}

interface StockSqlRow {
  quantity: Prisma.Decimal;
  lot_id: string;
  lot_code: string;
  lot_status: LotStatus;
  expires_at: Date | null;
  unit: Unit;
  product_id: string;
  sku: string;
  product_name: string;
  product_type: ProductType;
  location_id: string;
  location_code: string;
  location_name: string;
  location_type: LocationType;
  total: bigint;
}

/**
 * Posição de estoque: saldo por lote e local, calculado do razão (entradas − saídas).
 * Uma consulta só, com o total para paginação via window function.
 */
@Injectable()
export class StockService {
  constructor(private readonly db: TenantPrismaService) {}

  async position(query: StockQueryDto): Promise<Page<StockRow>> {
    const { productId = null, locationId = null, lotStatus = null, productType = null } = query;
    const code = query.q ? `%${query.q}%` : null;
    const offset = (query.page - 1) * query.pageSize;

    const rows = await this.db.sql<StockSqlRow[]>(
      (companyId) => Prisma.sql`
        WITH ledger AS (
          SELECT lot_id, to_location_id AS location_id, quantity AS qty
          FROM stock_movements
          WHERE company_id = ${companyId}::uuid AND to_location_id IS NOT NULL
          UNION ALL
          SELECT lot_id, from_location_id, -quantity
          FROM stock_movements
          WHERE company_id = ${companyId}::uuid AND from_location_id IS NOT NULL
        ), balances AS (
          SELECT lot_id, location_id, SUM(qty) AS quantity
          FROM ledger GROUP BY lot_id, location_id HAVING SUM(qty) <> 0
        )
        SELECT b.quantity,
               l.id AS lot_id, l.code AS lot_code, l.status AS lot_status,
               l.expires_at, l.unit,
               p.id AS product_id, p.sku, p.name AS product_name, p.type AS product_type,
               loc.id AS location_id, loc.code AS location_code, loc.name AS location_name,
               loc.type AS location_type,
               COUNT(*) OVER () AS total
        FROM balances b
        JOIN lots l ON l.id = b.lot_id AND l.company_id = ${companyId}::uuid
        JOIN products p ON p.id = l.product_id AND p.company_id = ${companyId}::uuid
        JOIN locations loc ON loc.id = b.location_id AND loc.company_id = ${companyId}::uuid
        WHERE (${productId}::uuid IS NULL OR p.id = ${productId}::uuid)
          AND (${locationId}::uuid IS NULL OR loc.id = ${locationId}::uuid)
          AND (${lotStatus}::text IS NULL OR l.status::text = ${lotStatus}::text)
          AND (${productType}::text IS NULL OR p.type::text = ${productType}::text)
          AND (${code}::text IS NULL OR l.code ILIKE ${code}::text)
        ORDER BY ${STOCK_ORDER[query.sort]}
        LIMIT ${query.pageSize} OFFSET ${offset}`,
    );

    const total = rows[0] ? Number(rows[0].total) : 0;
    return toPage(rows.map(toStockRow), total, query);
  }
}

function toStockRow(row: StockSqlRow): StockRow {
  return {
    id: `${row.lot_id}:${row.location_id}`,
    lot: { id: row.lot_id, code: row.lot_code, status: row.lot_status },
    expiresAt: toDateOnly(row.expires_at),
    product: { id: row.product_id, sku: row.sku, name: row.product_name, type: row.product_type },
    location: {
      id: row.location_id,
      code: row.location_code,
      name: row.location_name,
      type: row.location_type,
    },
    unit: row.unit,
    quantity: formatQuantity(row.quantity),
  };
}

@ApiTags('stock')
@ApiBearerAuth()
@Controller('stock')
export class StockController {
  constructor(private readonly stock: StockService) {}

  /** Saldo atual por lote e local (somente posições com saldo). */
  @Get()
  @ApiPageResponse(StockRow)
  position(@Query() query: StockQueryDto): Promise<Page<StockRow>> {
    return this.stock.position(query);
  }
}
