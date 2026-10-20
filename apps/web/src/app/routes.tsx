import { Suspense } from 'react';
import type { RouteObject } from 'react-router';
import { ProtectedRoute } from '@/auth/ProtectedRoute';
import { FullPageLoader } from '@/components/FullPageLoader';
import { AppLayout } from '@/components/layout/AppLayout';
import { AuthCallbackPage } from '@/pages/AuthCallbackPage';
import { LoginPage } from '@/pages/login/LoginPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { RouteErrorPage } from '@/pages/RouteErrorPage';
import {
  AuditPage,
  CustomersPage,
  ImportPage,
  NewRecallPage,
  InventoryCountDetailPage,
  InventoryCountsPage,
  NonConformitiesPage,
  NonConformityDetailPage,
  RecallDetailPage,
  RecallsPage,
  ReportsPage,
  DashboardPage,
  LocationsPage,
  UsersPage,
  CompanyPage,
  LotDetailPage,
  LotsPage,
  LotTracePage,
  MovementsPage,
  NewProductionOrderPage,
  NewShipmentPage,
  ProductionOrderDetailPage,
  ProductionOrdersPage,
  ProductsPage,
  PublicTracePage,
  ReceiptPage,
  ShipmentDetailPage,
  ShipmentsPage,
  StockPage,
  SuppliersPage,
  TraceSearchPage,
} from './pages';

export const routes: RouteObject[] = [
  {
    // Erro fora do layout (login, callback, página pública): tela cheia.
    errorElement: <RouteErrorPage fullPage />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/auth/callback', element: <AuthCallbackPage /> },
      // Página pública do QR code da etiqueta: fora do layout autenticado, sem login.
      {
        path: '/rastreio/:token',
        element: (
          <Suspense fallback={<FullPageLoader />}>
            <PublicTracePage />
          </Suspense>
        ),
      },
      {
        element: <ProtectedRoute />,
        children: [
          {
            element: <AppLayout />,
            children: [
              {
                // Erros de página aparecem dentro do layout (menu e cabeçalho continuam úteis).
                errorElement: <RouteErrorPage />,
                children: [
                  { index: true, element: <DashboardPage /> },
                  { path: '/produtos', element: <ProductsPage /> },
                  { path: '/fornecedores', element: <SuppliersPage /> },
                  { path: '/clientes', element: <CustomersPage /> },
                  { path: '/locais', element: <LocationsPage /> },
                  { path: '/usuarios', element: <UsersPage /> },
                  { path: '/empresa', element: <CompanyPage /> },
                  { path: '/lotes', element: <LotsPage /> },
                  { path: '/lotes/:id', element: <LotDetailPage /> },
                  { path: '/recebimento', element: <ReceiptPage /> },
                  { path: '/estoque', element: <StockPage /> },
                  { path: '/movimentacoes', element: <MovementsPage /> },
                  { path: '/inventario', element: <InventoryCountsPage /> },
                  { path: '/inventario/:id', element: <InventoryCountDetailPage /> },
                  { path: '/lotes/:id/rastreabilidade', element: <LotTracePage /> },
                  { path: '/rastreabilidade', element: <TraceSearchPage /> },
                  { path: '/producao', element: <ProductionOrdersPage /> },
                  { path: '/producao/nova', element: <NewProductionOrderPage /> },
                  { path: '/producao/:id', element: <ProductionOrderDetailPage /> },
                  { path: '/expedicao', element: <ShipmentsPage /> },
                  { path: '/expedicao/nova', element: <NewShipmentPage /> },
                  { path: '/expedicao/:id', element: <ShipmentDetailPage /> },
                  { path: '/recall', element: <RecallsPage /> },
                  { path: '/recall/novo', element: <NewRecallPage /> },
                  { path: '/recall/:id', element: <RecallDetailPage /> },
                  { path: '/qualidade', element: <NonConformitiesPage /> },
                  { path: '/qualidade/:id', element: <NonConformityDetailPage /> },
                  { path: '/auditoria', element: <AuditPage /> },
                  { path: '/relatorios', element: <ReportsPage /> },
                  { path: '/importacao', element: <ImportPage /> },
                  { path: '*', element: <NotFoundPage /> },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
];
