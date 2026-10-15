import type { ApiSchema, operations } from '@traceflow/shared';
import type { CatalogApi } from '@/components/catalog/types';
import { toListQuery } from '@/components/catalog/types';
import { getApiClient, unwrap } from '@/lib/api-client';

export type Product = ApiSchema<'ProductResponse'>;
export type ProductType = ApiSchema<'ProductType'>;
export type Unit = ApiSchema<'Unit'>;
export type RoastLevel = ApiSchema<'RoastLevel'>;

/**
 * Corpo de criação/edição. O OpenAPI atual descreve `description` como objeto (falta
 * `type: String` no DTO da API); aqui vale o contrato real: texto ou `null`.
 */
export type ProductInput = Omit<ApiSchema<'CreateProductDto'>, 'description'> & {
  description: string | null;
};
type ProductBody = ApiSchema<'CreateProductDto'>;

/** O OpenAPI descreve `page`/`pageSize` como objeto (falta `type: Number` na API). */
type ListQuery = NonNullable<operations['ProductsController_list']['parameters']['query']>;

export const productsApi: CatalogApi<Product, ProductInput> = {
  list: (params, signal) =>
    unwrap(
      getApiClient().GET('/v1/products', {
        params: { query: toListQuery(params) as unknown as ListQuery },
        ...(signal && { signal }),
      }),
    ),
  create: (input) =>
    unwrap(getApiClient().POST('/v1/products', { body: input as unknown as ProductBody })),
  update: (id, input) =>
    unwrap(
      getApiClient().PATCH('/v1/products/{id}', {
        params: { path: { id } },
        body: input as unknown as ProductBody,
      }),
    ),
  setActive: (id, active) =>
    unwrap(
      getApiClient().POST(active ? '/v1/products/{id}/activate' : '/v1/products/{id}/deactivate', {
        params: { path: { id } },
      }),
    ),
};
