import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { routes } from '@/app/routes';
import { AuthProvider } from '@/auth/AuthProvider';
import type { AuthStrategy } from '@/auth/types';
import { Toaster } from '@/components/ui/sonner';

/** Renderiza o app inteiro (rotas reais) em memória, com a estratégia de auth informada. */
export function renderApp({ path = '/', strategy }: { path?: string; strategy?: AuthStrategy }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createMemoryRouter(routes, { initialEntries: [path] });

  const utils = render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider {...(strategy ? { strategy } : {})}>
        <RouterProvider router={router} />
      </AuthProvider>
      <Toaster />
    </QueryClientProvider>,
  );

  return { ...utils, router };
}
