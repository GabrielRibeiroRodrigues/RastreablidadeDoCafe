import { ChevronRightIcon } from 'lucide-react';
import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router';
import { cn } from 'cn';
import { Skeleton } from '@/components/ui/skeleton';
import { useDocumentTitle } from './use-document-title';

export interface Breadcrumb {
  label: string;
  /** Sem `to`: item atual (último). */
  to?: string;
}

export function Breadcrumbs({ items }: { items: Breadcrumb[] }) {
  if (items.length === 0) return null;
  return (
    <nav aria-label="Trilha de navegação">
      <ol className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
        {items.map((item, index) => (
          <Fragment key={`${item.label}-${index}`}>
            {index > 0 && (
              <li aria-hidden className="flex">
                <ChevronRightIcon className="size-3.5 opacity-60" />
              </li>
            )}
            <li className="min-w-0">
              {item.to ? (
                <Link
                  to={item.to}
                  className="rounded-sm transition-colors hover:text-foreground focus-visible:text-foreground"
                >
                  {item.label}
                </Link>
              ) : (
                <span aria-current="page" className="block truncate font-medium text-foreground">
                  {item.label}
                </span>
              )}
            </li>
          </Fragment>
        ))}
      </ol>
    </nav>
  );
}

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  /** Trilha acima do título (o último item é a página atual). */
  breadcrumbs?: Breadcrumb[];
  /** Botões à direita do título. */
  actions?: ReactNode;
  /** Selos ao lado do título (status, etapa...). */
  badges?: ReactNode;
  /** Texto de `document.title`; padrão: o título, quando for texto. */
  documentTitle?: string;
  /** Título em fonte monoespaçada (códigos como CAF-2026-000013). */
  mono?: boolean;
  className?: string;
}

/**
 * Cabeçalho padrão de toda página autenticada: trilha, título (h1), descrição, selos e ações.
 * Também define o `document.title` ("Lotes · TraceFlow").
 */
export function PageHeader({
  title,
  description,
  breadcrumbs,
  actions,
  badges,
  documentTitle,
  mono = false,
  className,
}: PageHeaderProps) {
  useDocumentTitle(documentTitle ?? (typeof title === 'string' ? title : null));

  return (
    <header className={cn('space-y-3', className)}>
      {breadcrumbs && <Breadcrumbs items={breadcrumbs} />}
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        {/* `basis-72`: no celular as ações descem para baixo do título em vez de espremê-lo. */}
        <div className="min-w-0 flex-1 basis-72 space-y-1.5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1
              className={cn(
                'text-2xl leading-tight font-semibold tracking-tight text-balance',
                mono && 'font-mono',
              )}
            >
              {title}
            </h1>
            {badges}
          </div>
          {description && (
            <div className="max-w-3xl text-sm text-pretty text-muted-foreground">{description}</div>
          )}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

/** Cabeçalho enquanto o registro carrega (mantém a trilha para o usuário poder voltar). */
export function PageHeaderSkeleton({ breadcrumbs }: { breadcrumbs?: Breadcrumb[] }) {
  return (
    <div className="space-y-3" aria-hidden>
      {breadcrumbs && <Breadcrumbs items={breadcrumbs} />}
      <Skeleton className="h-8 w-72 max-w-full" />
      <Skeleton className="h-4 w-96 max-w-full" />
    </div>
  );
}
