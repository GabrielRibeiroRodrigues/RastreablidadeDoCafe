import { Navigate, type RouteObject } from 'react-router';
import { ProtectedRoute } from '@/auth/ProtectedRoute';
import { CatalogPage } from '@/components/catalog/CatalogPage';
import { AppLayout } from '@/components/layout/AppLayout';
import { customersResource } from '@/features/customers/resource';
import { locationsResource } from '@/features/locations/resource';
import { productsResource } from '@/features/products/resource';
import { suppliersResource } from '@/features/suppliers/resource';
import { AuthCallbackPage } from '@/pages/AuthCallbackPage';
import { LoginPage } from '@/pages/login/LoginPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
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
          // `key` separa o estado (diálogos, busca digitada) de cada tela.
          {
            path: productsResource.nav.path,
            element: <CatalogPage key="products" resource={productsResource} />,
          },
          {
            path: suppliersResource.nav.path,
            element: <CatalogPage key="suppliers" resource={suppliersResource} />,
          },
          {
            path: customersResource.nav.path,
            element: <CatalogPage key="customers" resource={customersResource} />,
          },
          {
            path: locationsResource.nav.path,
            element: <CatalogPage key="locations" resource={locationsResource} />,
          },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
];
