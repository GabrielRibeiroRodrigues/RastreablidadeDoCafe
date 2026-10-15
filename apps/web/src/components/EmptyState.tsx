import { RefreshCwIcon, ServerCrashIcon, WifiOffIcon, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from 'cn';
import { Button } from '@/components/ui/button';
import { ApiError, getErrorMessage } from '@/lib/api';

interface EmptyStateProps {
  icon?: LucideIcon;
  title?: ReactNode;
  description?: ReactNode;
  /** Ação principal (ex.: "Novo recebimento") ou "Limpar filtros". */
  action?: ReactNode;
  /** Conteúdo livre abaixo da descrição. */
  children?: ReactNode;
  /** Moldura tracejada (fora de tabelas). */
  bordered?: boolean;
  className?: string;
}

/** Estado vazio: ícone, título, texto de ajuda e ação principal. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  children,
  bordered = false,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-3 px-4 text-center text-sm text-muted-foreground',
        bordered && 'rounded-xl border border-dashed bg-card/50 py-12',
        className,
      )}
    >
      {Icon && (
        <div className="flex size-11 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <Icon className="size-5" aria-hidden />
        </div>
      )}
      {(title || description) && (
        <div className="max-w-md space-y-1">
          {title && <p className="text-base font-medium text-foreground">{title}</p>}
          {description && <p className="text-pretty">{description}</p>}
        </div>
      )}
      {children}
      {action && <div className="flex flex-wrap justify-center gap-2 pt-1">{action}</div>}
    </div>
  );
}

/** Falha ao carregar: mensagem amigável, ID da requisição (suporte) e "Tentar novamente". */
export function ErrorState({
  error,
  onRetry,
  title = 'Não foi possível carregar os dados',
  bordered = true,
  className,
}: {
  error: unknown;
  onRetry?: () => void;
  title?: string;
  bordered?: boolean;
  className?: string;
}) {
  const offline = error instanceof ApiError && error.isNetworkError;
  const requestId = error instanceof ApiError && error.status >= 500 ? error.requestId : null;
  return (
    <div role="alert">
      <EmptyState
        icon={offline ? WifiOffIcon : ServerCrashIcon}
        title={offline ? 'Sem conexão com o servidor' : title}
        description={getErrorMessage(error)}
        bordered={bordered}
        className={className}
        action={
          onRetry && (
            <Button variant="outline" size="sm" onClick={onRetry}>
              <RefreshCwIcon />
              Tentar novamente
            </Button>
          )
        }
      >
        {requestId && !getErrorMessage(error).includes(requestId) && (
          <p className="font-mono text-xs">ID da requisição: {requestId}</p>
        )}
      </EmptyState>
    </div>
  );
}
