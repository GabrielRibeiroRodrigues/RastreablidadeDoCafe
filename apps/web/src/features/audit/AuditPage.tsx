import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  ChevronDownIcon,
  ChevronRightIcon,
  Loader2Icon,
  LockIcon,
  ScrollTextIcon,
  SearchXIcon,
  XIcon,
} from 'lucide-react';
import { Fragment, useState } from 'react';
import { Link } from 'react-router';
import { cn } from 'cn';
import { useQualityPermissions } from '@/auth/permissions';
import { FilterSelect } from '@/components/catalog/FilterSelect';
import { PaginationBar } from '@/components/catalog/PaginationBar';
import { PeriodFilter } from '@/components/catalog/PeriodFilter';
import { useListParams, type ListParamsConfig } from '@/components/catalog/use-list-params';
import { EmptyState, ErrorState } from '@/components/EmptyState';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { isDateParam, isUuid } from '@/features/inventory/url-filters';
import { formatDateTime, startOfLocalDayIso } from '@/lib/quantity';
import { useIsMobile } from '@/lib/use-media-query';
import { auditApi, type AuditLog, type AuditLogsQuery } from './api';
import { AuditDiff } from './AuditDiff';
import {
  actionLabel,
  AUDIT_ACTION_GROUPS,
  AUDIT_ACTION_LABELS,
  AUDIT_ENTITY_FILTER,
  entityHref,
  entityLabel,
} from './labels';

const isKey = (value: string) => /^[a-z_.-]{1,60}$/.test(value);

const LIST_CONFIG: ListParamsConfig = {
  sorts: [''],
  defaultSort: '',
  filters: {
    entityType: isKey,
    action: isKey,
    userId: isUuid,
    entityId: (value) => value.length <= 64,
    from: isDateParam,
    to: isDateParam,
  },
};

const CRUMBS = [{ label: 'Qualidade' }, { label: 'Auditoria' }];

const ACTION_OPTIONS = [
  ...Object.entries(AUDIT_ACTION_GROUPS).map(([value, label]) => ({ value, label })),
  ...Object.entries(AUDIT_ACTION_LABELS)
    .filter(([value]) => !value.startsWith('http.') || value === 'http.post')
    .map(([value, label]) => ({
      value,
      label: value === 'http.post' ? 'Criação (genérica)' : label,
    })),
];

/** Usuários vistos nas entradas mais recentes (a API não tem listagem de usuários). */
function useAuditUsers() {
  return useQuery({
    queryKey: ['audit-logs', 'users'],
    queryFn: async ({ signal }) => {
      const page = await auditApi.list({ pageSize: 100 }, signal);
      const users = new Map<string, string>();
      for (const log of page.data) if (log.user) users.set(log.user.id, log.user.name);
      return [...users].map(([value, label]) => ({ value, label }));
    },
    staleTime: 5 * 60_000,
  });
}

function EntityCell({ log }: { log: AuditLog }) {
  const href = entityHref(log.entityType, log.entityId);
  return (
    <div className="min-w-0">
      <div>{entityLabel(log.entityType)}</div>
      {log.entityId &&
        (href ? (
          <Link
            to={href}
            className="font-mono text-[0.7rem] text-primary underline-offset-4 hover:underline"
          >
            Abrir registro
          </Link>
        ) : (
          <span
            className="block max-w-40 truncate font-mono text-[0.7rem] text-muted-foreground"
            title={log.entityId}
          >
            {log.entityId}
          </span>
        ))}
    </div>
  );
}

function ActionBadge({ action }: { action: string }) {
  const known = action in AUDIT_ACTION_LABELS;
  return (
    <Badge
      variant={action.startsWith('http.') ? 'outline' : 'secondary'}
      className={cn(!known && 'font-mono')}
      title={action}
    >
      {actionLabel(action)}
    </Badge>
  );
}

