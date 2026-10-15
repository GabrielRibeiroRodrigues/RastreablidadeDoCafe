import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PAGE_SIZES } from './use-list-params';

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

interface PaginationBarProps {
  meta: PageMeta;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  disabled?: boolean;
}

const numberFormat = new Intl.NumberFormat('pt-BR');

export function PaginationBar({
  meta,
  onPageChange,
  onPageSizeChange,
  disabled,
}: PaginationBarProps) {
  const { page, pageSize, total, totalPages } = meta;
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <nav
      aria-label="Paginação"
      className="flex flex-col-reverse items-center justify-between gap-3 text-sm text-muted-foreground sm:flex-row"
    >
      <p aria-live="polite">
        {total === 0
          ? 'Nenhum registro'
          : `${numberFormat.format(first)}–${numberFormat.format(last)} de ${numberFormat.format(total)}`}
      </p>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="hidden sm:inline">Por página</span>
          <Select
            value={String(pageSize)}
            onValueChange={(value) => onPageSizeChange(Number(value))}
          >
            <SelectTrigger size="sm" aria-label="Itens por página" className="w-18">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <span className="tabular-nums">
          Página {page} de {Math.max(totalPages, 1)}
        </span>
        <div className="flex gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Página anterior"
            disabled={disabled || page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            <ChevronLeftIcon />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Próxima página"
            disabled={disabled || page >= totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            <ChevronRightIcon />
          </Button>
        </div>
      </div>
    </nav>
  );
}
