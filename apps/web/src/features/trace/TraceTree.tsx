import { MapPinIcon, MountainIcon, SproutIcon, TruckIcon } from 'lucide-react';
import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { Link } from 'react-router';
import { cn } from 'cn';
import { LotStatusBadge } from '@/features/inventory/components';
import { ProductTypeBadge } from '@/features/production/components';
import { STAGE_LABELS } from '@/features/production/labels';
import { formatDate, formatQuantity } from '@/lib/quantity';
import type { TraceDirection, TraceNode, TraceShipment, TraceSupplier } from './api';
import type { TreeItem, TreeLink, TreeModel } from './layout';

/** Largura mínima de cada coluna e espaço entre colunas (onde ficam os rótulos das ligações). */
const COLUMN_MIN_REM = 10.5;
const GAP_REM = 6.5;

interface Box {
  left: number;
  right: number;
  centerY: number;
}

interface DrawnLink {
  link: TreeLink;
  path: string;
  labelX: number;
  labelY: number;
}

function cubicPoint(t: number, p0: number, p1: number, p2: number, p3: number): number {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

/** Curva da borda direita da origem até a borda esquerda do destino; rótulo antes do destino. */
function draw(link: TreeLink, from: Box, to: Box, gapPx: number): DrawnLink {
  const x0 = from.right;
  const y0 = from.centerY;
  const x3 = to.left - 6; // espaço para a ponta da seta
  const y3 = to.centerY;
  const dx = Math.max(24, (x3 - x0) / 2);
  const c1x = x0 + dx;
  const c2x = x3 - dx;
  const span = Math.max(1, x3 - x0);
  // Ligações que pulam colunas: o rótulo fica no último vão, perto do destino.
  const tLabel = span > gapPx * 1.5 ? 1 - gapPx / 2 / span : 0.5;
  return {
    link,
    path: `M ${x0} ${y0} C ${c1x} ${y0}, ${c2x} ${y3}, ${x3} ${y3}`,
    labelX: cubicPoint(tLabel, x0, c1x, c2x, x3),
    labelY: cubicPoint(tLabel, y0, y0, y3, y3),
  };
}

function LinkLabel({ drawn }: { drawn: DrawnLink }) {
  const { link } = drawn;
  const quantity = formatQuantity(link.quantity, link.unit);
  return (
    <div
      className={cn(
        'pointer-events-none absolute z-10 max-w-[6rem] -translate-x-1/2 -translate-y-1/2 rounded-md border bg-background/95 px-1.5 py-0.5 text-center leading-tight shadow-xs',
        link.touchesRoot && 'border-primary/40',
      )}
      style={{ left: drawn.labelX, top: drawn.labelY }}
    >
      <div className="text-[11px] font-semibold tabular-nums">{quantity}</div>
      {link.order ? (
        <div className="text-[10px] text-muted-foreground">
          <span className="font-mono">{link.order.number}</span>
          <br />
          {STAGE_LABELS[link.order.stage]}
        </div>
      ) : (
        <div className="text-[10px] text-muted-foreground">
          {link.kind === 'receipt' ? 'Recebimento' : 'Expedido'}
        </div>
      )}
    </div>
  );
}

function LotCard({
  node,
  isRoot,
  direction,
}: {
  node: TraceNode;
  isRoot: boolean;
  direction: TraceDirection;
}) {
  const origin = [node.harvest && `Safra ${node.harvest}`, node.variety]
    .filter(Boolean)
    .join(' · ');
  const content = (
    <>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-[13px] font-semibold whitespace-nowrap">{node.code}</span>
        <span className="text-[11px] whitespace-nowrap text-muted-foreground tabular-nums">
          {formatQuantity(node.initialQuantity, node.unit)}
        </span>
      </div>
      <p
        className="mt-1 line-clamp-2 text-xs font-medium text-foreground/90"
        title={node.product.name}
      >
        {node.product.name}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <ProductTypeBadge type={node.product.type} />
        <LotStatusBadge status={node.status} />
      </div>
      {origin && <p className="mt-1.5 truncate text-[11px] text-muted-foreground">{origin}</p>}
    </>
  );
  const base = 'block w-full rounded-lg border bg-card p-3 text-left shadow-xs transition-colors';
  if (isRoot) {
    return (
      <div className={cn(base, 'border-primary bg-primary/[0.04] ring-2 ring-primary/30')}>
        <p className="mb-1 text-[10px] font-semibold tracking-wider text-primary uppercase">
          Lote consultado
        </p>
        {content}
      </div>
    );
  }
  return (
    <Link
      to={`/lotes/${node.id}/rastreabilidade${direction === 'forward' ? '?aba=destino' : ''}`}
      title={`Ver a rastreabilidade de ${node.code}`}
      className={cn(
        base,
        'hover:border-primary/50 hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
      )}
    >
      {content}
    </Link>
  );
}

function FarmCard({ supplier }: { supplier: TraceSupplier }) {
  const place = [supplier.city, supplier.state].filter(Boolean).join('/');
  return (
    <div className="rounded-lg border border-emerald-600/30 bg-emerald-600/[0.04] p-3 shadow-xs">
      <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
        <SproutIcon className="size-4 shrink-0" aria-hidden />
        <span className="truncate text-sm font-semibold">{supplier.farmName ?? supplier.name}</span>
      </div>
      {supplier.farmName && (
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{supplier.name}</p>
      )}
      <div className="mt-2 space-y-0.5 text-[11px] text-muted-foreground">
        {supplier.region && <p className="truncate">{supplier.region}</p>}
        {place && (
          <p className="flex items-center gap-1">
            <MapPinIcon className="size-3 shrink-0" aria-hidden />
            {place}
          </p>
        )}
        {supplier.altitudeMeters !== null && (
          <p className="flex items-center gap-1 tabular-nums">
            <MountainIcon className="size-3 shrink-0" aria-hidden />
            {supplier.altitudeMeters.toLocaleString('pt-BR')} m
          </p>
        )}
      </div>
    </div>
  );
}

function ShipmentCard({ shipment }: { shipment: TraceShipment }) {
  const place = [shipment.customer.city, shipment.customer.state].filter(Boolean).join('/');
  return (
    <Link
      to={`/expedicao/${shipment.shipmentId}`}
      title={`Ver a expedição ${shipment.number}`}
      className="block rounded-lg border border-sky-600/30 bg-sky-600/[0.04] p-3 shadow-xs transition-colors hover:border-sky-600/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <div className="flex items-center gap-1.5 text-sky-700 dark:text-sky-400">
        <TruckIcon className="size-4 shrink-0" aria-hidden />
        <span className="truncate text-sm font-semibold">{shipment.customer.name}</span>
      </div>
      {place && <p className="mt-0.5 text-xs text-muted-foreground">{place}</p>}
      <div className="mt-2 space-y-0.5 text-[11px] text-muted-foreground">
        <p>
          <span className="font-mono text-foreground/80">{shipment.number}</span> ·{' '}
          {formatDate(shipment.shippedAt.slice(0, 10))}
        </p>
        <p className="tabular-nums">
          {formatQuantity(shipment.quantity, shipment.unit)} de{' '}
          <span className="font-mono">{shipment.lotCode}</span>
        </p>
      </div>
    </Link>
  );
}

function ItemCard({ item, direction }: { item: TreeItem; direction: TraceDirection }) {
  if (item.kind === 'lot') {
    return <LotCard node={item.node} isRoot={item.isRoot} direction={direction} />;
  }
  if (item.kind === 'farm') return <FarmCard supplier={item.supplier} />;
  return <ShipmentCard shipment={item.shipment} />;
}

/**
 * Árvore visual: colunas por profundidade com cartões, ligados por curvas SVG com rótulos
 * (quantidade, OP e etapa). As posições são medidas no DOM, então o layout das colunas é
 * CSS comum (grid) e a árvore rola na horizontal quando não cabe.
 */
export function TraceTree({ model, direction }: { model: TreeModel; direction: TraceDirection }) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [drawn, setDrawn] = useState<{ links: DrawnLink[]; width: number; height: number }>({
    links: [],
    height: 0,
    width: 0,
  });

  const measure = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const origin = canvas.getBoundingClientRect();
    const boxes = new Map<string, Box>();
    canvas.querySelectorAll<HTMLElement>('[data-tree-item]').forEach((element) => {
      const rect = element.getBoundingClientRect();
      boxes.set(element.dataset.treeItem ?? '', {
        left: rect.left - origin.left,
        right: rect.right - origin.left,
        centerY: rect.top - origin.top + rect.height / 2,
      });
    });
    const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const gapPx = GAP_REM * rem;
    const links = model.links.flatMap((link) => {
      const from = boxes.get(link.from);
      const to = boxes.get(link.to);
      return from && to ? [draw(link, from, to, gapPx)] : [];
    });
    setDrawn({ links, width: canvas.scrollWidth, height: canvas.scrollHeight });
  }, [model]);

  useLayoutEffect(() => {
    measure();
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => measure());
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [measure]);

  const columns = model.columns.length;
  const gridStyle: CSSProperties = {
    gridTemplateColumns: `repeat(${columns}, minmax(${COLUMN_MIN_REM}rem, 17rem))`,
    columnGap: `${GAP_REM}rem`,
  };
  // O canvas cresce com a grade (com o padding), para a rolagem horizontal mostrar tudo.
  const canvasMinWidth = `${columns * COLUMN_MIN_REM + (columns - 1) * GAP_REM + 3}rem`;

  return (
    <div className="space-y-1.5">
      <div className="overflow-x-auto rounded-xl border bg-muted/20">
        <div ref={canvasRef} className="relative p-4 sm:p-6" style={{ minWidth: canvasMinWidth }}>
          <svg
            aria-hidden
            className="pointer-events-none absolute inset-0 overflow-visible"
            width={drawn.width}
            height={drawn.height}
          >
            <defs>
              <marker
                id="trace-arrow"
                viewBox="0 0 8 8"
                refX="7"
                refY="4"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 8 4 L 0 8 z" className="fill-muted-foreground/60" />
              </marker>
              <marker
                id="trace-arrow-root"
                viewBox="0 0 8 8"
                refX="7"
                refY="4"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 8 4 L 0 8 z" className="fill-primary" />
              </marker>
            </defs>
            {drawn.links.map(({ link, path }) => (
              <path
                key={link.id}
                d={path}
                fill="none"
                strokeWidth={link.touchesRoot ? 2 : 1.5}
                strokeDasharray={link.kind === 'production' ? undefined : '5 4'}
                markerEnd={link.touchesRoot ? 'url(#trace-arrow-root)' : 'url(#trace-arrow)'}
                className={link.touchesRoot ? 'stroke-primary/70' : 'stroke-muted-foreground/45'}
              />
            ))}
          </svg>

          <div className="relative grid justify-center" style={gridStyle}>
            {model.columns.map((column) => (
              <div key={column.key} className="flex flex-col">
                <p className="mb-3 text-center text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
                  {column.title}
                </p>
                <ul className="flex flex-1 flex-col justify-center gap-4">
                  {column.items.map((item) => (
                    <li key={item.id} data-tree-item={item.id} className="relative">
                      <ItemCard item={item} direction={direction} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {drawn.links.map((link) => (
            <LinkLabel key={link.link.id} drawn={link} />
          ))}
        </div>
      </div>
      <p className="text-xs text-muted-foreground sm:hidden">
        Deslize para o lado para ver a árvore inteira. Toque num lote para abrir a rastreabilidade
        dele.
      </p>
    </div>
  );
}
