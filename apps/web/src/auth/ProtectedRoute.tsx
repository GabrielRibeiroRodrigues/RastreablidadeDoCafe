import { Navigate, Outlet, useLocation } from 'react-router';
import { FullPageLoader } from '@/components/FullPageLoader';
import { useAuth } from './auth-context';

/** Envolve rotas privadas: espera a sessão ser restaurada e manda para `/login` se não houver. */
export function ProtectedRoute() {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <FullPageLoader label="Verificando sessão…" />;
  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return <Outlet />;
}
