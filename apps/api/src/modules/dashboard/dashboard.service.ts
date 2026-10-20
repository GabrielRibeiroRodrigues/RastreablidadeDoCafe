import { Injectable } from '@nestjs/common';
import { Prisma, type ProductType, type Unit } from '../../generated/prisma/client.js';
import { TenantPrismaService } from '../../tenancy/tenant-prisma.service.js';
import {
  MOVEMENT_INCLUDE,
  toDateOnly,
  toMovementResponse,
} from '../inventory/inventory.mappers.js';
import { formatQuantity } from '../inventory/quantity.js';
import type { DashboardResponse } from './dashboard.dto.js';

/** Fuso usado para "hoje" e para a janela de vencimento (a empresa não tem fuso próprio ainda). */
import { BUSINESS_TIME_ZONE } from '../../common/time/business-time.js';
export const EXPIRING_DAYS = 30;
const EXPIRING_LIMIT = 5;
const TOP_PRODUCTS = 8;
const RECENT_MOVEMENTS = 8;

interface StatsRow {
  available: number;
  quarantine: number;
  blocked: number;
  consumed: number;
  movements_today: number;
  orders: number;
  input_kg: Prisma.Decimal | null;
  output_kg: Prisma.Decimal | null;
  loss_kg: Prisma.Decimal;
  shipments: number;
  customers: number;
}

interface ExpiringRow {
  id: string;
  code: string;
  expires_at: Date;
  unit: Unit;
  product_id: string;
  sku: string;
  product_name: string;
  balance: Prisma.Decimal;
  total: number;
}

interface ProductStockRow {
  product_id: string;
  sku: string;
  name: string;
  type: ProductType;
  unit: Unit;
  quantity: Prisma.Decimal;
}

/** Saldo por lote a partir do razão: entradas (destino) − saídas (origem). */
const lotBalances = (companyId: string, lotFilter: Prisma.Sql = Prisma.empty) => Prisma.sql`
  SELECT lot_id,
         SUM(CASE WHEN to_location_id IS NOT NULL THEN quantity ELSE 0 END)
           - SUM(CASE WHEN from_location_id IS NOT NULL THEN quantity ELSE 0 END) AS qty
  FROM stock_movements
  WHERE company_id = ${companyId}::uuid ${lotFilter}
  GROUP BY lot_id`;

/**
 * Indicadores da tela inicial. Quatro consultas em paralelo (contadores num único SELECT,
 * vencimentos, estoque por produto e últimas movimentações), todas escopadas à empresa.
 */
@Injectable()
export class DashboardService {
  constructor(private readonly db: TenantPrismaService) {}

  async summary(): Promise<DashboardResponse> {
    const [[stats], expiring, stock, movements] = await Promise.all([
      this.stats(),
      this.expiring(),
      this.stockByProduct(),
      this.db.client.stockMovement.findMany({
        include: MOVEMENT_INCLUDE,
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        take: RECENT_MOVEMENTS,
      }),
    ]);
    if (!stats) throw new Error('Dashboard stats query returned no rows');

    const yieldPercent =
      stats.input_kg && stats.output_kg && stats.input_kg.greaterThan(0)
        ? stats.output_kg.dividedBy(stats.input_kg).times(100).toDecimalPlaces(2).toNumber()
        : null;

    return {
      lots: {
        available: stats.available,
        quarantine: stats.quarantine,
        blocked: stats.blocked,
        consumed: stats.consumed,
      },
      expiringSoon: {
        days: EXPIRING_DAYS,
        count: expiring[0]?.total ?? 0,
        items: expiring.map((row) => ({
          id: row.id,
          code: row.code,
          product: { id: row.product_id, sku: row.sku, name: row.product_name },
          expiresAt: toDateOnly(row.expires_at) ?? '',
          balance: formatQuantity(row.balance),
          unit: row.unit,
        })),
      },
      movementsToday: stats.movements_today,
      stockByProduct: stock.map((row) => ({
        productId: row.product_id,
        sku: row.sku,
        name: row.name,
        type: row.type,
        unit: row.unit,
        quantity: formatQuantity(row.quantity),
      })),
      production30d: {
        orders: stats.orders,
        avgYieldPercent: yieldPercent,
        lossKg: formatQuantity(stats.loss_kg),
      },
      shipments30d: { count: stats.shipments, customers: stats.customers },
      recentMovements: movements.map(toMovementResponse),
    };
  }

