import type { ApiSchema, operations } from '@traceflow/shared';
import { getApiClient, unwrap } from '@/lib/api-client';

export type ProductionStage = ApiSchema<'ProductionStage'>;
export type ProductionOrder = ApiSchema<'ProductionOrderResponse'>;
export type ProductionLot = ApiSchema<'ProductionLot'>;
export type ProductionOrderInput = ApiSchema<'CreateProductionOrderDto'>;
export type ProductionOrdersQuery = NonNullable<
  operations['ProductionController_list']['parameters']['query']
>;

const withSignal = (signal?: AbortSignal) => (signal ? { signal } : {});

export const productionApi = {
  list: (query: ProductionOrdersQuery, signal?: AbortSignal) =>
    unwrap(
      getApiClient().GET('/v1/production-orders', { params: { query }, ...withSignal(signal) }),
    ),

  get: (id: string, signal?: AbortSignal) =>
    unwrap(
      getApiClient().GET('/v1/production-orders/{id}', {
        params: { path: { id } },
        ...withSignal(signal),
      }),
    ),

  /** `idempotencyKey`: a mesma chave em retentativas do mesmo envio (ver `useIdempotencyKey`). */
  create: (body: ProductionOrderInput, idempotencyKey: string) =>
    unwrap(
      getApiClient().POST('/v1/production-orders', {
        params: { header: { 'Idempotency-Key': idempotencyKey } },
        body,
      }),
    ),
};
