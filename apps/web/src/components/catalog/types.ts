import type { ComponentType } from 'react';
import type { NavItem } from '@/app/navigation';
import type { Column } from './DataTable';
import type { Option } from './FilterSelect';
import type { PageMeta } from './PaginationBar';
import type { ListParams, ListParamsConfig } from './use-list-params';

export interface CatalogEntity {
  id: string;
  isActive: boolean;
}

export interface Page<T> {
  data: T[];
  meta: PageMeta;
}

/** Operações de um cadastro na API (mesmo padrão para todos). */
export interface CatalogApi<T, Input> {
  list: (params: ListParams, signal?: AbortSignal) => Promise<Page<T>>;
  create: (input: Input) => Promise<T>;
  update: (id: string, input: Input) => Promise<T>;
  setActive: (id: string, active: boolean) => Promise<T>;
}

export interface EntityFormProps<T, Input> {
  /** `null` ao criar. */
  entity: T | null;
  /** `id` do `<form>`, para o botão de salvar no rodapé do diálogo. */
  formId: string;
  /** Deve rejeitar com o `ApiError` para o formulário mapear os erros de campo. */
  onSubmit: (input: Input) => Promise<unknown>;
}

export interface FilterDef {
  /** Nome do parâmetro na URL e na API. */
  param: string;
  label: string;
  allLabel: string;
  options: readonly Option[];
}

export interface CatalogResource<T extends CatalogEntity, Input> {
  /** Raiz das query keys do TanStack Query (ex.: `products`). */
  key: string;
  nav: NavItem;
  /** Substantivo no singular, minúsculo (ex.: `produto`). Todos os cadastros são masculinos. */
  singular: string;
  plural: string;
  searchPlaceholder: string;
  sorts: readonly string[];
  defaultSort: string;
  filters: readonly FilterDef[];
  columns: Column<T>[];
  api: CatalogApi<T, Input>;
  Form: ComponentType<EntityFormProps<T, Input>>;
  /** Nome exibido em confirmações e toasts. */
  describe: (entity: T) => string;
  /** Largura do diálogo de formulário (classe Tailwind). */
  dialogClassName?: string;
}

export type DefinedCatalogResource<T extends CatalogEntity, Input> = CatalogResource<T, Input> & {
  listConfig: ListParamsConfig;
};

/** Completa a definição com a configuração (estável) usada para ler a URL. */
export function defineCatalogResource<T extends CatalogEntity, Input>(
  resource: CatalogResource<T, Input>,
): DefinedCatalogResource<T, Input> {
  return {
    ...resource,
    listConfig: {
      sorts: resource.sorts,
      defaultSort: resource.defaultSort,
      filters: Object.fromEntries(
        resource.filters.map((filter) => [filter.param, filter.options.map((o) => o.value)]),
      ),
    },
  };
}

/** `ListParams` → query string da API (busca vazia e filtros ausentes não são enviados). */
export function toListQuery(params: ListParams) {
  return {
    page: params.page,
    pageSize: params.pageSize,
    status: params.status,
    sort: params.sort,
    ...(params.q && { q: params.q }),
    ...params.filters,
  };
}
