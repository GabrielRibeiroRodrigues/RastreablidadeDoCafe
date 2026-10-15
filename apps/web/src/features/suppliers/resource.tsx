import { navItem } from '@/app/navigation';
import { defineCatalogResource } from '@/components/catalog/types';
import { formatDocument, formatPhone, UFS } from '@/lib/br';
import { toOptions } from '@/lib/options';
import { SUPPLIER_TYPE_LABELS, suppliersApi, type Supplier, type SupplierInput } from './api';
import { SupplierForm } from './SupplierForm';

const dash = <span className="text-muted-foreground">—</span>;

export const suppliersResource = defineCatalogResource<Supplier, SupplierInput>({
  key: 'suppliers',
  nav: navItem('/fornecedores'),
  singular: 'fornecedor',
  plural: 'fornecedores',
  searchPlaceholder: 'Buscar por nome, fazenda ou documento',
  sorts: ['name', '-name', 'createdAt', '-createdAt'],
  defaultSort: 'name',
  filters: [
    {
      param: 'type',
      label: 'Tipo',
      allLabel: 'Todos os tipos',
      options: toOptions(SUPPLIER_TYPE_LABELS),
    },
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
      cell: (supplier) => (
        <div className="min-w-40">
          <div className="font-medium text-foreground">{supplier.name}</div>
          {supplier.farmName && (
            <div className="text-xs text-muted-foreground">{supplier.farmName}</div>
          )}
        </div>
      ),
    },
    { id: 'type', header: 'Tipo', cell: (supplier) => SUPPLIER_TYPE_LABELS[supplier.type] },
    {
      id: 'document',
      header: 'CPF/CNPJ',
      cell: (supplier) =>
        supplier.document ? (
          <span className="font-mono text-xs">{formatDocument(supplier.document)}</span>
        ) : (
          dash
        ),
    },
    {
      id: 'origin',
      header: 'Origem',
      className: 'whitespace-normal',
      cell: (supplier) => {
        const place = [supplier.city, supplier.state].filter(Boolean).join('/');
        if (!place && !supplier.region && supplier.altitudeMeters === null) return dash;
        return (
          <div className="min-w-32">
            <div>{place || supplier.region}</div>
            <div className="text-xs text-muted-foreground">
              {[
                place ? supplier.region : null,
                supplier.altitudeMeters !== null && `${supplier.altitudeMeters} m`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </div>
          </div>
        );
      },
    },
    {
      id: 'varieties',
      header: 'Variedades',
      className: 'whitespace-normal',
      cell: (supplier) =>
        supplier.varieties.length ? (
          <div className="flex max-w-56 flex-wrap gap-1">
            {supplier.varieties.map((variety) => (
              <span
                key={variety}
                className="rounded-md bg-secondary px-1.5 py-0.5 text-xs text-secondary-foreground"
              >
                {variety}
              </span>
            ))}
          </div>
        ) : (
          dash
        ),
    },
  ],
  api: suppliersApi,
  Form: SupplierForm,
  describe: (supplier) => supplier.name,
  details: (supplier) => [
    { label: 'Nome', value: supplier.name, wide: true },
    { label: 'Tipo', value: SUPPLIER_TYPE_LABELS[supplier.type] },
    {
      label: 'CPF/CNPJ',
      value: supplier.document && (
        <span className="font-mono">{formatDocument(supplier.document)}</span>
      ),
    },
    { label: 'Fazenda', value: supplier.farmName },
    { label: 'Região', value: supplier.region },
    { label: 'Cidade/UF', value: [supplier.city, supplier.state].filter(Boolean).join('/') },
    {
      label: 'Altitude',
      value:
        supplier.altitudeMeters !== null
          ? `${supplier.altitudeMeters.toLocaleString('pt-BR')} m`
          : null,
    },
    {
      label: 'Variedades',
      wide: true,
      value: supplier.varieties.length > 0 && (
        <span className="flex flex-wrap gap-1">
          {supplier.varieties.map((variety) => (
            <span
              key={variety}
              className="rounded-md bg-secondary px-1.5 py-0.5 text-xs font-normal text-secondary-foreground"
            >
              {variety}
            </span>
          ))}
        </span>
      ),
    },
    { label: 'E-mail', value: supplier.email },
    { label: 'Telefone', value: formatPhone(supplier.phone) },
  ],
  dialogClassName: 'sm:max-w-2xl',
});
