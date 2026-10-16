import { QueryCache, QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api';

export function createQueryClient(): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({
      // Falha de rede (API fora do ar, sem internet): um único toast, mesmo com várias consultas.
      // Os demais erros são exibidos por cada tela, no lugar dos dados.
      onError: (error) => {
        if (error instanceof ApiError && error.isNetworkError) {
          toast.error('Não foi possível conectar ao servidor', {
            id: 'network-error',
            description: 'Verifique sua conexão. Os dados serão recarregados ao tentar de novo.',
          });
        }
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        // Erros 4xx (validação, 404 de outra empresa, 401) não melhoram com retry.
        retry: (failureCount, error) =>
          failureCount < 2 &&
          !(error instanceof ApiError && error.status >= 400 && error.status < 500),
      },
    },
  });
}
