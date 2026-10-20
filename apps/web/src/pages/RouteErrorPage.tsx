import { LayoutDashboardIcon, RefreshCwIcon, TriangleAlertIcon } from 'lucide-react';
import { useEffect } from 'react';
import { isRouteErrorResponse, Link, useNavigate, useRouteError } from 'react-router';
import { cn } from 'cn';
import { BrandMark } from '@/components/BrandMark';
import { useDocumentTitle } from '@/components/layout/use-document-title';
import { Button } from '@/components/ui/button';
import { ApiError, getErrorMessage } from '@/lib/api';
import { reportClientError } from '@/lib/error-reporting';
import { NotFoundPage } from './NotFoundPage';

/** Chunk de uma página que sumiu do servidor (deploy novo com a aba aberta) ou falha de rede. */
function isChunkLoadError(error: unknown): boolean {
  return (
    error instanceof Error &&
    /dynamically imported module|Importing a module script failed|error loading dynamically imported module|Failed to fetch/i.test(
      error.message,
    )
  );
}

/**
 * Erro inesperado ao renderizar uma rota (error boundary do React Router). Mostra uma mensagem
 * amigável, o ID da requisição (quando veio da API) e permite tentar de novo sem perder o layout.
 */
export function RouteErrorPage({ fullPage = false }: { fullPage?: boolean }) {
  const error = useRouteError();
  const navigate = useNavigate();
  useDocumentTitle('Erro');

  useEffect(() => {
    // 404 e erros de negócio da API já são conhecidos (e a API registra os 5xx): só o inesperado.
    if (isRouteErrorResponse(error) || error instanceof ApiError) return;
    reportClientError('route', error);
  }, [error]);

  if (isRouteErrorResponse(error) && error.status === 404) {
    return <NotFoundPage fullPage={fullPage} />;
  }

  const chunk = isChunkLoadError(error);
  const requestId = error instanceof ApiError ? error.requestId : null;
  const message = chunk
    ? 'Uma nova versão do TraceFlow foi publicada ou a conexão caiu enquanto a página carregava. Recarregue para continuar.'
    : error instanceof ApiError
      ? getErrorMessage(error)
      : 'Ocorreu um erro inesperado ao exibir esta página. Tente novamente; se o problema continuar, informe o suporte.';

  const retry = () => {
    // Chunk ausente só se resolve recarregando; nos demais casos, navegar limpa o erro da rota.
    if (chunk) window.location.reload();
    else void navigate('.', { replace: true });
  };

  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center gap-5 px-4 text-center',
        fullPage ? 'min-h-svh bg-background' : 'min-h-[60svh]',
      )}
    >
      {fullPage && <BrandMark className="mb-4" />}
      <div className="flex size-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
        <TriangleAlertIcon className="size-7" aria-hidden />
      </div>
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          {chunk ? 'Atualização disponível' : 'Algo deu errado'}
        </h1>
        <p className="max-w-md text-sm text-pretty text-muted-foreground">{message}</p>
        {requestId && (
          <p className="font-mono text-xs text-muted-foreground">ID da requisição: {requestId}</p>
        )}
        {import.meta.env.DEV && error instanceof Error && !chunk && (
          <pre className="mx-auto mt-3 max-h-40 max-w-2xl overflow-auto rounded-lg bg-muted p-3 text-left text-xs">
            {error.stack ?? error.message}
          </pre>
        )}
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button onClick={retry}>
          <RefreshCwIcon />
          {chunk ? 'Recarregar' : 'Tentar novamente'}
        </Button>
        <Button variant="outline" asChild>
          <Link to="/" reloadDocument={fullPage}>
            <LayoutDashboardIcon />
            Ir para o painel
          </Link>
        </Button>
      </div>
    </div>
  );
}
