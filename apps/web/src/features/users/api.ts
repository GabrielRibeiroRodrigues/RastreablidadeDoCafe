import type { ApiSchema, operations } from '@traceflow/shared';
import type { CatalogApi } from '@/components/catalog/types';
import { toListQuery } from '@/components/catalog/types';
import { getApiClient, unwrap } from '@/lib/api-client';

export type User = ApiSchema<'UserResponse'>;
/** Convite (e-mail, nome, perfil); na edição o e-mail é ignorado — não muda depois de criado. */
export type UserInput = ApiSchema<'InviteUserDto'>;

type ListQuery = NonNullable<operations['UsersController_list']['parameters']['query']>;

export const usersApi: CatalogApi<User, UserInput> = {
  list: (params, signal) =>
    unwrap(
      getApiClient().GET('/v1/users', {
        params: { query: toListQuery<ListQuery>(params) },
        ...(signal && { signal }),
      }),
    ),
  create: (input) => unwrap(getApiClient().POST('/v1/users', { body: input })),
  update: (id, { name, role }) =>
    unwrap(
      getApiClient().PATCH('/v1/users/{id}', { params: { path: { id } }, body: { name, role } }),
    ),
  setActive: (id, active) =>
    unwrap(
      getApiClient().POST(active ? '/v1/users/{id}/activate' : '/v1/users/{id}/deactivate', {
        params: { path: { id } },
      }),
    ),
};
