import { Injectable } from '@nestjs/common';
import { Prisma, type ProductType, type Unit } from '../../generated/prisma/client.js';
import { TenantPrismaService } from '../../tenancy/tenant-prisma.service.js';
import { toDateOnly } from '../inventory/inventory.mappers.js';
import { formatQuantity } from '../inventory/quantity.js';
import { BUSINESS_TIME_ZONE } from '../../common/time/business-time.js';
import type {
  PerformancePeriod,
  PerformanceResponse,
  PeriodTotals,
  ProductTurnover,
} from './performance.dto.js';

const TOP_TURNOVER = 8;

interface TotalsRow {
  orders: number;
  input_kg: Prisma.Decimal | null;
  output_kg: Prisma.Decimal | null;
  loss_kg: Prisma.Decimal;
  shipments: number;
  customers: number;
}

interface BucketRow {
  start: Date;
  orders: number;
  input_kg: Prisma.Decimal | null;
  output_kg: Prisma.Decimal | null;
}

interface TurnoverRow {
  product_id: string;
  sku: string;
  name: string;
  type: ProductType;
  unit: Unit;
  outflow: Prisma.Decimal;
  balance: Prisma.Decimal;
}

const yieldOf = (input: Prisma.Decimal | null, output: Prisma.Decimal | null): number | null =>
  input && output && input.greaterThan(0)
    ? output.dividedBy(input).times(100).toDecimalPlaces(2).toNumber()
    : null;

/**
 * Desempenho por período (painel): produção e expedição comparadas com o período anterior de mesmo
 * tamanho, série de rendimento (semanal até 90 dias, mensal acima) e giro de estoque por produto.
 */
@Injectable()
export class PerformanceService {
  constructor(private readonly db: TenantPrismaService) {}

  async summary(days: PerformancePeriod): Promise<PerformanceResponse> {
    const bucket = days <= 90 ? 'week' : 'month';
    const [current, previous, series, turnover] = await Promise.all([
      this.totals(days, 0),
      this.totals(days, days),
      this.yieldSeries(days, bucket),
      this.turnover(days),
    ]);
    return {
      days,
      bucket,
      current,
      previous,
      yieldSeries: series.map((row) => ({
        start: toDateOnly(row.start) ?? '',
        orders: row.orders,
        outputKg: formatQuantity(row.output_kg ?? new Prisma.Decimal(0)),
        yieldPercent: yieldOf(row.input_kg, row.output_kg),
      })),
      turnover: turnover.map((row): ProductTurnover => ({
        productId: row.product_id,
        sku: row.sku,
        name: row.name,
        type: row.type,
        unit: row.unit,
        outflow: formatQuantity(row.outflow),
        balance: formatQuantity(row.balance),
        coverageDays: row.outflow.greaterThan(0)
          ? row.balance.dividedBy(row.outflow.dividedBy(days)).toDecimalPlaces(0).toNumber()
          : null,
      })),
    };
  }

  /** Totais da janela [now - offset - days, now - offset). */
  private async totals(days: number, offset: number): Promise<PeriodTotals> {
    const [row] = await this.db.sql<TotalsRow[]>((companyId) => {
      const from = Prisma.sql`now() - ${offset + days} * interval '1 day'`;
      const to = Prisma.sql`now() - ${offset} * interval '1 day'`;
      return Prisma.sql`
        SELECT po.orders, po.input_kg, po.output_kg, po.loss_kg, s.shipments, s.customers
        FROM (
          SELECT COUNT(*)::int AS orders,
                 SUM(input_mass_kg) FILTER (WHERE output_mass_kg IS NOT NULL) AS input_kg,
                 SUM(output_mass_kg) AS output_kg,
                 COALESCE(SUM(loss_kg), 0) AS loss_kg
          FROM production_orders
          WHERE company_id = ${companyId}::uuid
            AND cancelled_at IS NULL AND performed_at >= ${from} AND performed_at < ${to}
        ) po,
        (
          SELECT COUNT(*)::int AS shipments, COUNT(DISTINCT customer_id)::int AS customers
          FROM shipments
          WHERE company_id = ${companyId}::uuid
            AND cancelled_at IS NULL AND shipped_at >= ${from} AND shipped_at < ${to}
        ) s`;
    });
    if (!row) throw new Error('Performance totals query returned no rows');
    return {
      production: {
        orders: row.orders,
        inputKg: formatQuantity(row.input_kg ?? new Prisma.Decimal(0)),
        outputKg: formatQuantity(row.output_kg ?? new Prisma.Decimal(0)),
        yieldPercent: yieldOf(row.input_kg, row.output_kg),
        lossKg: formatQuantity(row.loss_kg),
      },
      shipments: { count: row.shipments, customers: row.customers },
    };
  }

