import type { ProductionStage } from '@/features/production/api';
import { fromMilli, toMilli, type UnitCode } from '@/lib/quantity';
import type { BackwardTrace, ForwardTrace, TraceNode, TraceShipment, TraceSupplier } from './api';

/**
 * Modelo visual da árvore de rastreabilidade: colunas por profundidade (da esquerda para a
 * direita) e ligações sempre da coluna da esquerda para a da direita.
 *
 * - Para trás: fazendas → … → insumos diretos → este lote.
 * - Para frente: este lote → derivados diretos → … → expedições (clientes).
 */

export type TreeItem =
  | { kind: 'lot'; id: string; node: TraceNode; isRoot: boolean }
  | { kind: 'farm'; id: string; supplier: TraceSupplier }
  | { kind: 'shipment'; id: string; shipment: TraceShipment };

export interface TreeColumn {
  key: string;
  title: string;
  items: TreeItem[];
}

export interface TreeLink {
  id: string;
  from: string;
  to: string;
  kind: 'production' | 'receipt' | 'shipment';
  quantity: string;
  unit: UnitCode;
  /** Ordem de produção (só em `production`). */
  order?: { number: string; stage: ProductionStage };
  /** A ligação toca o lote consultado (destacada). */
  touchesRoot: boolean;
}

export interface TreeModel {
  columns: TreeColumn[];
  links: TreeLink[];
}

const lotItem = (node: TraceNode, rootId: string): TreeItem => ({
  kind: 'lot',
  id: node.id,
  node,
  isRoot: node.id === rootId,
});

const farmId = (supplierId: string) => `farm:${supplierId}`;
const shipmentItemId = (s: TraceShipment) => `shipment:${s.shipmentId}:${s.lotId}`;

function depthTitle(depth: number, direction: 'backward' | 'forward'): string {
  if (depth === 0) return 'Este lote';
  if (depth === 1) return direction === 'backward' ? 'Insumos diretos' : 'Derivados diretos';
  return direction === 'backward' ? `${depth} etapas antes` : `${depth} etapas depois`;
}

function groupByDepth(nodes: TraceNode[]): Map<number, TraceNode[]> {
  const byDepth = new Map<number, TraceNode[]>();
  for (const node of nodes) {
    const list = byDepth.get(node.depth) ?? [];
    list.push(node);
    byDepth.set(node.depth, list);
  }
  return byDepth;
}

/**
 * Ordena cada coluna pela posição média dos vizinhos já posicionados (heurística do baricentro),
 * partindo da coluna do lote consultado. Reduz cruzamentos sem um algoritmo de grafo completo.
 */
function orderColumns(columns: TreeColumn[], links: TreeLink[], rootIndex: number): void {
  const position = new Map<string, number>();
  const neighbors = new Map<string, string[]>();
  for (const link of links) {
    neighbors.set(link.from, [...(neighbors.get(link.from) ?? []), link.to]);
    neighbors.set(link.to, [...(neighbors.get(link.to) ?? []), link.from]);
  }
  const label = (item: TreeItem) =>
    item.kind === 'lot'
      ? item.node.code
      : item.kind === 'farm'
        ? (item.supplier.farmName ?? item.supplier.name)
        : item.shipment.number;

  const place = (column: TreeColumn) => {
    const score = (item: TreeItem) => {
      const placed = (neighbors.get(item.id) ?? []).flatMap((id) => {
        const p = position.get(id);
        return p === undefined ? [] : [p];
      });
      return placed.length ? placed.reduce((a, b) => a + b, 0) / placed.length : Infinity;
    };
    const scored = column.items.map((item) => ({ item, score: score(item) }));
    scored.sort((a, b) => a.score - b.score || label(a.item).localeCompare(label(b.item)));
    column.items = scored.map(({ item }) => item);
    column.items.forEach((item, index) => {
      // Posição relativa (0..1), comparável entre colunas de tamanhos diferentes.
      position.set(item.id, column.items.length === 1 ? 0.5 : index / (column.items.length - 1));
    });
  };

  const order = [
    rootIndex,
    ...columns.map((_, i) => rootIndex - 1 - i).filter((i) => i >= 0),
    ...columns.map((_, i) => rootIndex + 1 + i).filter((i) => i < columns.length),
  ];
  for (const index of order) {
    const column = columns[index];
    if (column) place(column);
  }
}

