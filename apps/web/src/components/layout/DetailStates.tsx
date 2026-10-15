import { FileQuestionIcon } from 'lucide-react';
import { Link } from 'react-router';
import { EmptyState, ErrorState } from '@/components/EmptyState';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api';
import { Breadcrumbs, PageHeaderSkeleton, type Breadcrumb } from './PageHeader';
import { useDocumentTitle } from './use-document-title';

/** Página de detalhe carregando: trilha (para voltar) + esqueleto do cabeçalho e dos cartões. */
export function DetailPageSkeleton({
  breadcrumbs,
  cards = 3,
}: {
  breadcrumbs: Breadcrumb[];
  cards?: number;
}) {
  return (
    <div className="space-y-6" role="status" aria-label="Carregando">
      <PageHeaderSkeleton breadcrumbs={breadcrumbs} />
      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: cards }, (_, index) => (
          <Skeleton key={index} className="h-40 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}

/**
 * Falha ao abrir um registro. 404 (inexistente ou de outra empresa — a API não distingue) vira
 * "não encontrado" com atalho para a listagem; os demais erros, mensagem + "Tentar novamente".
 */
export function DetailPageError({
  breadcrumbs,
  error,
  onRetry,
  entity,
  backTo,
  backLabel,
}: {
  breadcrumbs: Breadcrumb[];
  error: unknown;
  onRetry: () => void;
  /** Ex.: "Lote", "Ordem de produção". */
  entity: string;
  backTo: string;
  backLabel: string;
}) {
  const notFound = error instanceof ApiError && error.status === 404;
  useDocumentTitle(notFound ? `${entity} não encontrado(a)` : 'Erro');

  return (
    <div className="space-y-6">
      <Breadcrumbs items={breadcrumbs} />
      {notFound ? (
        <EmptyState
          bordered
          icon={FileQuestionIcon}
          title={`${entity} não encontrado(a)`}
          description="O registro não existe ou não pertence à sua empresa. Confira o link ou volte para a listagem."
          action={
            <Button variant="outline" asChild>
              <Link to={backTo}>{backLabel}</Link>
            </Button>
          }
        />
      ) : (
        <ErrorState
          error={error}
          onRetry={onRetry}
          title={`Não foi possível carregar: ${entity.toLowerCase()}`}
        />
      )}
    </div>
  );
}