  /** Rendimento por semana ou mês (no fuso da operação), só baldes com produção. */
  private yieldSeries(days: number, bucket: 'week' | 'month'): Promise<BucketRow[]> {
    return this.db.sql<BucketRow[]>(
      (companyId) => Prisma.sql`
        SELECT date_trunc(${bucket}, performed_at AT TIME ZONE ${BUSINESS_TIME_ZONE}::text) AS start,
               COUNT(*)::int AS orders,
               SUM(input_mass_kg) FILTER (WHERE output_mass_kg IS NOT NULL) AS input_kg,
               SUM(output_mass_kg) AS output_kg
        FROM production_orders
        WHERE company_id = ${companyId}::uuid
          AND cancelled_at IS NULL
          AND performed_at >= now() - ${days} * interval '1 day'
        GROUP BY 1
        ORDER BY 1`,
    );
  }

  /**
   * Saída por produto no período (expedição = ISSUE, produção = CONSUMPTION), menos os estornos
   * dessas saídas, e o saldo atual — para o giro e os dias de cobertura.
   */
  private turnover(days: number): Promise<TurnoverRow[]> {
    return this.db.sql<TurnoverRow[]>(
      (companyId) => Prisma.sql`
        WITH outflow AS (
          SELECT m.lot_id,
                 SUM(CASE WHEN m.type IN ('ISSUE', 'CONSUMPTION') THEN m.quantity
                          ELSE -m.quantity END) AS qty
          FROM stock_movements m
          LEFT JOIN stock_movements o
            ON o.id = m.reversal_of_id AND o.company_id = ${companyId}::uuid
          WHERE m.company_id = ${companyId}::uuid
            AND m.occurred_at >= now() - ${days} * interval '1 day'
            AND (m.type IN ('ISSUE', 'CONSUMPTION')
                 OR (m.type = 'REVERSAL' AND o.type IN ('ISSUE', 'CONSUMPTION')))
          GROUP BY m.lot_id
        ),
        balance AS (
          SELECT lot_id,
                 SUM(CASE WHEN to_location_id IS NOT NULL THEN quantity ELSE 0 END)
                   - SUM(CASE WHEN from_location_id IS NOT NULL THEN quantity ELSE 0 END) AS qty
          FROM stock_movements
          WHERE company_id = ${companyId}::uuid
          GROUP BY lot_id
        )
        SELECT p.id AS product_id, p.sku, p.name, p.type, p.unit,
               COALESCE(SUM(o.qty), 0) AS outflow,
               COALESCE(SUM(b.qty), 0) AS balance
        FROM lots l
        JOIN products p ON p.id = l.product_id AND p.company_id = ${companyId}::uuid
        LEFT JOIN outflow o ON o.lot_id = l.id
        LEFT JOIN balance b ON b.lot_id = l.id
        WHERE l.company_id = ${companyId}::uuid
        GROUP BY p.id
        HAVING COALESCE(SUM(o.qty), 0) > 0
        ORDER BY outflow DESC, p.name ASC
        LIMIT ${TOP_TURNOVER}`,
    );
  }
}
