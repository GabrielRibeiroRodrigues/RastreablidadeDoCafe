import type { ApiSchema } from '@traceflow/shared';
import { inventoryApi } from '@/features/inventory/api';
import { productionApi } from '@/features/production/api';
import { shipmentsApi } from '@/features/shipments/api';
import { ApiError } from '@/lib/api';
import { getApiClient, unwrap } from '@/lib/api-client';
import { fromMilli, startOfLocalDayIso, toKgMilli, toMilli } from '@/lib/quantity';

/** Resposta de `GET /v1/dashboard` (tipos gerados do contrato OpenAPI). */
export type DashboardResponse = ApiSchema<'DashboardResponse'>;
export type DashboardExpiringLot = DashboardResponse['expiringSoon']['items'][number];
export type DashboardStockByProduct = DashboardResponse['stockByProduct'][number];

export interface DashboardData extends DashboardResponse {
  /** `fallback`: API sem o endpoint agregado; números montados com as listagens existentes. */
  source: 'api' | 'fallback';
}

export const EXPIRING_DAYS = 30;
const RECENT_MOVEMENTS = 8;
const EXPIRING_ITEMS = 6;

function fetchAggregated(signal?: AbortSignal): Promise<DashboardResponse> {
  return unwrap(getApiClient().GET('/v1/dashboard', signal ? { signal } : {}));
}

function todayLocal(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * Mesmos indicadores a partir das listagens (API sem `/v1/dashboard`). Agregados que dependem de
 * muitas linhas (estoque, produção, expedições) consideram até 100 registros de cada listagem.
 */
async function fetchFallback(signal?: AbortSignal): Promise<DashboardResponse> {
  const today = todayLocal();
  const since = startOfLocalDayIso(today, -30);
  const total = (status: 'AVAILABLE' | 'QUARANTINE' | 'BLOCKED' | 'CONSUMED') =>
    inventoryApi.listLots({ status, pageSize: 1 }, signal).then((page) => page.meta.total);

  const [
    available,
    quarantine,
    blocked,
    consumed,
    expiring,
    movementsToday,
    recent,
    stock,
    production,
    shipments,
  ] = await Promise.all([
    total('AVAILABLE'),
    total('QUARANTINE'),
    total('BLOCKED'),
    total('CONSUMED'),
    inventoryApi.listLots(
      { expiresWithinDays: EXPIRING_DAYS, sort: 'expiresAt', pageSize: 50 },
      signal,
    ),
    inventoryApi
      .listMovements({ from: startOfLocalDayIso(today), pageSize: 1 }, signal)
      .then((page) => page.meta.total),
    inventoryApi.listMovements({ pageSize: RECENT_MOVEMENTS }, signal),
    inventoryApi.stock({ pageSize: 100 }, signal),
    productionApi.list({ from: since, pageSize: 100 }, signal),
    shipmentsApi.list({ from: since, pageSize: 100 }, signal),
  ]);

  // Lotes consumidos (saldo zero) não interessam na lista de vencimentos.
  const expiringLots = expiring.data.filter((lot) => lot.status !== 'CONSUMED' && lot.expiresAt);

  const byProduct = new Map<string, DashboardStockByProduct & { milli: bigint }>();
  for (const row of stock.data) {
    const current = byProduct.get(row.product.id);
    const milli = (current?.milli ?? 0n) + toMilli(row.quantity);
    byProduct.set(row.product.id, {
      productId: row.product.id,
      sku: row.product.sku,
      name: row.product.name,
      type: row.product.type,
      unit: row.unit,
      quantity: fromMilli(milli),
      milli,
    });
  }

  const yields = production.data.flatMap((order) =>
    order.yieldPercent === null ? [] : [order.yieldPercent],
  );
  const lossMilli = production.data.reduce(
    (sum, order) => sum + (order.lossKg ? toMilli(order.lossKg) : 0n),
    0n,
  );

  return {
    lots: { available, quarantine, blocked, consumed },
    expiringSoon: {
      days: EXPIRING_DAYS,
      count: expiringLots.length,
      items: expiringLots.slice(0, EXPIRING_ITEMS).map((lot) => ({
        id: lot.id,
        code: lot.code,
        product: { id: lot.product.id, sku: lot.product.sku, name: lot.product.name },
        expiresAt: lot.expiresAt ?? '',
        balance: lot.balance,
        unit: lot.unit,
      })),
    },
    movementsToday,
    stockByProduct: [...byProduct.values()]
      .sort((a, b) =>
        Number((toKgMilli(b.quantity, b.unit) ?? 0n) - (toKgMilli(a.quantity, a.unit) ?? 0n)),
      )
      .map(({ milli: _milli, ...row }) => row),
    production30d: {
      orders: production.meta.total,
      avgYieldPercent: yields.length
        ? Math.round((yields.reduce((a, b) => a + b, 0) / yields.length) * 10) / 10
        : null,
      lossKg: fromMilli(lossMilli),
    },
    shipments30d: {
      count: shipments.meta.total,
      customers: new Set(shipments.data.map((shipment) => shipment.customer.id)).size,
    },
    recentMovements: recent.data,
  };
}

/** Indicadores do painel: endpoint agregado, ou as listagens se ele ainda não existir (404). */
export async function fetchDashboard(signal?: AbortSignal): Promise<DashboardData> {
  try {
    return { ...(await fetchAggregated(signal)), source: 'api' };
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 405)) {
      return { ...(await fetchFallback(signal)), source: 'fallback' };
    }
    throw error;
  }
}
