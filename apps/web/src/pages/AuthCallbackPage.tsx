import { TriangleAlertIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '@/auth/auth-context';
import { FullPageLoader } from '@/components/FullPageLoader';
import { Button } from '@/components/ui/button';
import { getErrorMessage } from '@/lib/api';

/** Destino do redirect do Cognito (`VITE_COGNITO_REDIRECT_URI`). */
export function AuthCallbackPage() {
  const { completeLogin } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  // O `code` só pode ser trocado uma vez; o StrictMode executa efeitos duas vezes em dev.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    completeLogin()
      .then(() => navigate('/', { replace: true }))
      .catch((cause: unknown) => setError(getErrorMessage(cause)));
  }, [completeLogin, navigate]);

  if (!error) return <FullPageLoader label="Concluindo login…" />;

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 px-4 text-center">
      <TriangleAlertIcon className="size-8 text-destructive" aria-hidden />
      <h1 className="text-xl font-semibold">Não foi possível concluir o login</h1>
      <p className="max-w-md text-sm text-muted-foreground">{error}</p>
      <Button asChild variant="outline">
        <Link to="/login">Voltar para o login</Link>
      </Button>
    </div>
  );
}
