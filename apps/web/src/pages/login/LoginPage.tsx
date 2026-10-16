import { useMutation } from '@tanstack/react-query';
import {
  ClockAlertIcon,
  FlaskConicalIcon,
  GitForkIcon,
  LogInIcon,
  ShieldCheckIcon,
  SirenIcon,
  WarehouseIcon,
  type LucideIcon,
} from 'lucide-react';
import { Navigate, useLocation, type Location } from 'react-router';
import { toast } from 'sonner';
import { useAuth } from '@/auth/auth-context';
import { BrandMark } from '@/components/BrandMark';
import { FullPageLoader } from '@/components/FullPageLoader';
import { useDocumentTitle } from '@/components/layout/use-document-title';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
import { ThemeToggle } from '@/theme/ThemeToggle';
import { DevEmailForm } from './DevEmailForm';
import { DevUserPicker } from './DevUserPicker';

const DEFAULT_PATH = '/';

function redirectTarget(state: unknown): string {
  const from = (state as { from?: Location } | null)?.from;
  return from && from.pathname !== '/login'
    ? `${from.pathname}${from.search}${from.hash}`
    : DEFAULT_PATH;
}

const HIGHLIGHTS: Array<{ icon: LucideIcon; title: string; text: string }> = [
  {
    icon: WarehouseIcon,
    title: 'Estoque por lote',
    text: 'Saldo por local, razão imutável e estorno auditável.',
  },
  {
    icon: GitForkIcon,
    title: 'Rastreabilidade completa',
    text: 'Da fazenda à xícara: origem e destino de cada lote.',
  },
  {
    icon: SirenIcon,
    title: 'Recall em segundos',
    text: 'Quais clientes receberam um lote e todos os seus derivados.',
  },
];

export function LoginPage() {
  const { mode, status, login, sessionExpired } = useAuth();
  const location = useLocation();
  const target = redirectTarget(location.state);
  useDocumentTitle('Entrar');

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
        <div
          aria-hidden
          className="pointer-events-none absolute -top-32 -left-20 size-80 rounded-full bg-sidebar-primary/5 blur-3xl"
        />
        <BrandMark inverted />
        <div className="relative max-w-md space-y-8">
          <div className="space-y-4">
            <p className="text-xs font-medium tracking-[0.2em] text-sidebar-primary uppercase">
              Mini-ERP de café
            </p>
            <h2 className="text-4xl leading-[1.1] font-semibold tracking-tight text-balance text-sidebar-accent-foreground">
              Rastreabilidade do grão à xícara.
            </h2>
            <p className="text-sm leading-relaxed text-sidebar-foreground/80">
              Recebimento, estoque, torra, blend e expedição de lotes de café num só lugar — com a
              trilha completa para auditorias e recall.
            </p>
          </div>
          <ul className="space-y-4">
            {HIGHLIGHTS.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sidebar-accent text-sidebar-primary">
                  <Icon className="size-4" aria-hidden />
                </span>
                <div>
                  <p className="text-sm font-medium text-sidebar-accent-foreground">{title}</p>
                  <p className="text-sm text-sidebar-foreground/70">{text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-sidebar-muted">
          TraceFlow · rastreabilidade de lotes de café
        </p>
      </aside>

      <main className="relative flex items-center justify-center bg-background px-4 py-12">
        <div className="absolute top-3 right-3">
          <ThemeToggle />
        </div>
        <div className="w-full max-w-md space-y-6">
          <div className="space-y-2 text-center lg:hidden">
            <BrandMark className="justify-center" />
            <p className="text-sm text-muted-foreground">Rastreabilidade do grão à xícara.</p>
          </div>

          {sessionExpired && (
            <Alert>
              <ClockAlertIcon />
              <AlertTitle>Sua sessão expirou</AlertTitle>
              <AlertDescription>Entre novamente para continuar de onde parou.</AlertDescription>
            </Alert>
          )}

          {mode === 'mock' ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-xl">
                  <h1>Entrar</h1>
                </CardTitle>
                <CardDescription className="flex items-start gap-1.5">
                  <FlaskConicalIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  Ambiente de desenvolvimento: escolha um dos usuários de teste.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <DevUserPicker
                  pendingEmail={pendingEmail}
                  onSelect={(user) => mutation.mutate(user.email)}
                />
                <FieldSeparator className="*:data-[slot=field-separator-content]:bg-card">
                  ou informe um e-mail
                </FieldSeparator>
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
                  className="h-10 w-full"
                  onClick={() => mutation.mutate(undefined)}
                  disabled={mutation.isPending}
                >
                  <LogInIcon />
                  {mutation.isPending ? 'Redirecionando…' : 'Entrar com Amazon Cognito'}
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
