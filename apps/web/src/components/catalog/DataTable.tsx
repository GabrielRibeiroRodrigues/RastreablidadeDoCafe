import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from 'cn';
import { ErrorState } from '@/components/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useIsMobile } from '@/lib/use-media-query';

export interface Column<T> {
  id: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Campo de ordenação na API (`name` → asc, `-name` → desc). Sem ele, a coluna não ordena. */
  sortKey?: string;
  className?: string;
  /**
   * No celular a tabela vira cartões: a coluna `title` (padrão: a primeira) é o título do
   * cartão; `hidden` some do cartão; as demais aparecem como "rótulo: valor".
   */
  mobile?: 'title' | 'hidden';
}

interface DataTableProps<T extends { id: string }> {
  columns: Column<T>[];
  rows: T[] | undefined;
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
  sort: string;
  onSortChange: (sort: string) => void;
  /** Conteúdo exibido quando a lista vem vazia. */
  empty: ReactNode;
  /** Ações por linha (coluna final, alinhada à direita). */
  rowActions?: (row: T) => ReactNode;
  /** Linhas esmaecidas (ex.: cadastros inativos). */
  isMuted?: (row: T) => boolean;
  caption: string;
}

const SKELETON_ROWS = 5;

function SortHeader({
  column,
  sort,
  onSortChange,
}: {
  column: Column<unknown>;
  sort: string;
  onSortChange: (sort: string) => void;
}) {
  const key = column.sortKey!;
  const direction = sort === key ? 'asc' : sort === `-${key}` ? 'desc' : null;
  const Icon =
    direction === 'asc' ? ArrowUpIcon : direction === 'desc' ? ArrowDownIcon : ArrowUpDownIcon;
  return (
    <button
      type="button"
      onClick={() => onSortChange(direction === 'asc' ? `-${key}` : key)}
      className="-ml-2 inline-flex h-8 items-center gap-1.5 rounded-md px-2 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      {column.header}
      <Icon className={cn('size-3.5', !direction && 'opacity-40')} aria-hidden />
    </button>
  );
}

/** Lista em cartões (celular): mesmo conteúdo das colunas, sem rolagem horizontal. */
function CardList<T extends { id: string }>({
  columns,
  rows,
  rowActions,
  isMuted,
  caption,
}: {
  columns: Column<T>[];
  rows: T[];
  rowActions?: ((row: T) => ReactNode) | undefined;
  isMuted?: ((row: T) => boolean) | undefined;
  caption: string;
}) {
  const title = columns.find((column) => column.mobile === 'title') ?? columns[0];
  const fields = columns.filter((column) => column !== title && column.mobile !== 'hidden');
  return (
    <ul aria-label={caption} className="divide-y">
      {rows.map((row) => (
        <li key={row.id} className={cn('space-y-2 p-4', isMuted?.(row) && 'opacity-70')}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 text-sm">{title?.cell(row)}</div>
            {rowActions && <div className="-my-1 flex shrink-0 gap-1">{rowActions(row)}</div>}
          </div>
          {fields.length > 0 && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              {fields.map((column) => (
                <div key={column.id} className="contents">
                  <dt className="text-xs leading-5 text-muted-foreground">{column.header}</dt>
                  <dd className="min-w-0 text-right break-words">{column.cell(row)}</dd>
                </div>
              ))}
            </dl>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * Tabela de listagens: cabeçalho fixo ao rolar, ordenação, esqueleto ao carregar, estados vazio
 * e de erro. No celular vira uma lista de cartões.
 */
export function DataTable<T extends { id: string }>({
  columns,
  rows,
  isLoading,
  error,
  onRetry,
  sort,
  onSortChange,
  empty,
  rowActions,
  isMuted,
  caption,
}: DataTableProps<T>) {
  const isMobile = useIsMobile();
  const colSpan = columns.length + (rowActions ? 1 : 0);

  if (isMobile && !isLoading && !error && rows?.length) {
    return (
      <div className="overflow-hidden rounded-xl border bg-card">
        <CardList
          columns={columns}
          rows={rows}
          rowActions={rowActions}
          isMuted={isMuted}
          caption={caption}
        />
      </div>
    );
  }

  let body: ReactNode;
  if (isLoading) {
    body = Array.from({ length: SKELETON_ROWS }, (_, index) => (
      <TableRow key={index} aria-hidden className="hover:bg-transparent">
        {Array.from({ length: colSpan }, (__, cell) => (
          <TableCell key={cell}>
            <Skeleton className="h-5 w-full max-w-40" />
          </TableCell>
        ))}
      </TableRow>
    ));
  } else if (error) {
    body = (
      <TableRow className="hover:bg-transparent">
        <TableCell colSpan={colSpan} className="py-10 whitespace-normal">
          <ErrorState
            error={error}
            onRetry={onRetry}
            title="Não foi possível carregar a lista"
            bordered={false}
          />
        </TableCell>
      </TableRow>
    );
  } else if (!rows?.length) {
    body = (
      <TableRow className="hover:bg-transparent">
        <TableCell colSpan={colSpan} className="py-12 whitespace-normal">
          {empty}
        </TableCell>
      </TableRow>
    );
  } else {
    body = rows.map((row) => (
      <TableRow key={row.id} className={cn(isMuted?.(row) && 'text-muted-foreground')}>
        {columns.map((column) => (
          <TableCell key={column.id} className={cn('px-3 py-2.5', column.className)}>
            {column.cell(row)}
          </TableCell>
        ))}
        {rowActions && (
          <TableCell className="w-px px-3 text-right">
            <div className="flex justify-end gap-1">{rowActions(row)}</div>
          </TableCell>
        )}
      </TableRow>
    ));
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      {/* Altura máxima: o cabeçalho fica fixo enquanto as linhas rolam. */}
      <Table aria-busy={isLoading} containerClassName="max-h-[calc(100svh-15rem)] min-h-40">
        <caption className="sr-only">{caption}</caption>
        <TableHeader className="sticky top-0 z-10 bg-muted/95 backdrop-blur supports-backdrop-filter:bg-muted/80">
          <TableRow className="hover:bg-transparent">
            {columns.map((column) => {
              const direction =
                column.sortKey && sort === column.sortKey
                  ? 'ascending'
                  : column.sortKey && sort === `-${column.sortKey}`
                    ? 'descending'
                    : undefined;
              return (
                <TableHead
                  key={column.id}
                  aria-sort={direction}
                  className={cn('px-3 text-xs font-medium text-muted-foreground', column.className)}
                >
                  {column.sortKey ? (
                    <SortHeader
                      column={column as Column<unknown>}
                      sort={sort}
                      onSortChange={onSortChange}
                    />
                  ) : (
                    column.header
                  )}
                </TableHead>
              );
            })}
            {rowActions && (
              <TableHead className="w-px px-3 text-right">
                <span className="sr-only">Ações</span>
              </TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>{body}</TableBody>
      </Table>
    </div>
  );
}
