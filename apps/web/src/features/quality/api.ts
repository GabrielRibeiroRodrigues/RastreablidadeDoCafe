import type { ApiSchema, operations } from '@traceflow/shared';
import { getApiClient, unwrap } from '@/lib/api-client';

export type NonConformity = ApiSchema<'NonConformityResponse'>;
export type NonConformityType = ApiSchema<'NonConformityType'>;
export type NonConformityStatus = ApiSchema<'NonConformityStatus'>;
export type NonConformityInput = ApiSchema<'OpenNonConformityDto'>;
export type NonConformitiesQuery = NonNullable<
  operations['NonConformitiesController_list']['parameters']['query']
>;

const withSignal = (signal?: AbortSignal) => (signal ? { signal } : {});

export const nonConformitiesApi = {
  list: (query: NonConformitiesQuery, signal?: AbortSignal) =>
    unwrap(
      getApiClient().GET('/v1/non-conformities', { params: { query }, ...withSignal(signal) }),
    ),

  get: (id: string, signal?: AbortSignal) =>
    unwrap(
      getApiClient().GET('/v1/non-conformities/{id}', {
        params: { path: { id } },
        ...withSignal(signal),
      }),
    ),

  open: (body: NonConformityInput) => unwrap(getApiClient().POST('/v1/non-conformities', { body })),

  release: (id: string, justification: string) =>
    unwrap(
      getApiClient().POST('/v1/non-conformities/{id}/release', {
        params: { path: { id } },
        body: { justification },
      }),
    ),

  discard: (id: string, justification: string) =>
    unwrap(
      getApiClient().POST('/v1/non-conformities/{id}/discard', {
        params: { path: { id } },
        body: { justification },
      }),
    ),
};

/** Lotes para comboboxes (busca pelo código, mais recentes primeiro). */
export const searchLots = (q: string, signal: AbortSignal) =>
  unwrap(
    getApiClient().GET('/v1/lots', {
      params: { query: { pageSize: 20, sort: '-receivedAt', ...(q && { q }) } },
      signal,
    }),
  ).then((page) => page.data);
