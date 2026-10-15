import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

/**
 * Última barreira: erro fora das rotas (providers). Os erros de página são tratados pelo
 * `RouteErrorPage` do React Router, que mantém o layout.
 */
export class AppErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Erro não tratado no app', error, info.componentStack);
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <div
        role="alert"
        className="flex min-h-svh flex-col items-center justify-center gap-4 bg-background px-4 text-center text-foreground"
      >
        <h1 className="text-2xl font-semibold tracking-tight">Algo deu errado</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          O TraceFlow encontrou um erro inesperado. Recarregue a página; se o problema continuar,
          informe o suporte.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="h-9 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/85 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          Recarregar
        </button>
      </div>
    );
  }
}
