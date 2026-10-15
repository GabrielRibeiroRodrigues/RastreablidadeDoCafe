import type { ApiSchema, operations } from '@traceflow/shared';
import type { CatalogApi } from '@/components/catalog/types';
import { toListQuery } from '@/components/catalog/types';
import { getApiClient, unwrap } from '@/lib/api-client';

export type Supplier = ApiSchema<'SupplierResponse'>;
export type SupplierType = ApiSchema<'SupplierType'>;
export type SupplierInput = ApiSchema<'CreateSupplierDto'>;

/** O OpenAPI descreve `page`/`pageSize` como objeto (falta `type: Number` na API). */
type ListQuery = NonNullable<operations['SuppliersController_list']['parameters']['query']>;

export const suppliersApi: CatalogApi<Supplier, SupplierInput> = {
  list: (params, signal) =>
    unwrap(
      getApiClient().GET('/v1/suppliers', {
        params: { query: toListQuery(params) as unknown as ListQuery },
        ...(signal && { signal }),
      }),
    ),
  create: (input) => unwrap(getApiClient().POST('/v1/suppliers', { body: input })),
  update: (id, input) =>
    unwrap(getApiClient().PATCH('/v1/suppliers/{id}', { params: { path: { id } }, body: input })),
  setActive: (id, active) =>
    unwrap(
      getApiClient().POST(
        active ? '/v1/suppliers/{id}/activate' : '/v1/suppliers/{id}/deactivate',
        { params: { path: { id } } },
      ),
    ),
};

export const SUPPLIER_TYPE_LABELS: Record<SupplierType, string> = {
  PRODUCER: 'Produtor',
  FARM: 'Fazenda',
  COOPERATIVE: 'Cooperativa',
  TRADER: 'Comerciante',
};

export const SUPPLIER_TYPES = Object.keys(SUPPLIER_TYPE_LABELS) as SupplierType[];
