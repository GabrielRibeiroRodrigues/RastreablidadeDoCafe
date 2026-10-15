import { Injectable } from '@nestjs/common';
import { dateCell, dateTimeCell, decimalCell, toCsv, type CsvValue } from '../../common/csv/csv.js';
import type {
  LocationType,
  LotStatus,
  MovementType,
  Prisma,
  ProductionStage,
  ProductType,
  Unit,
} from '../../generated/prisma/client.js';
import { TenantPrismaService } from '../../tenancy/tenant-prisma.service.js';
import { fromDateOnly } from '../inventory/inventory.mappers.js';
import { Quantity } from '../inventory/quantity.js';
import { StockService } from '../inventory/stock.controller.js';
import type {
  MovementsReportQueryDto,
  ProductionReportQueryDto,
  ShipmentsReportQueryDto,
  StockReportQueryDto,
} from './reports.dto.js';

/**
 * Teto de linhas por relatório. Mantém o arquivo abaixo do limite de resposta da Lambda (6 MB)
 * e a memória sob controle; acima disso, o cliente filtra por período.
 */
export const REPORT_MAX_ROWS = 20_000;

export interface CsvReport {
  fileName: string;
  content: string;
  rows: number;
  truncated: boolean;
}

/** Rótulos em português para quem abre o arquivo no Excel. */
const UNIT: Record<Unit, string> = { KG: 'kg', BAG_60KG: 'saca 60 kg', UNIT: 'un' };
const LOT_STATUS: Record<LotStatus, string> = {
  AVAILABLE: 'Disponível',
  QUARANTINE: 'Quarentena',
  BLOCKED: 'Bloqueado',
  CONSUMED: 'Consumido',
};
const PRODUCT_TYPE: Record<ProductType, string> = {
  GREEN: 'Café verde',
  ROASTED: 'Café torrado',
  BLEND: 'Blend',
  PACKAGING: 'Embalagem',
};
const LOCATION_TYPE: Record<LocationType, string> = {
  WAREHOUSE: 'Armazém',
  SILO: 'Silo',
  ROASTERY: 'Torrefação',
  QUARANTINE: 'Quarentena',
  SHIPPING: 'Expedição',
};
const MOVEMENT_TYPE: Record<MovementType, string> = {
  RECEIPT: 'Entrada',
  ISSUE: 'Saída',
  TRANSFER: 'Transferência',
  ADJUSTMENT: 'Ajuste',
  CONSUMPTION: 'Consumo',
  PRODUCTION: 'Produção',
  REVERSAL: 'Estorno',
};
const STAGE: Record<ProductionStage, string> = {
  PROCESSING: 'Beneficiamento',
  ROASTING: 'Torra',
  BLENDING: 'Blend',
  PACKAGING: 'Embalagem',
};

const qty = (value: Prisma.Decimal | string | null) =>
  value === null ? null : decimalCell(new Quantity(value));

/** Período `from` (inclusive) / `to` (exclusive). */
function period(from?: string, to?: string) {
  if (!from && !to) return undefined;
  return { ...(from && { gte: new Date(from) }), ...(to && { lt: new Date(to) }) };
}

/** Sufixo do nome do arquivo: data de hoje em São Paulo ("2026-10-15"). */
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