function Details({ log }: { log: AuditLog }) {
  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
      <AuditDiff before={log.before} after={log.after} />
      <dl className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
        <div>
          <dt className="inline">Ação: </dt>
          <dd className="inline font-mono">{log.action}</dd>
        </div>
        {log.entityId && (
          <div>
            <dt className="inline">ID: </dt>
            <dd className="inline font-mono break-all">{log.entityId}</dd>
          </div>
        )}
        {log.requestId && (
          <div>
            <dt className="inline">Requisição: </dt>
            <dd className="inline font-mono break-all">{log.requestId}</dd>
          </div>
        )}
        {log.ip && (
          <div>
            <dt className="inline">IP: </dt>
            <dd className="inline font-mono">{log.ip}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}

export function AuditPage() {
  const { canViewAudit } = useQualityPermissions();
  const isMobile = useIsMobile();
  const list = useListParams(LIST_CONFIG);
  const { params } = list;
  const { entityType, action, userId, entityId, from, to } = params.filters;
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const users = useAuditUsers();

  const query = useQuery({
    queryKey: ['audit-logs', 'list', params],
    queryFn: ({ signal }) => {
      const apiQuery: AuditLogsQuery = {
        page: params.page,
        pageSize: params.pageSize,
        ...(entityType ? { entityType } : {}),
        ...(action ? { action } : {}),
        ...(userId ? { userId } : {}),
        ...(entityId ? { entityId } : {}),
        ...(from ? { from: startOfLocalDayIso(from) } : {}),
        ...(to ? { to: startOfLocalDayIso(to, 1) } : {}),
      };
      return auditApi.list(apiQuery, signal);
    },
    placeholderData: keepPreviousData,
    enabled: canViewAudit,
  });

  if (!canViewAudit) {
    return (
      <div className="space-y-6">
        <PageHeader title="Auditoria" breadcrumbs={CRUMBS} />
        <EmptyState
          bordered
          icon={LockIcon}
          title="Acesso restrito"
          description="A trilha de auditoria é visível para administradores e auditores."
        />
      </div>
    );
  }

  const toggle = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const rows = query.data?.data ?? [];
  const hasFilters = Object.keys(params.filters).length > 0;
  const userName = (id: string) =>
    users.data?.find((u) => u.value === id)?.label ??
    rows.find((r) => r.user?.id === id)?.user?.name;

  const empty = hasFilters ? (
    <EmptyState
      icon={SearchXIcon}
      title="Nenhuma entrada encontrada"
      description="Nenhum registro de auditoria corresponde aos filtros."
      action={
        <Button variant="outline" size="sm" onClick={list.clearFilters}>
          Limpar filtros
        </Button>
      }
    />
  ) : (
    <EmptyState
      icon={ScrollTextIcon}
      title="Trilha vazia"
      description="Cada operação de escrita (recebimento, movimentação, recall…) gera uma entrada aqui."
    />
  );

  const userButton = (log: AuditLog) =>
    log.user ? (
      <button
        type="button"
        className="text-left underline-offset-4 hover:underline"
        title="Filtrar por este usuário"
        onClick={() => log.user && list.setFilter('userId', log.user.id)}
      >
        {log.user.name}
      </button>
    ) : (
      <span className="text-muted-foreground italic">Sistema (job)</span>
    );

  let body;
  if (query.isPending) {
    body = (
      <div className="space-y-2 p-4" aria-busy>
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    );
  } else if (query.isError) {
    body = (
      <div className="py-10">
        <ErrorState
          error={query.error}
          onRetry={() => void query.refetch()}
          title="Não foi possível carregar a auditoria"
          bordered={false}
        />
      </div>
    );
  } else if (rows.length === 0) {
    body = <div className="py-12">{empty}</div>;
  } else if (isMobile) {
    body = (
      <ul aria-label="Entradas de auditoria" className="divide-y">
        {rows.map((log) => {
          const open = expanded.has(log.id);
          return (
            <li key={log.id} className="space-y-2 p-4 text-sm">
              <div className="flex items-start justify-between gap-2">
                <ActionBadge action={log.action} />
                <span className="text-xs text-muted-foreground tabular-nums">
                  {formatDateTime(log.createdAt)}
                </span>
              </div>
              <div className="flex items-start justify-between gap-3">
                <EntityCell log={log} />
                <div className="text-right">{userButton(log)}</div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="-ml-2"
                aria-expanded={open}
                onClick={() => toggle(log.id)}
              >
                {open ? <ChevronDownIcon /> : <ChevronRightIcon />}
                {open ? 'Ocultar detalhes' : 'Ver antes/depois'}
              </Button>
              {open && <Details log={log} />}
            </li>
          );
        })}
      </ul>
    );
  } else {
    body = (
      <Table aria-busy={query.isFetching} containerClassName="max-h-[calc(100svh-15rem)] min-h-40">
        <caption className="sr-only">Entradas de auditoria</caption>
        <TableHeader className="sticky top-0 z-10 bg-muted/95 backdrop-blur supports-backdrop-filter:bg-muted/80">
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-8 px-3">
              <span className="sr-only">Expandir</span>
            </TableHead>
            <TableHead className="px-3 text-xs">Data</TableHead>
            <TableHead className="px-3 text-xs">Usuário</TableHead>
            <TableHead className="px-3 text-xs">Ação</TableHead>
            <TableHead className="px-3 text-xs">Registro</TableHead>
            <TableHead className="px-3 text-xs">Requisição</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((log) => {
            const open = expanded.has(log.id);
            return (
              <Fragment key={log.id}>
                <TableRow
                  className={cn('cursor-pointer', open && 'bg-muted/40')}
                  onClick={(event) => {
                    // Cliques em links e botões internos não expandem a linha.
                    if ((event.target as HTMLElement).closest('a,button')) return;
                    toggle(log.id);
                  }}
                >
                  <TableCell className="px-3 py-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      aria-expanded={open}
                      aria-label={open ? 'Ocultar antes/depois' : 'Ver antes/depois'}
                      onClick={() => toggle(log.id)}
                    >
                      {open ? <ChevronDownIcon /> : <ChevronRightIcon />}
                    </Button>
                  </TableCell>
                  <TableCell className="px-3 py-2 tabular-nums">
                    {formatDateTime(log.createdAt)}
                  </TableCell>
                  <TableCell className="px-3 py-2">{userButton(log)}</TableCell>
                  <TableCell className="px-3 py-2">
                    <ActionBadge action={log.action} />
                  </TableCell>
                  <TableCell className="px-3 py-2">
                    <EntityCell log={log} />
                  </TableCell>
                  <TableCell className="px-3 py-2">
                    <span
                      className="block max-w-36 truncate font-mono text-xs text-muted-foreground"
                      title={log.requestId ?? undefined}
                    >
                      {log.requestId ?? '—'}
                    </span>
                  </TableCell>
                </TableRow>
                {open && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={6} className="px-3 pt-0 pb-3 whitespace-normal">
                      <Details log={log} />
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Auditoria"
        breadcrumbs={CRUMBS}
        description="Quem fez o quê e quando: cada escrita gera uma entrada imutável, com o estado antes e depois. Clique numa linha para ver as diferenças."
      />

      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <FilterSelect
            label="Tipo de registro"
            allLabel="Todos os registros"
            options={Object.entries(AUDIT_ENTITY_FILTER).map(([value, label]) => ({
              value,
              label,
            }))}
            value={entityType}
            onChange={(value) => list.setFilter('entityType', value)}
          />
          <FilterSelect
            label="Ação"
            allLabel="Todas as ações"
            options={ACTION_OPTIONS}
            value={action}
            onChange={(value) => list.setFilter('action', value)}
          />
          <FilterSelect
            label="Usuário"
            allLabel="Todos os usuários"
            options={
              userId && !users.data?.some((u) => u.value === userId)
                ? [...(users.data ?? []), { value: userId, label: userName(userId) ?? 'Usuário' }]
                : (users.data ?? [])
            }
            value={userId}
            onChange={(value) => list.setFilter('userId', value)}
          />
          <PeriodFilter
            from={from}
            to={to}
            onChange={(name, value) => list.setFilter(name, value)}
          />
          {query.isFetching && !query.isPending && (
            <Loader2Icon
              className="size-4 animate-spin text-muted-foreground sm:ml-auto"
              aria-label="Atualizando"
            />
          )}
        </div>
        {entityId && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Registro:</span>
            <Badge variant="secondary" className="font-mono">
              {entityId}
              <button
                type="button"
                aria-label="Remover filtro de registro"
                onClick={() => list.setFilter('entityId', null)}
              >
                <XIcon className="size-3" />
              </button>
            </Badge>
          </div>
        )}

        <div className="overflow-hidden rounded-xl border bg-card">{body}</div>

        {query.data && query.data.meta.total > 0 && (
          <PaginationBar
            meta={query.data.meta}
            onPageChange={list.setPage}
            onPageSizeChange={list.setPageSize}
            disabled={query.isPlaceholderData}
          />
        )}
      </div>
    </div>
  );
}