  private stats(): Promise<StatsRow[]> {
    return this.db.sql<StatsRow[]>(
      (companyId) => Prisma.sql`
        SELECT l.available, l.quarantine, l.blocked, l.consumed,
               m.movements_today,
               po.orders, po.input_kg, po.output_kg, po.loss_kg,
               s.shipments, s.customers
        FROM (
          SELECT COUNT(*) FILTER (WHERE status = 'AVAILABLE')::int AS available,
                 COUNT(*) FILTER (WHERE status = 'QUARANTINE')::int AS quarantine,
                 COUNT(*) FILTER (WHERE status = 'BLOCKED')::int AS blocked,
                 COUNT(*) FILTER (WHERE status = 'CONSUMED')::int AS consumed
          FROM lots WHERE company_id = ${companyId}::uuid
        ) l,
        (
          SELECT COUNT(*)::int AS movements_today
          FROM stock_movements
          WHERE company_id = ${companyId}::uuid
            AND occurred_at >= (date_trunc('day', now() AT TIME ZONE ${BUSINESS_TIME_ZONE}::text)
                                AT TIME ZONE ${BUSINESS_TIME_ZONE}::text)
        ) m,
        (
          SELECT COUNT(*)::int AS orders,
                 SUM(input_mass_kg) FILTER (WHERE output_mass_kg IS NOT NULL) AS input_kg,
                 SUM(output_mass_kg) AS output_kg,
                 COALESCE(SUM(loss_kg), 0) AS loss_kg
          FROM production_orders
          WHERE company_id = ${companyId}::uuid
            AND cancelled_at IS NULL AND performed_at >= now() - interval '30 days'
        ) po,
        (
          SELECT COUNT(*)::int AS shipments, COUNT(DISTINCT customer_id)::int AS customers
          FROM shipments
          WHERE company_id = ${companyId}::uuid
            AND cancelled_at IS NULL AND shipped_at >= now() - interval '30 days'
        ) s`,
    );
  }

  /** Lotes com saldo que vencem em até 30 dias (inclui os já vencidos), os mais próximos primeiro. */
  private expiring(): Promise<ExpiringRow[]> {
    return this.db.sql<ExpiringRow[]>((companyId) => {
      const limitDate = Prisma.sql`((now() AT TIME ZONE ${BUSINESS_TIME_ZONE}::text)::date + ${EXPIRING_DAYS}::int)`;
      const lotFilter = Prisma.sql`AND lot_id IN (
        SELECT id FROM lots
        WHERE company_id = ${companyId}::uuid AND expires_at IS NOT NULL
          AND expires_at <= ${limitDate})`;
      return Prisma.sql`
        WITH balances AS (${lotBalances(companyId, lotFilter)})
        SELECT l.id, l.code, l.expires_at, l.unit,
               p.id AS product_id, p.sku, p.name AS product_name,
               b.qty AS balance, COUNT(*) OVER ()::int AS total
        FROM balances b
        JOIN lots l ON l.id = b.lot_id AND l.company_id = ${companyId}::uuid
        JOIN products p ON p.id = l.product_id AND p.company_id = ${companyId}::uuid
        WHERE b.qty > 0
        ORDER BY l.expires_at ASC, l.code ASC
        LIMIT ${EXPIRING_LIMIT}`;
    });
  }

  /** Produtos com maior saldo (soma de todos os lotes e locais), na unidade do produto. */
  private stockByProduct(): Promise<ProductStockRow[]> {
    return this.db.sql<ProductStockRow[]>(
      (companyId) => Prisma.sql`
        WITH balances AS (${lotBalances(companyId)})
        SELECT p.id AS product_id, p.sku, p.name, p.type, p.unit, SUM(b.qty) AS quantity
        FROM balances b
        JOIN lots l ON l.id = b.lot_id AND l.company_id = ${companyId}::uuid
        JOIN products p ON p.id = l.product_id AND p.company_id = ${companyId}::uuid
        WHERE b.qty > 0
        GROUP BY p.id
        ORDER BY quantity DESC, p.name ASC
        LIMIT ${TOP_PRODUCTS}`,
    );
  }
}
