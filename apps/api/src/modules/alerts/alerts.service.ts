import { countOf } from '../../common/text/plural.js';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.js';
import {
  Prisma,
  type LotStatus,
  type ProductType,
  type Unit,
} from '../../generated/prisma/client.js';
import { NOTIFIER, type Notifier } from '../../notifications/notifier.js';
import { TenantContext } from '../../tenancy/tenant-context.js';
import { TenantPrismaService } from '../../tenancy/tenant-prisma.service.js';
import { formatQuantity } from '../inventory/quantity.js';
import type { ExpiringLotsResponse } from './alerts.dto.js';

/** Teto de linhas devolvidas (alerta, não relatório). */
const MAX_ALERT_ROWS = 500;

interface ExpiringRow {
  id: string;
  code: string;
  status: LotStatus;
  unit: Unit;
  expires_at: string;
  days_left: number;
  balance: Prisma.Decimal;
  product_id: string;
  sku: string;
  product_name: string;
  product_type: ProductType;
  reference_date: string;
}

@Injectable()
export class AlertsService {
  private readonly defaultDays: number;

  constructor(
    private readonly db: TenantPrismaService,
    private readonly tenant: TenantContext,
    @Inject(NOTIFIER) private readonly notifier: Notifier,
    config: ConfigService<Env, true>,
  ) {
    this.defaultDays = config.get('ALERT_EXPIRY_DAYS', { infer: true });
  }

  /**
   * Lotes **com saldo** que vencem nos próximos `days` dias, incluindo os já vencidos, do mais
   * urgente para o menos. O saldo vem do razão (subconsulta por lote candidato).
   */
  async expiring(days = this.defaultDays): Promise<ExpiringLotsResponse> {
    const rows = await this.db.sql<ExpiringRow[]>(
      (companyId) => Prisma.sql`
        SELECT l.id, l.code, l.status, l.unit,
               to_char(l.expires_at, 'YYYY-MM-DD') AS expires_at,
               (l.expires_at - CURRENT_DATE)::int AS days_left,
               b.balance,
               p.id AS product_id, p.sku, p.name AS product_name, p.type AS product_type,
               to_char(CURRENT_DATE, 'YYYY-MM-DD') AS reference_date
        FROM lots l
        JOIN products p ON p.company_id = l.company_id AND p.id = l.product_id
        CROSS JOIN LATERAL (
          SELECT COALESCE(SUM(CASE WHEN m.to_location_id IS NOT NULL THEN m.quantity ELSE 0 END), 0)
               - COALESCE(SUM(CASE WHEN m.from_location_id IS NOT NULL THEN m.quantity ELSE 0 END), 0)
                 AS balance
          FROM stock_movements m
          WHERE m.company_id = l.company_id AND m.lot_id = l.id
        ) b
        WHERE l.company_id = ${companyId}::uuid
          AND l.expires_at IS NOT NULL
          AND l.expires_at <= CURRENT_DATE + ${days}::int
          AND b.balance > 0
        ORDER BY l.expires_at, l.code
        LIMIT ${MAX_ALERT_ROWS}`,
    );

    const data = rows.map((row) => ({
      id: row.id,
      code: row.code,
      status: row.status,
      product: { id: row.product_id, sku: row.sku, name: row.product_name, type: row.product_type },
      balance: formatQuantity(row.balance),
      unit: row.unit,
      expiresAt: row.expires_at,
      daysToExpiry: Number(row.days_left),
      expired: Number(row.days_left) < 0,
    }));
    return {
      days,
      referenceDate: rows[0]?.reference_date ?? new Date().toISOString().slice(0, 10),
      expiredCount: data.filter((lot) => lot.expired).length,
      data,
    };
  }

  /** Job diário: calcula a lista da empresa do contexto e avisa (se houver algo a avisar). */
  async notifyExpiring(days = this.defaultDays): Promise<{ lots: number; expired: number }> {
    const companyId = this.tenant.requireCompanyId();
    const result = await this.expiring(days);
    if (result.data.length === 0) return { lots: 0, expired: 0 };

    const lines = result.data.map(
      (lot) =>
        `- ${lot.code} (${lot.product.name}): ${lot.balance} ${lot.unit}, ` +
        (lot.expired
          ? `VENCIDO há ${countOf(-lot.daysToExpiry, 'dia', 'dias')} (${lot.expiresAt})`
          : `vence em ${countOf(lot.daysToExpiry, 'dia', 'dias')} (${lot.expiresAt})`),
    );
    await this.notifier.notify({
      event: 'lots.expiring',
      companyId,
      subject: `TraceFlow: ${countOf(result.data.length, 'lote vencendo', 'lotes vencendo')} em ${days} dias`,
      body:
        `Lotes com saldo vencidos ou vencendo nos próximos ${days} dias ` +
        `(referência ${result.referenceDate}):\n\n${lines.join('\n')}`,
      data: {
        days,
        referenceDate: result.referenceDate,
        lots: result.data.map((lot) => ({
          id: lot.id,
          code: lot.code,
          expiresAt: lot.expiresAt,
          balance: lot.balance,
          unit: lot.unit,
        })),
      },
    });
    return { lots: result.data.length, expired: result.expiredCount };
  }
}
