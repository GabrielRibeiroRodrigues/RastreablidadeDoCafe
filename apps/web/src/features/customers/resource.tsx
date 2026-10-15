import { navItem } from '@/app/navigation';
import { defineCatalogResource } from '@/components/catalog/types';
import { formatDocument, formatPhone, UFS } from '@/lib/br';
import { customersApi, type Customer, type CustomerInput } from './api';
import { CustomerForm } from './CustomerForm';

const dash = <span className="text-muted-foreground">—</span>;

export const customersResource = defineCatalogResource<Customer, CustomerInput>({
  key: 'customers',
  nav: navItem('/clientes'),
  singular: 'cliente',
  plural: 'clientes',
  searchPlaceholder: 'Buscar por nome, documento ou e-mail',
  sorts: ['name', '-name', 'createdAt', '-createdAt'],
  defaultSort: 'name',
  filters: [
    {
      param: 'state',
      label: 'UF',
      allLabel: 'Todas as UFs',
      options: UFS.map((uf) => ({ value: uf, label: uf })),
    },
  ],
  columns: [
    {
      id: 'name',
      header: 'Nome',
      sortKey: 'name',
      className: 'whitespace-normal',
      cell: (customer) => <span className="font-medium text-foreground">{customer.name}</span>,
    },
    {
      id: 'document',
      header: 'CPF/CNPJ',
      cell: (customer) =>
        customer.document ? (
          <span className="font-mono text-xs">{formatDocument(customer.document)}</span>
        ) : (
          dash
        ),
    },
    {
      id: 'contact',
      header: 'Contato',
      cell: (customer) =>
        customer.email || customer.phone ? (
          <div>
            {customer.email && <div>{customer.email}</div>}
            {customer.phone && (
              <div className="text-xs text-muted-foreground">{formatPhone(customer.phone)}</div>
            )}
          </div>
        ) : (
          dash
        ),
    },
    {
      id: 'city',
      header: 'Cidade/UF',
      cell: (customer) => [customer.city, customer.state].filter(Boolean).join('/') || dash,
    },
  ],
  api: customersApi,
  Form: CustomerForm,
  describe: (customer) => customer.name,
  details: (customer) => [
    { label: 'Nome', value: customer.name, wide: true },
    {
      label: 'CPF/CNPJ',
      value: customer.document && (
        <span className="font-mono">{formatDocument(customer.document)}</span>
      ),
    },
    { label: 'Telefone', value: formatPhone(customer.phone) },
    { label: 'E-mail', value: customer.email, wide: true },
    { label: 'Cidade', value: customer.city },
    { label: 'UF', value: customer.state },
  ],
});
