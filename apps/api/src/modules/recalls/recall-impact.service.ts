import { Injectable } from '@nestjs/common';
import { Prisma, type Unit } from '../../generated/prisma/client.js';
import { TenantPrismaService } from '../../tenancy/tenant-prisma.service.js';
import { formatQuantity, ZERO, type Quantity } from '../inventory/quantity.js';
import type { TraceShipment } from '../trace/trace.dto.js';
import { TraceService } from '../trace/trace.service.js';
import type {
  AffectedCustomer,
  AffectedLot,
  RecallSimulationResponse,
  UnitQuantity,
} from './recalls.dto.js';

/**
 * Impacto de um recall a partir do lote de origem, só com leituras:
 *
 * - rastreio **para frente** (`TraceService.forward`): o próprio lote, todos os derivados
 *   (torrados, blends, embalados) e as expedições a clientes;
 * - rastreio **para trás** (`TraceService.backward`): fazendas de origem, para o relatório;
 * - saldo atual de cada lote afetado, a partir do razão.
 *
 * Os lotes "irmãos" (outros insumos de um blend) não entram: o problema está no lote de origem e
 * no que foi feito com ele, não nos outros cafés misturados.
 */
@Injectable()
export class RecallImpactService {
  constructor(
    private readonly db: TenantPrismaService,
    private readonly trace: TraceService,
  ) {}

  async simulate(lotId: string): Promise<RecallSimulationResponse> {
    const [forward, backward] = await Promise.all([
      this.trace.forward(lotId),
      this.trace.backward(lotId),
    ]);
    const balances = await this.balances(forward.nodes.map((node) => node.id));

    const lots: AffectedLot[] = forward.nodes.map((node) => ({
      id: node.id,
      code: node.code,
      status: node.status,
      product: node.product,
      unit: node.unit,
      balance: formatQuantity(balances.get(node.id) ?? ZERO),
      depth: node.depth,
    }));
    const originLot = lots.find((lot) => lot.id === lotId) ?? lots[0];
    if (!originLot) throw new Error(`Forward trace did not include the origin lot ${lotId}`);

    // Itens estornados (devolução, cliente errado) não chegaram ao cliente: ficam na lista de
    // expedições para conferência, mas fora dos clientes a contatar e do total expedido.
    const delivered = forward.shipments.filter((shipment) => !shipment.reversed);
    const customers = aggregateCustomers(delivered);
    const withStock = lots.filter((lot) => !new Prisma.Decimal(lot.balance).isZero());

    return {
      originLot,
      origins: backward.origins,
      lots,
      shipments: forward.shipments,
      customers,
      totals: {
        lots: lots.length,
        lotsWithStock: withStock.length,
        shipments: new Set(delivered.map((s) => s.shipmentId)).size,
        customers: customers.length,
        stock: sumByUnit(withStock.map((lot) => ({ unit: lot.unit, quantity: lot.balance }))),
        shipped: sumByUnit(delivered),
      },
      truncated: forward.truncated,
    };
  }

  /** Saldo total de cada lote (entradas − saídas no razão). */
  private async balances(lotIds: string[]): Promise<Map<string, Quantity>> {
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

/** Um registro por cliente: expedições distintas e quantidade recebida por unidade. */
function aggregateCustomers(shipments: TraceShipment[]): AffectedCustomer[] {
  const byCustomer = new Map<string, { shipments: TraceShipment[] }>();
  for (const shipment of shipments) {
    const entry = byCustomer.get(shipment.customer.id) ?? { shipments: [] };
    entry.shipments.push(shipment);
    byCustomer.set(shipment.customer.id, entry);
  }
  return [...byCustomer.values()]
    .map(({ shipments: items }) => {
      const numbers = [...new Set(items.map((item) => item.number))].sort();
      return {
        customer: items[0]!.customer,
        shipmentsCount: numbers.length,
        shipmentNumbers: numbers,
        quantities: sumByUnit(items),
      };
    })
    .sort((a, b) => a.customer.name.localeCompare(b.customer.name));
}

export function sumByUnit(items: Array<{ unit: Unit; quantity: string }>): UnitQuantity[] {
  const totals = new Map<Unit, Quantity>();
  for (const item of items) {
    totals.set(item.unit, (totals.get(item.unit) ?? ZERO).plus(item.quantity));
  }
  return [...totals].map(([unit, quantity]) => ({ unit, quantity: formatQuantity(quantity) }));
}
