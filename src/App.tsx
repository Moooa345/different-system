import { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from 'sonner';
import { useAuthStore } from './store/authStore';
import { useTranslation } from './i18n/useTranslation';
import { StorefrontPage } from './features/storefront/StorefrontPage';
import { CheckoutPage } from './features/storefront/CheckoutPage';
import { useTheme } from './store/useTheme';
import { useStaffStore } from './store/staffStore';

const LoginPage = lazy(() => import('./features/auth/LoginPage').then((module) => ({ default: module.LoginPage })));
const ProtectedRoute = lazy(() => import('./features/auth/ProtectedRoute').then((module) => ({ default: module.ProtectedRoute })));
const AdminLayout = lazy(() => import('./components/layout/AdminLayout').then((module) => ({ default: module.AdminLayout })));
const InventoryPage = lazy(() => import('./features/inventory/InventoryPage').then((module) => ({ default: module.InventoryPage })));
const PosPage = lazy(() => import('./features/pos/PosPage').then((module) => ({ default: module.PosPage })));
const OrdersPage = lazy(() => import('./features/orders/OrdersPage').then((module) => ({ default: module.OrdersPage })));
const DashboardPage = lazy(() => import('./features/dashboard/DashboardPage').then((module) => ({ default: module.DashboardPage })));
const ProductDetailsPage = lazy(() => import('./features/storefront/ProductDetailsPage').then((module) => ({ default: module.ProductDetailsPage })));
const ShiftManagementPage = lazy(() => import('./features/dashboard/ShiftManagementPage').then((module) => ({ default: module.ShiftManagementPage })));
const ReturnsPage = lazy(() => import('./features/orders/ReturnsPage').then((module) => ({ default: module.ReturnsPage })));
const ExpensesPage = lazy(() => import('./features/dashboard/ExpensesPage').then((module) => ({ default: module.ExpensesPage })));

function AdminIndexRedirect() {
  const role = useStaffStore((state) => state.role);
  return <Navigate to={role === 'cashier' ? '/admin/pos' : '/admin/dashboard'} replace />;
}

function RouteLoading() {
  const { t, dir } = useTranslation();
  return <div dir={dir} className="grid min-h-screen place-items-center bg-stone-50 text-sm font-semibold text-stone-500">{t('loadingPage')}</div>;
}

export default function App() {
  const initialize = useAuthStore((state) => state.initialize);
  const { dir, lang } = useTranslation();
  const theme = useTheme((state) => state.theme);
  useEffect(() => { void initialize(); }, [initialize]);
  useEffect(() => {
    document.documentElement.dir = dir;
    document.documentElement.lang = lang;
  }, [dir, lang]);
  useEffect(() => {
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0E0E0D' : '#FAF8F5');
  }, [theme]);

  return <BrowserRouter>
    <Toaster position="top-center" dir={dir} theme={theme} richColors />
    <Suspense fallback={<RouteLoading />}><Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/admin" element={<ProtectedRoute><AdminLayout /></ProtectedRoute>}>
        <Route index element={<AdminIndexRedirect />} />
        <Route path="dashboard" element={<ProtectedRoute ownerOnly><DashboardPage /></ProtectedRoute>} />
        <Route path="pos" element={<PosPage />} />
        <Route path="inventory" element={<InventoryPage />} />
        <Route path="orders" element={<ProtectedRoute ownerOnly><OrdersPage /></ProtectedRoute>} />
        <Route path="shifts" element={<ProtectedRoute ownerOnly><ShiftManagementPage /></ProtectedRoute>} />
        <Route path="returns" element={<ReturnsPage />} />
        <Route path="expenses" element={<ProtectedRoute ownerOnly><ExpensesPage /></ProtectedRoute>} />
      </Route>
      <Route path="/" element={<StorefrontPage />} />
      <Route path="/product/:id" element={<ProductDetailsPage />} />
      <Route path="/checkout" element={<CheckoutPage />} />
      <Route path="*" element={<Navigate to="/admin/dashboard" replace />} />
    </Routes></Suspense>
  </BrowserRouter>;
}
