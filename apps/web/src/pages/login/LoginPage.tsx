import { useMutation } from '@tanstack/react-query';
import { LogInIcon, ShieldCheckIcon } from 'lucide-react';
import { Navigate, useLocation, type Location } from 'react-router';
import { toast } from 'sonner';
import { useAuth } from '@/auth/auth-context';
import { BrandMark } from '@/components/BrandMark';
import { FullPageLoader } from '@/components/FullPageLoader';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { FieldSeparator } from '@/components/ui/field';
import { getErrorMessage } from '@/lib/api';
import { DevEmailForm } from './DevEmailForm';
import { DevUserPicker } from './DevUserPicker';

const DEFAULT_PATH = '/produtos';

function redirectTarget(state: unknown): string {
  const from = (state as { from?: Location } | null)?.from;
  return from && from.pathname !== '/login' ? `${from.pathname}${from.search}` : DEFAULT_PATH;
}

export function LoginPage() {
  const { mode, status, login } = useAuth();
  const location = useLocation();
  const target = redirectTarget(location.state);

  // Mock: o login devolve a sessão e o <Navigate> abaixo leva ao destino.
  // Cognito: o navegador é redirecionado para o Hosted UI.
  const mutation = useMutation({
    mutationFn: (email?: string) => login(email),
    onError: (error) =>
      toast.error('Não foi possível entrar', { description: getErrorMessage(error) }),
  });

  if (status === 'loading') return <FullPageLoader label="Verificando sessão…" />;
  if (status === 'authenticated') return <Navigate to={target} replace />;

  const pendingEmail = mutation.isPending ? (mutation.variables ?? '') : null;

  return (
    <div className="grid min-h-svh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-sidebar p-10 text-sidebar-foreground lg:flex">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -bottom-24 size-[28rem] rounded-full bg-sidebar-primary/10 blur-3xl"
        />
        <BrandMark inverted />
        <div className="relative max-w-md space-y-4">
          <h2 className="text-3xl leading-tight font-semibold tracking-tight text-sidebar-accent-foreground">
            Rastreabilidade do grão à xícara.
          </h2>
          <p className="text-sm leading-relaxed text-sidebar-foreground/75">
            Recebimento, estoque, torra, blend e expedição de lotes de café — e o recall que
            descobre em segundos quais clientes receberam cada lote.
          </p>
        </div>
        <p className="relative text-xs text-sidebar-muted">TraceFlow · projeto de portfólio</p>
      </aside>

      <main className="flex items-center justify-center bg-background px-4 py-12">
        <div className="w-full max-w-md space-y-6">
          <BrandMark className="justify-center lg:hidden" />

          {mode === 'mock' ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-xl">
                  <h1>Entrar</h1>
                </CardTitle>
                <CardDescription>
                  Ambiente de desenvolvimento: escolha um dos usuários de teste.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <DevUserPicker
                  pendingEmail={pendingEmail}
                  onSelect={(user) => mutation.mutate(user.email)}
                />
                <FieldSeparator>ou informe um e-mail</FieldSeparator>
                <DevEmailForm
                  disabled={mutation.isPending}
                  onSubmit={(email) => mutation.mutate(email)}
                />
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-xl">
                  <h1>Entrar</h1>
                </CardTitle>
                <CardDescription>
                  Você será redirecionado para a página de login segura da sua empresa.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  size="lg"
                  className="w-full"
                  onClick={() => mutation.mutate(undefined)}
                  disabled={mutation.isPending}
                >
                  <LogInIcon />
                  Entrar com Amazon Cognito
                </Button>
              </CardContent>
              <CardFooter className="gap-2 text-xs text-muted-foreground">
                <ShieldCheckIcon className="size-4" aria-hidden />
                Autenticação via OAuth 2.0 com PKCE.
              </CardFooter>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
