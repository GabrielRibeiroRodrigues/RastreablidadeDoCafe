import type { ApiSchema, operations } from '@traceflow/shared';
import { getApiClient, unwrap } from '@/lib/api-client';

export type Shipment = ApiSchema<'ShipmentResponse'>;
export type ShipmentDetail = ApiSchema<'ShipmentDetailResponse'>;
export type ShipmentInput = ApiSchema<'CreateShipmentDto'>;
export type ShipmentsQuery = NonNullable<
  operations['ShipmentsController_list']['parameters']['query']
>;

const withSignal = (signal?: AbortSignal) => (signal ? { signal } : {});

export const shipmentsApi = {
  list: (query: ShipmentsQuery, signal?: AbortSignal) =>
    unwrap(getApiClient().GET('/v1/shipments', { params: { query }, ...withSignal(signal) })),

  get: (id: string, signal?: AbortSignal) =>
    unwrap(
      getApiClient().GET('/v1/shipments/{id}', { params: { path: { id } }, ...withSignal(signal) }),
    ),

  /** `idempotencyKey`: a mesma chave em retentativas do mesmo envio (ver `useIdempotencyKey`). */
  create: (body: ShipmentInput, idempotencyKey: string) =>
    unwrap(
      getApiClient().POST('/v1/shipments', {
        params: { header: { 'Idempotency-Key': idempotencyKey } },
        body,
      }),
    ),
};

/** Clientes ativos para o combobox (busca por nome, documento ou e-mail). */
export const searchActiveCustomers = (q: string, signal: AbortSignal) =>
  unwrap(
    getApiClient().GET('/v1/customers', {
      params: { query: { status: 'active', pageSize: 20, sort: 'name', ...(q && { q }) } },
      signal,
    }),
  ).then((page) => page.data);
