import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { TenantPrismaService } from '../../tenancy/tenant-prisma.service.js';
import { formatQuantity } from '../inventory/quantity.js';
import type {
  BackwardTraceResponse,
  ForwardTraceResponse,
  TraceCustomer,
  TraceEdge,
  TraceNode,
} from './trace.dto.js';

/** Profundidade máxima percorrida (verde → beneficiado → torrado → blend → embalado ≈ 4–5). */
export const MAX_TRACE_DEPTH = 20;

type Direction = 'backward' | 'forward';

interface EdgeRow {
  parent_lot_id: string;
  child_lot_id: string;
  quantity: Prisma.Decimal;
  production_order_id: string;
  depth: number;
}

const SUPPLIER_SELECT = {
  select: {
    id: true,
    name: true,
    type: true,
    farmName: true,
    region: true,
    city: true,
    state: true,
    altitudeMeters: true,
  },
} as const;

/**
 * Rastreabilidade sobre o grafo de genealogia (`lot_origins`) com `WITH RECURSIVE`.
 *
 * - **Para trás**: sobe de filho para pai até os lotes recebidos de fornecedores.
 * - **Para frente**: desce de pai para filho e junta as expedições de todos os lotes alcançados.
 *
 * O caminho percorrido (`path`) impede ciclos, e a profundidade é limitada; busca-se um nível a
 * mais que o limite só para saber se o grafo foi cortado (`truncated`).
 */
@Injectable()
export class TraceService {
  constructor(private readonly db: TenantPrismaService) {}

  async backward(lotId: string): Promise<BackwardTraceResponse> {
    const graph = await this.graph(lotId, 'backward');
    const origins = uniqueBy(
      graph.nodes.flatMap((node) => (node.supplier ? [node.supplier] : [])),
      (supplier) => supplier.id,
    );
    return { ...graph, origins };
  }

