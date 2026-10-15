import { QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { createBrowserRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { AuthProvider } from '@/auth/AuthProvider';
import { AppErrorBoundary } from '@/components/AppErrorBoundary';
import { NetworkStatus } from '@/components/NetworkStatus';
import { Toaster } from '@/components/ui/sonner';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { createQueryClient } from './query-client';
import { routes } from './routes';

export function App() {
  const [queryClient] = useState(createQueryClient);
  const [router] = useState(() => createBrowserRouter(routes));

  return (
    <AppErrorBoundary>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <RouterProvider router={router} />
          </AuthProvider>
          <Toaster position="top-right" richColors closeButton />
          <NetworkStatus />
        </QueryClientProvider>
      </ThemeProvider>
    </AppErrorBoundary>
  );
}
