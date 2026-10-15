import type { ApiSchema, operations } from '@traceflow/shared';
import type { CatalogApi } from '@/components/catalog/types';
import { toListQuery } from '@/components/catalog/types';
import { getApiClient, unwrap } from '@/lib/api-client';

export type Customer = ApiSchema<'CustomerResponse'>;
export type CustomerInput = ApiSchema<'CreateCustomerDto'>;

/** O OpenAPI descreve `page`/`pageSize` como objeto (falta `type: Number` na API). */
type ListQuery = NonNullable<operations['CustomersController_list']['parameters']['query']>;

export const customersApi: CatalogApi<Customer, CustomerInput> = {
  list: (params, signal) =>
    unwrap(
      getApiClient().GET('/v1/customers', {
        params: { query: toListQuery(params) as unknown as ListQuery },
        ...(signal && { signal }),
      }),
    ),
  create: (input) => unwrap(getApiClient().POST('/v1/customers', { body: input })),
  update: (id, input) =>
    unwrap(getApiClient().PATCH('/v1/customers/{id}', { params: { path: { id } }, body: input })),
  setActive: (id, active) =>
    unwrap(
      getApiClient().POST(
        active ? '/v1/customers/{id}/activate' : '/v1/customers/{id}/deactivate',
        { params: { path: { id } } },
      ),
    ),
};
