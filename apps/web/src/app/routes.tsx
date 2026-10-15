import { Navigate, type RouteObject } from 'react-router';
import { ProtectedRoute } from '@/auth/ProtectedRoute';
import { AppLayout } from '@/components/layout/AppLayout';
import { AuthCallbackPage } from '@/pages/AuthCallbackPage';
import { LoginPage } from '@/pages/login/LoginPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { PlaceholderPage } from '@/pages/PlaceholderPage';
import { NAV_ITEMS } from './navigation';

export const routes: RouteObject[] = [
  { path: '/login', element: <LoginPage /> },
  { path: '/auth/callback', element: <AuthCallbackPage /> },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <Navigate to={NAV_ITEMS[0]?.path ?? '/produtos'} replace /> },
          ...NAV_ITEMS.map((item) => ({
            path: item.path,
            element: <PlaceholderPage item={item} />,
          })),
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
];
