import { formatDate, formatQuantity } from '@/lib/quantity';
import { inventoryApi, type StockRow } from './api';

/** Linha de estoque (lote × local) com um `id` próprio, para combobox e listas. */
export type StockOption = StockRow & { id: string };

export const stockOptionId = (row: StockRow): string => `${row.lot.id}:${row.location.id}`;

/**
 * Até 100 saldos disponíveis, **o que vence primeiro no topo** (FEFO: first expired, first out);
 * sem validade, no fim. `q` busca pelo código do lote.
 */
export const searchStock = (q: string, signal: AbortSignal): Promise<StockOption[]> =>
  inventoryApi
    .stock({ lotStatus: 'AVAILABLE', pageSize: 100, sort: 'expiresAt', ...(q && { q }) }, signal)
    .then((page) => page.data.map((row) => ({ ...row, id: stockOptionId(row) })));

export const stockOptionLabel = (row: StockRow): string =>
  `${row.lot.code} · ${row.location.code} — disp. ${formatQuantity(row.quantity, row.unit)}` +
  (row.expiresAt ? ` · vence ${formatDate(row.expiresAt)}` : '');