  async forward(lotId: string): Promise<ForwardTraceResponse> {
    const graph = await this.graph(lotId, 'forward');
    const items = await this.db.client.shipmentItem.findMany({
      where: { lotId: { in: graph.nodes.map((node) => node.id) } },
      include: {
        lot: { select: { code: true, unit: true } },
        shipment: {
          select: {
            id: true,
            number: true,
            shippedAt: true,
            orderRef: true,
            customer: { select: { id: true, name: true, city: true, state: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const shipments = items.map((item) => ({
      shipmentId: item.shipment.id,
      number: item.shipment.number,
      shippedAt: item.shipment.shippedAt,
      orderRef: item.shipment.orderRef,
      customer: item.shipment.customer,
      lotId: item.lotId,
      lotCode: item.lot.code,
      quantity: formatQuantity(item.quantity),
      unit: item.lot.unit,
    }));
    const customers: TraceCustomer[] = uniqueBy(
      shipments.map((shipment) => shipment.customer),
      (customer) => customer.id,
    );
    return { ...graph, shipments, customers };
  }

  private async graph(rootLotId: string, direction: Direction) {
    // 404 se o lote não existir ou for de outra empresa.
    await this.db.client.lot.findUniqueOrThrow({ where: { id: rootLotId }, select: { id: true } });

    const rows = await this.edges(rootLotId, direction);
    const truncated = rows.some((row) => row.depth > MAX_TRACE_DEPTH);
    const edgeRows = rows.filter((row) => row.depth <= MAX_TRACE_DEPTH);

    // Profundidade de cada lote = menor distância até a raiz.
    const depthById = new Map<string, number>([[rootLotId, 0]]);
    for (const row of edgeRows) {
      const reached = direction === 'backward' ? row.parent_lot_id : row.child_lot_id;
      const current = depthById.get(reached);
      if (current === undefined || row.depth < current) depthById.set(reached, row.depth);
    }

    const [lots, orders] = await Promise.all([
      this.db.client.lot.findMany({
        where: { id: { in: [...depthById.keys()] } },
        include: {
          product: { select: { id: true, sku: true, name: true, type: true } },
          supplier: SUPPLIER_SELECT,
        },
      }),
      this.db.client.productionOrder.findMany({
        where: { id: { in: [...new Set(edgeRows.map((row) => row.production_order_id))] } },
        select: { id: true, number: true, stage: true, performedAt: true },
      }),
    ]);
    const ordersById = new Map(orders.map((order) => [order.id, order]));

    const nodes: TraceNode[] = lots
      .map((lot) => ({
        id: lot.id,
        code: lot.code,
        status: lot.status,
        product: lot.product,
        unit: lot.unit,
        initialQuantity: formatQuantity(lot.initialQuantity),
        harvest: lot.harvest,
        variety: lot.variety,
        receivedAt: lot.receivedAt,
        supplier: lot.supplier,
        depth: depthById.get(lot.id) ?? 0,
      }))
      .sort((a, b) => a.depth - b.depth || a.code.localeCompare(b.code));

    const edges: TraceEdge[] = edgeRows.flatMap((row) => {
      const order = ordersById.get(row.production_order_id);
      return order
        ? [
            {
              parentLotId: row.parent_lot_id,
              childLotId: row.child_lot_id,
              quantity: formatQuantity(row.quantity),
              productionOrder: order,
            },
          ]
        : [];
    });

    return { rootLotId, nodes, edges, truncated };
  }

  /** Arestas alcançáveis a partir da raiz, cada uma uma vez só, na menor profundidade. */
  private edges(rootLotId: string, direction: Direction): Promise<EdgeRow[]> {
    const limit = MAX_TRACE_DEPTH + 1;
    return this.db.sql<EdgeRow[]>((companyId) =>
      direction === 'backward'
        ? Prisma.sql`
            WITH RECURSIVE walk AS (
              SELECT o.parent_lot_id, o.child_lot_id, o.quantity, o.production_order_id,
                     1 AS depth, ARRAY[o.child_lot_id, o.parent_lot_id] AS path
              FROM lot_origins o
              WHERE o.company_id = ${companyId}::uuid AND o.child_lot_id = ${rootLotId}::uuid
              UNION ALL
              SELECT o.parent_lot_id, o.child_lot_id, o.quantity, o.production_order_id,
                     w.depth + 1, w.path || o.parent_lot_id
              FROM lot_origins o
              JOIN walk w ON o.child_lot_id = w.parent_lot_id
              WHERE o.company_id = ${companyId}::uuid
                AND w.depth < ${limit}
                AND o.parent_lot_id <> ALL (w.path)
            )
            SELECT DISTINCT ON (parent_lot_id, child_lot_id)
                   parent_lot_id, child_lot_id, quantity, production_order_id, depth
            FROM walk
            ORDER BY parent_lot_id, child_lot_id, depth`
        : Prisma.sql`
            WITH RECURSIVE walk AS (
              SELECT o.parent_lot_id, o.child_lot_id, o.quantity, o.production_order_id,
                     1 AS depth, ARRAY[o.parent_lot_id, o.child_lot_id] AS path
              FROM lot_origins o
              WHERE o.company_id = ${companyId}::uuid AND o.parent_lot_id = ${rootLotId}::uuid
              UNION ALL
              SELECT o.parent_lot_id, o.child_lot_id, o.quantity, o.production_order_id,
                     w.depth + 1, w.path || o.child_lot_id
              FROM lot_origins o
              JOIN walk w ON o.parent_lot_id = w.child_lot_id
              WHERE o.company_id = ${companyId}::uuid
                AND w.depth < ${limit}
                AND o.child_lot_id <> ALL (w.path)
            )
            SELECT DISTINCT ON (parent_lot_id, child_lot_id)
                   parent_lot_id, child_lot_id, quantity, production_order_id, depth
            FROM walk
            ORDER BY parent_lot_id, child_lot_id, depth`,
    );
  }
}

function uniqueBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Map<string, T>();
  for (const item of items) if (!seen.has(key(item))) seen.set(key(item), item);
  return [...seen.values()];
}