/** CPF/CNPJ com pontuação: além de legível, impede o Excel de tratá-lo como número. */
function formatDocument(document: string | null): string | null {
  if (document?.length === 11) {
    return document.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  }
  if (document?.length === 14) {
    return document.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  }
  return document;
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly db: TenantPrismaService,
    private readonly stock: StockService,
  ) {}

  async stockReport(query: StockReportQueryDto): Promise<CsvReport> {
    const page = await this.stock.position({ ...query, page: 1, pageSize: REPORT_MAX_ROWS });
    const header = [
      'Produto (SKU)',
      'Produto',
      'Tipo',
      'Lote',
      'Situação do lote',
      'Validade',
      'Local (código)',
      'Local',
      'Tipo de local',
      'Quantidade',
      'Unidade',
    ];
    const rows = page.data.map((row): CsvValue[] => [
      row.product.sku,
      row.product.name,
      PRODUCT_TYPE[row.product.type],
      row.lot.code,
      LOT_STATUS[row.lot.status],
      row.expiresAt ? dateCell(fromDateOnly(row.expiresAt)) : null,
      row.location.code,
      row.location.name,
      LOCATION_TYPE[row.location.type],
      qty(row.quantity),
      UNIT[row.unit],
    ]);
    return report('estoque', header, rows, page.meta.total > REPORT_MAX_ROWS);
  }

  async movementsReport(query: MovementsReportQueryDto): Promise<CsvReport> {
    const occurredAt = period(query.from, query.to);
    const movements = await this.db.client.stockMovement.findMany({
      where: {
        ...(query.type && { type: query.type }),
        ...(query.lotId && { lotId: query.lotId }),
        ...(occurredAt && { occurredAt }),
      },
      select: {
        type: true,
        quantity: true,
        occurredAt: true,
        documentRef: true,
        reason: true,
        reversalOfId: true,
        lot: {
          select: { code: true, unit: true, product: { select: { sku: true, name: true } } },
        },
        fromLocation: { select: { code: true } },
        toLocation: { select: { code: true } },
        user: { select: { name: true } },
      },
      orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
      take: REPORT_MAX_ROWS + 1,
    });

    const header = [
      'Data',
      'Tipo',
      'Lote',
      'Produto (SKU)',
      'Produto',
      'Origem',
      'Destino',
      'Quantidade',
      'Unidade',
      'Documento',
      'Motivo',
      'Estorno de outra movimentação',
      'Usuário',
    ];
    const rows = movements
      .slice(0, REPORT_MAX_ROWS)
      .map((m): CsvValue[] => [
        dateTimeCell(m.occurredAt),
        MOVEMENT_TYPE[m.type],
        m.lot.code,
        m.lot.product.sku,
        m.lot.product.name,
        m.fromLocation?.code,
        m.toLocation?.code,
        qty(m.quantity),
        UNIT[m.lot.unit],
        m.documentRef,
        m.reason,
        m.reversalOfId ? 'Sim' : 'Não',
        m.user.name,
      ]);
    return report('movimentacoes', header, rows, movements.length > REPORT_MAX_ROWS);
  }

  async productionReport(query: ProductionReportQueryDto): Promise<CsvReport> {
    const performedAt = period(query.from, query.to);
    const orders = await this.db.client.productionOrder.findMany({
      where: {
        ...(query.stage && { stage: query.stage }),
        ...(performedAt && { performedAt }),
      },
      select: {
        number: true,
        stage: true,
        performedAt: true,
        inputMassKg: true,
        outputMassKg: true,
        yieldPercent: true,
        lossKg: true,
        outputLot: {
          select: {
            code: true,
            unit: true,
            initialQuantity: true,
            product: { select: { sku: true, name: true } },
          },
        },
        origins: {
          select: { quantity: true, parent: { select: { code: true, unit: true } } },
          orderBy: { createdAt: 'asc' },
        },
        user: { select: { name: true } },
      },
      orderBy: [{ performedAt: 'asc' }, { id: 'asc' }],
      take: REPORT_MAX_ROWS + 1,
    });

    const header = [
      'Ordem',
      'Etapa',
      'Data',
      'Lote gerado',
      'Produto gerado (SKU)',
      'Produto gerado',
      'Quantidade gerada',
      'Unidade',
      'Insumos',
      'Entrada (kg)',
      'Saída (kg)',
      'Rendimento (%)',
      'Perda (kg)',
      'Usuário',
    ];
    const rows = orders
      .slice(0, REPORT_MAX_ROWS)
      .map((o): CsvValue[] => [
        o.number,
        STAGE[o.stage],
        dateTimeCell(o.performedAt),
        o.outputLot.code,
        o.outputLot.product.sku,
        o.outputLot.product.name,
        qty(o.outputLot.initialQuantity),
        UNIT[o.outputLot.unit],
        o.origins
          .map(
            (origin) =>
              `${origin.parent.code} (${new Quantity(origin.quantity).toFixed(3).replace('.', ',')} ${UNIT[origin.parent.unit]})`,
          )
          .join(' | '),
        qty(o.inputMassKg),
        qty(o.outputMassKg),
        o.yieldPercent === null ? null : decimalCell(o.yieldPercent, 2),
        qty(o.lossKg),
        o.user.name,
      ]);
    return report('producao', header, rows, orders.length > REPORT_MAX_ROWS);
  }

  /** Uma linha por item expedido (lote/local), com os dados da expedição repetidos. */
  async shipmentsReport(query: ShipmentsReportQueryDto): Promise<CsvReport> {
    const shippedAt = period(query.from, query.to);
    const items = await this.db.client.shipmentItem.findMany({
      where: {
        shipment: {
          ...(query.customerId && { customerId: query.customerId }),
          ...(shippedAt && { shippedAt }),
        },
      },
      select: {
        quantity: true,
        shipment: {
          select: {
            number: true,
            shippedAt: true,
            orderRef: true,
            customer: { select: { name: true, document: true, city: true, state: true } },
            user: { select: { name: true } },
          },
        },
        lot: {
          select: { code: true, unit: true, product: { select: { sku: true, name: true } } },
        },
        location: { select: { code: true } },
      },
      orderBy: [{ shipment: { shippedAt: 'asc' } }, { shipmentId: 'asc' }, { createdAt: 'asc' }],
      take: REPORT_MAX_ROWS + 1,
    });

    const header = [
      'Expedição',
      'Data',
      'Cliente',
      'CPF/CNPJ do cliente',
      'Cidade',
      'UF',
      'Pedido/NF',
      'Lote',
      'Produto (SKU)',
      'Produto',
      'Local de saída',
      'Quantidade',
      'Unidade',
      'Usuário',
    ];
    const rows = items
      .slice(0, REPORT_MAX_ROWS)
      .map((item): CsvValue[] => [
        item.shipment.number,
        dateTimeCell(item.shipment.shippedAt),
        item.shipment.customer.name,
        formatDocument(item.shipment.customer.document),
        item.shipment.customer.city,
        item.shipment.customer.state,
        item.shipment.orderRef,
        item.lot.code,
        item.lot.product.sku,
        item.lot.product.name,
        item.location.code,
        qty(item.quantity),
        UNIT[item.lot.unit],
        item.shipment.user.name,
      ]);
    return report('expedicoes', header, rows, items.length > REPORT_MAX_ROWS);
  }
}

function report(name: string, header: string[], rows: CsvValue[][], truncated: boolean): CsvReport {
  return {
    fileName: `${name}-${today()}.csv`,
    content: toCsv(header, rows),
    rows: rows.length,
    truncated,
  };
}
