import { navItem } from '@/app/navigation';
import { defineCatalogResource } from '@/components/catalog/types';
import { toOptions } from '@/lib/options';
import { LOCATION_TYPE_LABELS, locationsApi, type Location, type LocationInput } from './api';
import { LocationForm } from './LocationForm';

export const locationsResource = defineCatalogResource<Location, LocationInput>({
  key: 'locations',
  nav: navItem('/locais'),
  singular: 'local',
  plural: 'locais',
  searchPlaceholder: 'Buscar por código ou nome',
  sorts: ['code', '-code', 'name', '-name'],
  defaultSort: 'code',
  filters: [
    {
      param: 'type',
      label: 'Tipo',
      allLabel: 'Todos os tipos',
      options: toOptions(LOCATION_TYPE_LABELS),
    },
  ],
  columns: [
    {
      id: 'code',
      header: 'Código',
      sortKey: 'code',
      cell: (location) => <span className="font-mono text-xs">{location.code}</span>,
    },
    {
      id: 'name',
      header: 'Nome',
      sortKey: 'name',
      className: 'whitespace-normal',
      cell: (location) => (
        <div className="min-w-40">
          <div className="font-medium text-foreground">{location.name}</div>
          {location.description && (
            <div className="line-clamp-1 text-xs text-muted-foreground">{location.description}</div>
          )}
        </div>
      ),
    },
    { id: 'type', header: 'Tipo', cell: (location) => LOCATION_TYPE_LABELS[location.type] },
  ],
  api: locationsApi,
  Form: LocationForm,
  describe: (location) => `${location.code} · ${location.name}`,
});
