import { ArrowLeftIcon, CompassIcon, LayoutDashboardIcon } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { cn } from 'cn';
import { BrandMark } from '@/components/BrandMark';
import { useDocumentTitle } from '@/components/layout/use-document-title';
import { Button } from '@/components/ui/button';

/** 404: dentro do layout (usuário logado) ou em tela cheia (rotas públicas). */
export function NotFoundPage({ fullPage = false }: { fullPage?: boolean }) {
  const navigate = useNavigate();
  useDocumentTitle('Página não encontrada');

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-5 px-4 text-center',
        fullPage ? 'min-h-svh bg-background' : 'min-h-[60svh]',
      )}
    >
      {fullPage && <BrandMark className="mb-4" />}
      <div className="flex size-14 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
        <CompassIcon className="size-7" aria-hidden />
      </div>
      <div className="space-y-2">
        <p className="font-mono text-sm font-medium text-primary">Erro 404</p>
        <h1 className="text-2xl font-semibold tracking-tight">Página não encontrada</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          O endereço acessado não existe ou foi movido. Confira o link ou volte para o painel.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button variant="outline" onClick={() => void navigate(-1)}>
          <ArrowLeftIcon />
          Voltar
        </Button>
        <Button asChild>
          <Link to="/">
            <LayoutDashboardIcon />
            Ir para o painel
          </Link>
        </Button>
      </div>
    </div>
  );
}
