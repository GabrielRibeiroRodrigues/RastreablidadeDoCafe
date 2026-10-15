import { useQuery } from '@tanstack/react-query';
import {
  Building2Icon,
  ChevronRightIcon,
  Loader2Icon,
  RefreshCwIcon,
  ServerCrashIcon,
} from 'lucide-react';
import type { Role } from '@traceflow/shared';
import { cn } from 'cn';
import { ROLE_LABELS } from '@/auth/roles';
import { fetchDevUsers, type DevUser } from '@/auth/strategies/mock';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { getEnv } from '@/config/env';
import { ApiError, getErrorMessage } from '@/lib/api';

interface DevUserPickerProps {
  onSelect: (user: DevUser) => void;
  /** E-mail do usuário cujo login está em andamento. */
  pendingEmail: string | null;
}

const ROLE_STYLES: Record<Role, string> = {
  admin: 'bg-primary/10 text-primary dark:bg-primary/20',
  operator: 'bg-info/10 text-info',
  auditor: 'bg-muted text-muted-foreground',
};

/** O que cada perfil pode fazer (ajuda a escolher o usuário de teste). */
const ROLE_HINTS: Record<Role, string> = {
  admin: 'acesso total',
  operator: 'opera o estoque',
  auditor: 'somente leitura',
};

function groupByCompany(users: DevUser[]): Array<[string, DevUser[]]> {
  const groups = new Map<string, DevUser[]>();
  for (const user of users) {
    const list = groups.get(user.companyName) ?? [];
    list.push(user);
    groups.set(user.companyName, list);
  }
  return [...groups.entries()];
}

export function DevUserPicker({ onSelect, pendingEmail }: DevUserPickerProps) {
  const query = useQuery({
    queryKey: ['dev-users'],
    queryFn: ({ signal }) => fetchDevUsers(signal),
    retry: false,
    staleTime: Infinity,
  });

  if (query.isPending) {
    return (
      <div className="space-y-2" role="status" aria-label="Carregando usuários">
        {[0, 1, 2].map((key) => (
          <Skeleton key={key} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (query.isError) {
    const offline = query.error instanceof ApiError && query.error.isNetworkError;
    return (
      <Alert variant="destructive">
        <ServerCrashIcon />
        <AlertTitle>
          {offline ? 'API indisponível' : 'Não foi possível carregar os usuários'}
        </AlertTitle>
        <AlertDescription>
          <p>
            {offline
              ? `Não conseguimos falar com a API em ${getEnv().apiUrl}. Suba a API com AUTH_MODE=mock e tente novamente.`
              : getErrorMessage(query.error)}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => void query.refetch()}
            disabled={query.isFetching}
          >
            <RefreshCwIcon className={query.isFetching ? 'animate-spin' : undefined} />
            Tentar novamente
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (query.data.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        Nenhum usuário de desenvolvimento cadastrado. Rode o seed da API.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {groupByCompany(query.data).map(([company, users]) => (
        <section key={company} aria-label={company} className="space-y-2">
          <h2 className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            <Building2Icon className="size-3.5" aria-hidden />
            {company}
          </h2>
          <ul className="space-y-2">
            {users.map((user) => {
              const pending = pendingEmail === user.email;
              return (
                <li key={user.email}>
                  <button
                    type="button"
                    onClick={() => onSelect(user)}
                    disabled={pendingEmail !== null}
                    className="group flex w-full items-center gap-3 rounded-lg border bg-card px-4 py-3 text-left transition-colors hover:border-primary/40 hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-medium">{user.name}</span>
                        {user.roles.map((role) => (
                          <Badge
                            key={role}
                            variant="secondary"
                            className={cn('text-[0.7rem]', ROLE_STYLES[role])}
                          >
                            {ROLE_LABELS[role]}
                          </Badge>
                        ))}
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {user.email}
                        {user.roles[0] && <> · {ROLE_HINTS[user.roles[0]]}</>}
                      </p>
                    </div>
                    {pending ? (
                      <Loader2Icon
                        className="size-4 animate-spin text-muted-foreground"
                        aria-hidden
                      />
                    ) : (
                      <ChevronRightIcon
                        className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                        aria-hidden
                      />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
