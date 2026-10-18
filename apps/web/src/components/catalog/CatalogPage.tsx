import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  EyeIcon,
  Loader2Icon,
  PencilIcon,
  PlusIcon,
  PowerIcon,
  PowerOffIcon,
  SearchXIcon,
} from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { toast } from 'sonner';
import { useCatalogPermissions } from '@/auth/permissions';
import { EmptyState } from '@/components/EmptyState';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { getErrorMessage } from '@/lib/api';
import { CatalogDetailSheet } from './CatalogDetailSheet';
import { ConfirmDialog } from './ConfirmDialog';
import { DataTable, type Column } from './DataTable';
import { FilterSelect } from './FilterSelect';
import { PaginationBar } from './PaginationBar';
import { SearchInput } from './SearchInput';
import { StatusFilter } from './StatusFilter';
import type { CatalogEntity, DefinedCatalogResource } from './types';
import { useListParams } from './use-list-params';

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

type FormState<T> = { mode: 'create' } | { mode: 'edit'; entity: T } | null;

/**
 * Tela de cadastro genérica: listagem paginada no servidor com busca, filtros, situação e
 * ordenação (estado na URL), criação/edição em diálogo e ativação/desativação com confirmação.
 * Ações aparecem conforme o perfil; a API aplica as mesmas regras.
 */
