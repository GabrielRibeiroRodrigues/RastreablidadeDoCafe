import { navItem } from '@/app/navigation';
import { defineCatalogResource } from '@/components/catalog/types';
import { toOptions } from '@/lib/options';
import { productsApi, type Product, type ProductInput } from './api';
import { PRODUCT_TYPE_LABELS, ROAST_LEVEL_LABELS, UNIT_LABELS } from './labels';
import { ProductForm } from './ProductForm';

export const productsResource = defineCatalogResource<Product, ProductInput>({
  key: 'products',
  nav: navItem('/produtos'),
  singular: 'produto',
  plural: 'produtos',
  searchPlaceholder: 'Buscar por nome ou SKU',
  sorts: ['name', '-name', 'sku', '-sku', 'createdAt', '-createdAt'],
  defaultSort: 'name',
  filters: [
    {
      param: 'type',
      label: 'Tipo',
      allLabel: 'Todos os tipos',
      options: toOptions(PRODUCT_TYPE_LABELS),
    },
  ],
  columns: [
    {
      id: 'sku',
      header: 'SKU',
      sortKey: 'sku',
      cell: (product) => <span className="font-mono text-xs">{product.sku}</span>,
    },
    {
      id: 'name',
      header: 'Nome',
      sortKey: 'name',
      className: 'whitespace-normal',
      cell: (product) => (
        <div className="min-w-40">
          <div className="font-medium text-foreground">{product.name}</div>
          {product.description && (
            <div className="line-clamp-1 text-xs text-muted-foreground">{product.description}</div>
          )}
        </div>
      ),
    },
    { id: 'type', header: 'Tipo', cell: (product) => PRODUCT_TYPE_LABELS[product.type] },
    { id: 'unit', header: 'Unidade', cell: (product) => UNIT_LABELS[product.unit] },
    {
      id: 'roast',
      header: 'Torra padrão',
      cell: (product) =>
        product.defaultRoastLevel ? (
          ROAST_LEVEL_LABELS[product.defaultRoastLevel]
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
  ],
  api: productsApi,
  Form: ProductForm,
  describe: (product) => product.name,
});
