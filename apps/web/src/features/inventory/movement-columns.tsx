import { Link } from 'react-router';
import type { Column } from '@/components/catalog/DataTable';
import { formatDateTime, formatQuantity, type UnitCode } from '@/lib/quantity';
import type { Movement } from './api';
import { MovementRoute, MovementTypeBadge } from './components';

const dash = <span className="text-muted-foreground">—</span>;

/**
 * Colunas do histórico de movimentações. `unit`: unidade do lote (no detalhe); na listagem geral
 * a API não devolve a unidade e a quantidade sai sem ela.
 */
export function movementColumns({
  unit,
  showLot,
}: {
  unit?: UnitCode;
  showLot?: boolean;
}): Column<Movement>[] {
  const columns: Column<Movement>[] = [
    {
      id: 'occurredAt',
      header: 'Data',
      cell: (m) => <span className="tabular-nums">{formatDateTime(m.occurredAt)}</span>,
    },
    { id: 'type', header: 'Tipo', cell: (m) => <MovementTypeBadge movement={m} /> },
  ];
  if (showLot) {
    columns.push({
      id: 'lot',
      header: 'Lote',
      cell: (m) => (
        <Link
          to={`/lotes/${m.lot.id}`}
          className="font-mono text-xs font-medium text-primary underline-offset-4 hover:underline"
        >
          {m.lot.code}
        </Link>
      ),
    });
  }
  columns.push(
    { id: 'route', header: 'Origem → destino', cell: (m) => <MovementRoute movement={m} /> },
    {
      id: 'quantity',
      header: 'Quantidade',
      className: 'text-right',
      cell: (m) => (
        <span className="tabular-nums">
          {m.type === 'REVERSAL' ? '↺ ' : ''}
          {formatQuantity(m.quantity, unit)}
        </span>
      ),
    },
    { id: 'user', header: 'Usuário', cell: (m) => m.user.name },
    { id: 'document', header: 'Documento', cell: (m) => m.documentRef ?? dash },
    {
      id: 'reason',
      header: 'Motivo',
      className: 'whitespace-normal',
      cell: (m) =>
        m.reason ? <span className="line-clamp-2 min-w-32 text-sm">{m.reason}</span> : dash,
    },
  );
  return columns;
}