export function CatalogPage<T extends CatalogEntity, Input>({
  resource,
}: {
  resource: DefinedCatalogResource<T, Input>;
}) {
  const { key, nav, singular, plural, api, Form } = resource;
  const Icon = nav.icon;
  const queryClient = useQueryClient();
  const { canWrite, canToggleActive } = useCatalogPermissions();
  const list = useListParams(resource.listConfig);
  const { params } = list;
  const formId = useId();

  const [formState, setFormState] = useState<FormState<T>>(null);
  const [confirming, setConfirming] = useState<T | null>(null);
  const [viewing, setViewing] = useState<T | null>(null);

  const query = useQuery({
    queryKey: [key, 'list', params],
    queryFn: ({ signal }) => api.list(params, signal),
    placeholderData: keepPreviousData,
  });

  // Página além do fim (ex.: após desativar o último item da página): volta para a última.
  const totalPages = query.data?.meta.totalPages ?? 0;
  const { setPage } = list;
  useEffect(() => {
    if (!query.isPlaceholderData && totalPages > 0 && params.page > totalPages) {
      setPage(totalPages);
    }
  }, [query.isPlaceholderData, totalPages, params.page, setPage]);

  const save = useMutation({
    mutationFn: (input: Input) =>
      formState?.mode === 'edit' ? api.update(formState.entity.id, input) : api.create(input),
    onSuccess: async (saved) => {
      toast.success(
        `${capitalize(singular)} ${formState?.mode === 'edit' ? 'atualizado' : 'criado'}.`,
        { description: resource.describe(saved) },
      );
      setFormState(null);
      await queryClient.invalidateQueries({ queryKey: [key] });
    },
    onError: (error) =>
      toast.error(`Não foi possível salvar o ${singular}`, {
        description: getErrorMessage(error),
      }),
  });

  const toggle = useMutation({
    mutationFn: ({ entity, active }: { entity: T; active: boolean }) =>
      api.setActive(entity.id, active),
    onSuccess: async (updated, { active }) => {
      toast.success(`${capitalize(singular)} ${active ? 'reativado' : 'desativado'}.`, {
        description: resource.describe(updated),
      });
      setConfirming(null);
      await queryClient.invalidateQueries({ queryKey: [key] });
    },
    onError: (error, { active }) =>
      toast.error(`Não foi possível ${active ? 'reativar' : 'desativar'} o ${singular}`, {
        description: getErrorMessage(error),
      }),
  });

  const statusColumn: Column<T> = {
    id: 'status',
    header: 'Situação',
    cell: (row) =>
      row.isActive ? (
        <Badge variant="secondary">Ativo</Badge>
      ) : (
        <Badge variant="outline" className="text-muted-foreground">
          Inativo
        </Badge>
      ),
  };

  const rowActions = (row: T) => {
    const name = resource.describe(row);
    return (
      <>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Ver detalhes de ${name}`}
          title="Ver detalhes"
          onClick={() => setViewing(row)}
        >
          <EyeIcon />
        </Button>
        {canWrite && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Editar ${name}`}
            title="Editar"
            onClick={() => {
              save.reset();
              setFormState({ mode: 'edit', entity: row });
            }}
          >
            <PencilIcon />
          </Button>
        )}
        {canToggleActive &&
          (resource.canToggle?.(row) ?? true) &&
          (row.isActive ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Desativar ${name}`}
              title="Desativar"
              className="text-muted-foreground hover:text-destructive"
              onClick={() => setConfirming(row)}
            >
              <PowerOffIcon />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Reativar ${name}`}
              title="Reativar"
              disabled={toggle.isPending}
              onClick={() => toggle.mutate({ entity: row, active: true })}
            >
              <PowerIcon />
            </Button>
          ))}
      </>
    );
  };

  const openCreate = () => {
    save.reset();
    setFormState({ mode: 'create' });
  };

  const empty = list.hasFilters ? (
    <EmptyState
      icon={SearchXIcon}
      title="Nenhum resultado"
      description="Nenhum cadastro corresponde à busca e aos filtros aplicados."
      action={
        <Button variant="outline" size="sm" onClick={list.clearFilters}>
          Limpar filtros
        </Button>
      }
    />
  ) : (
    <EmptyState
      icon={Icon}
      title={`Nenhum ${singular} cadastrado`}
      description={
        canWrite
          ? `Cadastre o primeiro para começar a usar ${plural} nas operações.`
          : `Quando houver ${plural} cadastrados, eles aparecerão aqui.`
      }
      action={
        canWrite && (
          <Button size="sm" onClick={openCreate}>
            <PlusIcon />
            {nav.newLabel}
          </Button>
        )
      }
    />
  );

  const editing = formState?.mode === 'edit' ? formState.entity : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={nav.label}
        description={nav.description}
        breadcrumbs={[{ label: resource.section ?? 'Cadastros' }, { label: nav.label }]}
        actions={
          canWrite && (
            <Button onClick={openCreate}>
              <PlusIcon />
              {nav.newLabel}
            </Button>
          )
        }
      />

      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <SearchInput
            value={params.q}
            onChange={list.setQuery}
            placeholder={resource.searchPlaceholder}
          />
          {resource.filters.map((filter) => (
            <FilterSelect
              key={filter.param}
              label={filter.label}
              allLabel={filter.allLabel}
              options={filter.options}
              value={params.filters[filter.param]}
              onChange={(value) => list.setFilter(filter.param, value)}
            />
          ))}
          <div className="flex items-center gap-2 sm:ml-auto">
            {query.isFetching && !query.isPending && (
              <Loader2Icon
                className="size-4 animate-spin text-muted-foreground"
                aria-label="Atualizando"
              />
            )}
            <StatusFilter value={params.status} onChange={list.setStatus} />
          </div>
        </div>

        <DataTable
          caption={`Lista de ${plural}`}
          columns={[...resource.columns, statusColumn]}
          rows={query.data?.data}
          isLoading={query.isPending}
          error={query.isError ? query.error : null}
          onRetry={() => void query.refetch()}
          sort={params.sort}
          onSortChange={list.setSort}
          empty={empty}
          isMuted={(row) => !row.isActive}
          rowActions={rowActions}
        />

        {query.data && query.data.meta.total > 0 && (
          <PaginationBar
            meta={query.data.meta}
            onPageChange={list.setPage}
            onPageSizeChange={list.setPageSize}
            disabled={query.isPlaceholderData}
          />
        )}
      </div>

      <Dialog
        open={formState !== null}
        onOpenChange={(open) => {
          if (!open && !save.isPending) setFormState(null);
        }}
      >
        <DialogContent className={resource.dialogClassName ?? 'sm:max-w-lg'}>
          <DialogHeader>
            <DialogTitle>{editing ? `Editar ${singular}` : nav.newLabel}</DialogTitle>
            <DialogDescription>
              {editing
                ? `Altere os dados de ${resource.describe(editing)}.`
                : `Preencha os dados do novo ${singular}. Campos com * são obrigatórios.`}
            </DialogDescription>
          </DialogHeader>
          {formState && (
            <div className="-mx-4 max-h-[65vh] overflow-y-auto px-4 py-1">
              <Form
                key={editing?.id ?? 'new'}
                entity={editing}
                formId={formId}
                onSubmit={(input) => save.mutateAsync(input)}
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormState(null)} disabled={save.isPending}>
              Cancelar
            </Button>
            <Button type="submit" form={formId} disabled={save.isPending}>
              {save.isPending && <Loader2Icon className="animate-spin" aria-hidden />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CatalogDetailSheet
        entity={viewing}
        title={viewing ? resource.describe(viewing) : ''}
        kind={capitalize(singular)}
        fields={viewing ? resource.details(viewing) : []}
        onClose={() => setViewing(null)}
        onEdit={
          canWrite && viewing
            ? () => {
                const entity = viewing;
                setViewing(null);
                save.reset();
                setFormState({ mode: 'edit', entity });
              }
            : undefined
        }
      />

      <ConfirmDialog
        open={confirming !== null}
        onOpenChange={(open) => !open && setConfirming(null)}
        title={`Desativar ${singular}?`}
        description={
          confirming && (
            <>
              <strong className="font-medium text-foreground">
                {resource.describe(confirming)}
              </strong>{' '}
              deixará de aparecer na lista de ativos e não poderá ser usado em novas operações. O
              histórico é mantido e você pode reativá-lo depois.
            </>
          )
        }
        confirmLabel="Desativar"
        destructive
        pending={toggle.isPending}
        onConfirm={() => confirming && toggle.mutate({ entity: confirming, active: false })}
      />
    </div>
  );
}
