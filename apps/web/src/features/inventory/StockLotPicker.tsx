import { EntityCombobox } from '@/components/form/EntityCombobox';
import { PRODUCT_TYPE_LABELS } from '@/features/products/labels';
import type { ProductType } from '@/features/products/api';
import { cn } from 'cn';
import { daysUntil, formatDate, formatQuantity } from '@/lib/quantity';
import { searchStock, stockOptionLabel, type StockOption } from './stock-options';

/**
 * Escolha de um saldo (lote × local) de `/v1/stock`, só de lotes disponíveis. `productTypes`
 * restringe os tipos de produto aceitos; `exclude` esconde pares já escolhidos em outras linhas.
 * O filtro é feito no cliente (a API não filtra o estoque por tipo de produto). A lista vem em
 * ordem FEFO (vence primeiro, no topo) e cada opção mostra a validade.
 */
export function StockLotPicker({
  id,
  value,
  onChange,
  onBlur,
  invalid,
  productTypes,
  exclude,
  placeholder = 'Buscar pelo código do lote',
}: {
  id?: string;
  value: StockOption | null;
  onChange: (value: StockOption | null) => void;
  onBlur?: () => void;
  invalid?: boolean;
  productTypes?: readonly ProductType[];
  exclude?: ReadonlySet<string>;
  placeholder?: string;
}) {
  return (
    <EntityCombobox<StockOption>
      {...(id && { id })}
      queryKey="stock"
      search={searchStock}
      value={value}
      onChange={onChange}
      {...(onBlur && { onBlur })}
      {...(invalid !== undefined && { invalid })}
      placeholder={placeholder}
      filter={(row) =>
        (!productTypes || productTypes.includes(row.product.type)) &&
        !(exclude?.has(row.id) && row.id !== value?.id)
      }
      getLabel={stockOptionLabel}
      renderOption={(row) => (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-mono text-xs font-medium">{row.lot.code}</div>
            <div className="truncate text-xs text-muted-foreground">
              {row.product.name} · {PRODUCT_TYPE_LABELS[row.product.type]}
            </div>
            {row.expiresAt && (
              <div
                className={cn(
                  'text-xs',
                  daysUntil(row.expiresAt) <= 30
                    ? 'font-medium text-amber-700 dark:text-amber-400'
                    : 'text-muted-foreground',
                )}
              >
                Vence {formatDate(row.expiresAt)}
              </div>
            )}
          </div>
          <div className="shrink-0 text-right text-xs">
            <div className="font-mono">{row.location.code}</div>
            <div className="text-muted-foreground tabular-nums">
              {formatQuantity(row.quantity, row.unit)}
            </div>
          </div>
        </div>
      )}
    />
  );
}
