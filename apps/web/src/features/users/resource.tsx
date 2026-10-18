import { USERS_ITEM } from '@/app/navigation';
import { ROLE_LABELS } from '@/auth/roles';
import { defineCatalogResource } from '@/components/catalog/types';
import { Badge } from '@/components/ui/badge';
import { usersApi, type User, type UserInput } from './api';
import { UserForm } from './UserForm';

const dateFormat = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' });

export const usersResource = defineCatalogResource<User, UserInput>({
  key: 'users',
  nav: USERS_ITEM,
  singular: 'usuário',
  plural: 'usuários',
  searchPlaceholder: 'Buscar por nome ou e-mail',
  sorts: ['name', '-name', 'createdAt', '-createdAt'],
  defaultSort: 'name',
  filters: [
    {
      param: 'role',
      label: 'Perfil',
      allLabel: 'Todos os perfis',
      options: (['admin', 'operator', 'auditor'] as const).map((role) => ({
        value: role,
        label: ROLE_LABELS[role],
      })),
    },
  ],
  columns: [
    {
      id: 'name',
      header: 'Nome',
      sortKey: 'name',
      className: 'whitespace-normal',
      cell: (user) => (
        <span className="font-medium text-foreground">
          {user.name}
          {user.isCurrentUser && (
            <span className="ml-2 text-xs font-normal text-muted-foreground">(você)</span>
          )}
        </span>
      ),
    },
    { id: 'email', header: 'E-mail', cell: (user) => user.email },
    {
      id: 'role',
      header: 'Perfil',
      cell: (user) => (
        <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
          {ROLE_LABELS[user.role]}
        </Badge>
      ),
    },
    {
      id: 'createdAt',
      header: 'Desde',
      sortKey: 'createdAt',
      cell: (user) => dateFormat.format(new Date(user.createdAt)),
    },
  ],
  api: usersApi,
  Form: UserForm,
  section: 'Gestão',
  canToggle: (user) => !user.isCurrentUser,
  describe: (user) => user.name,
  details: (user) => [
    { label: 'Nome', value: user.name, wide: true },
    { label: 'E-mail', value: user.email, wide: true },
    { label: 'Perfil', value: ROLE_LABELS[user.role] },
    { label: 'Desde', value: dateFormat.format(new Date(user.createdAt)) },
  ],
});
