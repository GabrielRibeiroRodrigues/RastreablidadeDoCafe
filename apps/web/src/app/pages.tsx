import { lazyPage, type LazyPage } from './lazy-page';

/**
 * Páginas do app autenticado, cada uma no seu chunk (code splitting por rota). O login, a página
 * pública do QR code e o layout ficam no bundle inicial.
 */

export const DashboardPage = lazyPage(
  () => import('@/features/dashboard/DashboardPage'),
  (m) => m.DashboardPage,
);

const catalogModule = () => import('@/components/catalog/CatalogPage');

export const ProductsPage = lazyPage(
  () => Promise.all([catalogModule(), import('@/features/products/resource')]),
  ([{ CatalogPage }, { productsResource }]) =>
    function ProductsRoute() {
      return <CatalogPage resource={productsResource} />;
    },
);
export const SuppliersPage = lazyPage(
  () => Promise.all([catalogModule(), import('@/features/suppliers/resource')]),
  ([{ CatalogPage }, { suppliersResource }]) =>
    function SuppliersRoute() {
      return <CatalogPage resource={suppliersResource} />;
    },
);
export const CustomersPage = lazyPage(
  () => Promise.all([catalogModule(), import('@/features/customers/resource')]),
  ([{ CatalogPage }, { customersResource }]) =>
    function CustomersRoute() {
      return <CatalogPage resource={customersResource} />;
    },
);
export const LocationsPage = lazyPage(
  () => Promise.all([catalogModule(), import('@/features/locations/resource')]),
  ([{ CatalogPage }, { locationsResource }]) =>
    function LocationsRoute() {
      return <CatalogPage resource={locationsResource} />;
    },
);

export const UsersPage = lazyPage(
  () => Promise.all([catalogModule(), import('@/features/users/resource')]),
  ([{ CatalogPage }, { usersResource }]) =>
    function UsersRoute() {
      return <CatalogPage resource={usersResource} />;
    },
);

export const LotsPage = lazyPage(
  () => import('@/features/inventory/LotsPage'),
  (m) => m.LotsPage,
);
export const LotDetailPage = lazyPage(
  () => import('@/features/inventory/LotDetailPage'),
  (m) => m.LotDetailPage,
);
export const ReceiptPage = lazyPage(
  () => import('@/features/inventory/ReceiptPage'),
  (m) => m.ReceiptPage,
);
export const StockPage = lazyPage(
  () => import('@/features/inventory/StockPage'),
  (m) => m.StockPage,
);
export const MovementsPage = lazyPage(
  () => import('@/features/inventory/MovementsPage'),
  (m) => m.MovementsPage,
);
export const LotTracePage = lazyPage(
  () => import('@/features/trace/LotTracePage'),
  (m) => m.LotTracePage,
);
export const TraceSearchPage = lazyPage(
  () => import('@/features/trace/TraceSearchPage'),
  (m) => m.TraceSearchPage,
);
export const ProductionOrdersPage = lazyPage(
  () => import('@/features/production/ProductionOrdersPage'),
  (m) => m.ProductionOrdersPage,
);
export const NewProductionOrderPage = lazyPage(
  () => import('@/features/production/NewProductionOrderPage'),
  (m) => m.NewProductionOrderPage,
);
export const ProductionOrderDetailPage = lazyPage(
  () => import('@/features/production/ProductionOrderDetailPage'),
  (m) => m.ProductionOrderDetailPage,
);
export const ShipmentsPage = lazyPage(
  () => import('@/features/shipments/ShipmentsPage'),
  (m) => m.ShipmentsPage,
);
export const NewShipmentPage = lazyPage(
  () => import('@/features/shipments/NewShipmentPage'),
  (m) => m.NewShipmentPage,
);
export const ShipmentDetailPage = lazyPage(
  () => import('@/features/shipments/ShipmentDetailPage'),
  (m) => m.ShipmentDetailPage,
);
export const RecallsPage = lazyPage(
  () => import('@/features/recalls/RecallsPage'),
  (m) => m.RecallsPage,
);
export const NewRecallPage = lazyPage(
  () => import('@/features/recalls/NewRecallPage'),
  (m) => m.NewRecallPage,
);
export const RecallDetailPage = lazyPage(
  () => import('@/features/recalls/RecallDetailPage'),
  (m) => m.RecallDetailPage,
);
export const NonConformitiesPage = lazyPage(
  () => import('@/features/quality/NonConformitiesPage'),
  (m) => m.NonConformitiesPage,
);
export const NonConformityDetailPage = lazyPage(
  () => import('@/features/quality/NonConformityDetailPage'),
  (m) => m.NonConformityDetailPage,
);
export const AuditPage = lazyPage(
  () => import('@/features/audit/AuditPage'),
  (m) => m.AuditPage,
);
export const ReportsPage = lazyPage(
  () => import('@/features/reports/ReportsPage'),
  (m) => m.ReportsPage,
);
export const ImportPage = lazyPage(
  () => import('@/features/imports/ImportPage'),
  (m) => m.ImportPage,
);
export const PublicTracePage = lazyPage(
  () => import('@/features/public-trace/PublicTracePage'),
  (m) => m.PublicTracePage,
);

/** Pré-carregamento por rota da barra lateral (hover/foco no link). */
export const PRELOADERS: Record<string, LazyPage['preload']> = {
  '/': DashboardPage.preload,
  '/produtos': ProductsPage.preload,
  '/fornecedores': SuppliersPage.preload,
  '/clientes': CustomersPage.preload,
  '/locais': LocationsPage.preload,
  '/usuarios': UsersPage.preload,
  '/lotes': LotsPage.preload,
  '/recebimento': ReceiptPage.preload,
  '/estoque': StockPage.preload,
  '/movimentacoes': MovementsPage.preload,
  '/rastreabilidade': TraceSearchPage.preload,
  '/producao': ProductionOrdersPage.preload,
  '/expedicao': ShipmentsPage.preload,
  '/recall': RecallsPage.preload,
  '/qualidade': NonConformitiesPage.preload,
  '/auditoria': AuditPage.preload,
  '/relatorios': ReportsPage.preload,
  '/importacao': ImportPage.preload,
};

export function preloadRoute(path: string): void {
  void PRELOADERS[path]?.().catch(() => undefined);
}
