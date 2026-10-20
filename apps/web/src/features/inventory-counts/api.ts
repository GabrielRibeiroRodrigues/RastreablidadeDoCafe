import type { ApiSchema, operations } from '@traceflow/shared';
import { getApiClient, unwrap } from '@/lib/api-client';

export type InventoryCount = ApiSchema<'InventoryCountResponse'>;
export type InventoryCountDetail = ApiSchema<'InventoryCountDetailResponse'>;
export type InventoryCountItem = ApiSchema<'InventoryCountItemResponse'>;
export type InventoryCountStatus = ApiSchema<'InventoryCountStatus'>;
export type InventoryCountsQuery = NonNullable<
  operations['InventoryCountsController_list']['parameters']['query']
>;

const withSignal = (signal?: AbortSignal) => (signal ? { signal } : {});
const path = (id: string) => ({ params: { path: { id } } });

export const inventoryCountsApi = {
  list: (query: InventoryCountsQuery, signal?: AbortSignal) =>
    unwrap(
      getApiClient().GET('/v1/inventory-counts', { params: { query }, ...withSignal(signal) }),
    ),

  get: (id: string, signal?: AbortSignal) =>
    unwrap(getApiClient().GET('/v1/inventory-counts/{id}', { ...path(id), ...withSignal(signal) })),

  create: (body: ApiSchema<'CreateInventoryCountDto'>) =>
    unwrap(getApiClient().POST('/v1/inventory-counts', { body })),

  count: (id: string, itemId: string, countedQuantity: string) =>
    unwrap(
      getApiClient().PUT('/v1/inventory-counts/{id}/items/{itemId}', {
        params: { path: { id, itemId } },
        body: { countedQuantity },
      }),
    ),

  addItem: (id: string, lotId: string, countedQuantity: string) =>
    unwrap(
      getApiClient().POST('/v1/inventory-counts/{id}/items', {
        ...path(id),
        body: { lotId, countedQuantity },
      }),
    ),

  apply: (id: string) => unwrap(getApiClient().POST('/v1/inventory-counts/{id}/apply', path(id))),

  cancel: (id: string, reason: string) =>
    unwrap(
      getApiClient().POST('/v1/inventory-counts/{id}/cancel', { ...path(id), body: { reason } }),
    ),
};
