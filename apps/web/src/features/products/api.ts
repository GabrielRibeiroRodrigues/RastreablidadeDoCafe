import type { ApiSchema, operations } from '@traceflow/shared';
import type { CatalogApi } from '@/components/catalog/types';
import { toListQuery } from '@/components/catalog/types';
import { getApiClient, unwrap } from '@/lib/api-client';

export type Product = ApiSchema<'ProductResponse'>;
export type ProductType = ApiSchema<'ProductType'>;
export type Unit = ApiSchema<'Unit'>;
export type RoastLevel = ApiSchema<'RoastLevel'>;

export type ProductInput = ApiSchema<'CreateProductDto'>;

type ListQuery = NonNullable<operations['ProductsController_list']['parameters']['query']>;

export const productsApi: CatalogApi<Product, ProductInput> = {
  list: (params, signal) =>
    unwrap(
      getApiClient().GET('/v1/products', {
        params: { query: toListQuery<ListQuery>(params) },
        ...(signal && { signal }),
      }),
    ),
  create: (input) => unwrap(getApiClient().POST('/v1/products', { body: input })),
  update: (id, input) =>
    unwrap(
      getApiClient().PATCH('/v1/products/{id}', {
        params: { path: { id } },
        body: input,
      }),
    ),
  setActive: (id, active) =>
    unwrap(
      getApiClient().POST(active ? '/v1/products/{id}/activate' : '/v1/products/{id}/deactivate', {
        params: { path: { id } },
      }),
    ),
};