function productionLinks(trace: BackwardTrace | ForwardTrace): TreeLink[] {
  const nodes = new Map(trace.nodes.map((node) => [node.id, node]));
  return trace.edges.map((edge) => ({
    id: `${edge.parentLotId}>${edge.childLotId}:${edge.productionOrder.id}`,
    from: edge.parentLotId,
    to: edge.childLotId,
    kind: 'production',
    quantity: edge.quantity,
    unit: nodes.get(edge.parentLotId)?.unit ?? 'KG',
    order: { number: edge.productionOrder.number, stage: edge.productionOrder.stage },
    touchesRoot: edge.parentLotId === trace.rootLotId || edge.childLotId === trace.rootLotId,
  }));
}

export function backwardModel(trace: BackwardTrace): TreeModel {
  const byDepth = groupByDepth(trace.nodes);
  const maxDepth = Math.max(0, ...byDepth.keys());
  const links = productionLinks(trace);

  // Fazendas: uma por fornecedor, ligada aos lotes recebidos dela.
  const farms = new Map<string, TraceSupplier>();
  for (const node of trace.nodes) {
    if (!node.supplier) continue;
    farms.set(node.supplier.id, node.supplier);
    links.push({
      id: `${farmId(node.supplier.id)}>${node.id}`,
      from: farmId(node.supplier.id),
      to: node.id,
      kind: 'receipt',
      quantity: node.initialQuantity,
      unit: node.unit,
      touchesRoot: node.id === trace.rootLotId,
    });
  }

  const columns: TreeColumn[] = [];
  if (farms.size > 0) {
    columns.push({
      key: 'farms',
      title: 'Origem (fazendas)',
      items: [...farms.values()].map((supplier) => ({
        kind: 'farm',
        id: farmId(supplier.id),
        supplier,
      })),
    });
  }
  for (let depth = maxDepth; depth >= 0; depth -= 1) {
    columns.push({
      key: `depth-${depth}`,
      title: depthTitle(depth, 'backward'),
      items: (byDepth.get(depth) ?? []).map((node) => lotItem(node, trace.rootLotId)),
    });
  }

  orderColumns(columns, links, columns.length - 1);
  return { columns, links };
}

export function forwardModel(trace: ForwardTrace): TreeModel {
  const byDepth = groupByDepth(trace.nodes);
  const maxDepth = Math.max(0, ...byDepth.keys());
  const links = productionLinks(trace);

  const columns: TreeColumn[] = [];
  for (let depth = 0; depth <= maxDepth; depth += 1) {
    columns.push({
      key: `depth-${depth}`,
      title: depthTitle(depth, 'forward'),
      items: (byDepth.get(depth) ?? []).map((node) => lotItem(node, trace.rootLotId)),
    });
  }

  // Um cartão por (expedição, lote): itens do mesmo lote em locais diferentes são somados.
  const shipments = new Map<string, TraceShipment>();
  for (const shipment of trace.shipments) {
    const id = shipmentItemId(shipment);
    const previous = shipments.get(id);
    shipments.set(
      id,
      previous
        ? {
            ...previous,
            quantity: fromMilli(toMilli(previous.quantity) + toMilli(shipment.quantity)),
          }
        : shipment,
    );
  }

  if (shipments.size > 0) {
    columns.push({
      key: 'customers',
      title: 'Clientes (expedições)',
      items: [...shipments.entries()].map(([id, shipment]) => ({
        kind: 'shipment',
        id,
        shipment,
      })),
    });
    for (const shipment of shipments.values()) {
      links.push({
        id: `${shipment.lotId}>${shipmentItemId(shipment)}`,
        from: shipment.lotId,
        to: shipmentItemId(shipment),
        kind: 'shipment',
        quantity: shipment.quantity,
        unit: shipment.unit,
        touchesRoot: shipment.lotId === trace.rootLotId,
      });
    }
  }

  orderColumns(columns, links, 0);
  return { columns, links };
}
