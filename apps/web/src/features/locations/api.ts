import type { ApiSchema, operations } from '@traceflow/shared';
import type { CatalogApi } from '@/components/catalog/types';
import { toListQuery } from '@/components/catalog/types';
import { getApiClient, unwrap } from '@/lib/api-client';

export type Location = ApiSchema<'LocationResponse'>;
export type LocationType = ApiSchema<'LocationType'>;
export type LocationInput = ApiSchema<'CreateLocationDto'>;

/** O OpenAPI descreve `page`/`pageSize` como objeto (falta `type: Number` na API). */
type ListQuery = NonNullable<operations['LocationsController_list']['parameters']['query']>;

export const locationsApi: CatalogApi<Location, LocationInput> = {
  list: (params, signal) =>
    unwrap(
      getApiClient().GET('/v1/locations', {
        params: { query: toListQuery(params) as unknown as ListQuery },
        ...(signal && { signal }),
      }),
    ),
  create: (input) => unwrap(getApiClient().POST('/v1/locations', { body: input })),
  update: (id, input) =>
    unwrap(getApiClient().PATCH('/v1/locations/{id}', { params: { path: { id } }, body: input })),
  setActive: (id, active) =>
    unwrap(
      getApiClient().POST(
        active ? '/v1/locations/{id}/activate' : '/v1/locations/{id}/deactivate',
        { params: { path: { id } } },
      ),
    ),
};

export const LOCATION_TYPE_LABELS: Record<LocationType, string> = {
  WAREHOUSE: 'Armazém',
  SILO: 'Silo',
  ROASTERY: 'Torrefação',
  QUARANTINE: 'Quarentena',
  SHIPPING: 'Expedição',
};

export const LOCATION_TYPES = Object.keys(LOCATION_TYPE_LABELS) as LocationType[];
