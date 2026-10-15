import {
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  RefreshCwIcon,
  ServerCrashIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from 'cn';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { getErrorMessage } from '@/lib/api';

export interface Column<T> {
  id: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Campo de ordenação na API (`name` → asc, `-name` → desc). Sem ele, a coluna não ordena. */
  sortKey?: string;
  className?: string;
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

/** Tabela de cadastros: cabeçalhos ordenáveis, esqueleto ao carregar, estados vazio e de erro. */
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
  const colSpan = columns.length + (rowActions ? 1 : 0);

  let body: ReactNode;
  if (isLoading) {
    body = Array.from({ length: SKELETON_ROWS }, (_, index) => (
      <TableRow key={index} aria-hidden>
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
        <TableCell colSpan={colSpan} className="py-12">
          <div role="alert" className="flex flex-col items-center gap-3 text-center">
            <ServerCrashIcon className="size-8 text-destructive" aria-hidden />
            <div className="space-y-1">
              <p className="font-medium">Não foi possível carregar a lista</p>
              <p className="text-sm whitespace-normal text-muted-foreground">
                {getErrorMessage(error)}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={onRetry}>
              <RefreshCwIcon />
              Tentar novamente
            </Button>
          </div>
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
          <TableCell key={column.id} className={column.className}>
            {column.cell(row)}
          </TableCell>
        ))}
        {rowActions && (
          <TableCell className="w-px text-right">
            <div className="flex justify-end gap-1">{rowActions(row)}</div>
          </TableCell>
        )}
      </TableRow>
    ));
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <Table aria-busy={isLoading}>
        <caption className="sr-only">{caption}</caption>
        <TableHeader className="bg-muted/40">
          <TableRow className="hover:bg-transparent">
            {columns.map((column) => {
              const direction =
                column.sortKey && sort === column.sortKey
                  ? 'ascending'
                  : column.sortKey && sort === `-${column.sortKey}`
                    ? 'descending'
                    : undefined;
              return (
                <TableHead key={column.id} aria-sort={direction} className={column.className}>
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
              <TableHead className="w-px text-right">
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
