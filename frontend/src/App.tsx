/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import * as React from 'react';
import { AuthProvider, useAuth } from './shared/context/AuthContext';
import { LocationProvider } from './shared/context/LocationContext';
import { LanguageProvider } from './shared/context/LanguageContext';
import { Toaster } from 'sonner';
import { initializeDatabase } from './shared/lib/database';
import { TooltipProvider } from './shared/components/ui/tooltip';
import PageSkeleton from './shared/components/ui/PageSkeleton';

// ─── Lazy-loaded pages (route-level code splitting) ───────────────────────────
// Each page is bundled into its own JS chunk and only downloaded on first visit.

const LoginPage         = React.lazy(() => import('./modules/auth/pages/LoginPage'));
const DashboardLayout   = React.lazy(() => import('./shared/components/layout/DashboardLayout'));
const OverviewPage      = React.lazy(() => import('./modules/dashboard/pages/OverviewPage'));
const InventoryPage     = React.lazy(() => import('./modules/inventory/pages/InventoryPage'));
const AddInventoryPage  = React.lazy(() => import('./modules/inventory/pages/AddInventoryPage'));
const RequestProductPage= React.lazy(() => import('./modules/inventory/pages/RequestProductPage'));
const PromoPage         = React.lazy(() => import('./modules/promos/pages/PromoPage'));
const CreatePromoPage   = React.lazy(() => import('./modules/promos/pages/CreatePromoPage'));
const UsersPage         = React.lazy(() => import('./modules/users/pages/UsersPage'));
const CreateUserPage    = React.lazy(() => import('./modules/users/pages/CreateUserPage'));
const BroadcastPage     = React.lazy(() => import('./modules/broadcasts/pages/BroadcastPage'));
const AIAnalysisPage    = React.lazy(() => import('./modules/dashboard/pages/AIAnalysisPage'));
const AIInsightsPage    = React.lazy(() => import('./modules/dashboard/pages/AIInsightsPage'));
const MasterProductsPage= React.lazy(() => import('./modules/products/pages/MasterProductsPage'));
const AddProductPage    = React.lazy(() => import('./modules/products/pages/AddProductPage'));
const MonitorPage       = React.lazy(() => import('./modules/monitor/pages/MonitorPage'));
const BroadcastInboxPage= React.lazy(() => import('./modules/broadcasts/pages/BroadcastInboxPage'));
const ProfilePage       = React.lazy(() => import('./modules/users/pages/ProfilePage'));
const TransactionsPage  = React.lazy(() => import('./modules/transactions/pages/TransactionsPage'));
const ReportPage        = React.lazy(() => import('./modules/dashboard/pages/ReportPage'));
const CashierPage       = React.lazy(() => import('./modules/cashier/pages/CashierPage'));
const AITrainingPage    = React.lazy(() => import('./modules/dashboard/pages/AITrainingPage'));

// ─── Route guards ─────────────────────────────────────────────────────────────

// Wrapper for layout with Sidebar/Header
const ProtectedLayout = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, user } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (user?.role === 'kasir') return <Navigate to="/kasir" replace />;
  return (
    <LocationProvider>
      <React.Suspense fallback={<PageSkeleton />}>
        <DashboardLayout>{children}</DashboardLayout>
      </React.Suspense>
    </LocationProvider>
  );
};

// Wrapper for standalone protected pages (No Sidebar/Header)
const AuthGuard = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

// Wrapper for role-based access control
const RoleGuard = ({ children, allowedRoles }: { children: React.ReactNode, allowedRoles: ('super_admin' | 'branch_admin' | 'admin' | 'kasir')[] }) => {
  const { user, isAuthenticated } = useAuth();

  if (!isAuthenticated || !user) return <Navigate to="/login" replace />;

  const hasAccess = allowedRoles.includes(user.role);
  if (!hasAccess) {
    return <Navigate to="/overview" replace />;
  }

  return <>{children}</>;
};

// ─── Routes ──────────────────────────────────────────────────────────────────

function AppRoutes() {
  return (
    <React.Suspense fallback={<PageSkeleton />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        {/* Shared Routes */}
        <Route path="/overview"   element={<ProtectedLayout><OverviewPage /></ProtectedLayout>} />
        <Route path="/monitor"    element={<ProtectedLayout><RoleGuard allowedRoles={['super_admin']}><MonitorPage /></RoleGuard></ProtectedLayout>} />
        <Route path="/promo"      element={<ProtectedLayout><PromoPage /></ProtectedLayout>} />
        <Route path="/promo/create" element={<ProtectedLayout><CreatePromoPage /></ProtectedLayout>} />
        <Route path="/promo/edit/:id" element={<ProtectedLayout><CreatePromoPage /></ProtectedLayout>} />
        <Route path="/inbox"      element={<ProtectedLayout><BroadcastInboxPage /></ProtectedLayout>} />
        <Route path="/profile"    element={<AuthGuard><ProfilePage /></AuthGuard>} />

        {/* Super Admin Only */}
        <Route path="/catalog"         element={<ProtectedLayout><RoleGuard allowedRoles={['super_admin']}><MasterProductsPage /></RoleGuard></ProtectedLayout>} />
        <Route path="/master-products" element={<ProtectedLayout><RoleGuard allowedRoles={['super_admin']}><MasterProductsPage /></RoleGuard></ProtectedLayout>} />
        <Route path="/add-product"     element={<ProtectedLayout><RoleGuard allowedRoles={['super_admin']}><AddProductPage /></RoleGuard></ProtectedLayout>} />
        <Route path="/users"           element={<ProtectedLayout><RoleGuard allowedRoles={['super_admin', 'admin', 'branch_admin']}><UsersPage /></RoleGuard></ProtectedLayout>} />
        <Route path="/users/create"    element={<ProtectedLayout><RoleGuard allowedRoles={['super_admin', 'admin', 'branch_admin']}><CreateUserPage /></RoleGuard></ProtectedLayout>} />
        <Route path="/broadcast"       element={<ProtectedLayout><RoleGuard allowedRoles={['super_admin', 'branch_admin', 'admin']}><BroadcastPage /></RoleGuard></ProtectedLayout>} />
        <Route path="/insights"        element={<ProtectedLayout><RoleGuard allowedRoles={['super_admin']}><AIInsightsPage /></RoleGuard></ProtectedLayout>} />
        <Route path="/ai-training"     element={<ProtectedLayout><RoleGuard allowedRoles={['super_admin']}><AITrainingPage /></RoleGuard></ProtectedLayout>} />
        <Route path="/settings"        element={<ProtectedLayout><RoleGuard allowedRoles={['super_admin']}><UsersPage /></RoleGuard></ProtectedLayout>} />

        {/* Branch Admin Only */}
        <Route path="/inventory"         element={<ProtectedLayout><RoleGuard allowedRoles={['admin', 'branch_admin']}><InventoryPage /></RoleGuard></ProtectedLayout>} />
        <Route path="/inventory/add"     element={<ProtectedLayout><RoleGuard allowedRoles={['admin', 'branch_admin']}><AddInventoryPage /></RoleGuard></ProtectedLayout>} />
        <Route path="/inventory/request" element={<ProtectedLayout><RoleGuard allowedRoles={['admin', 'branch_admin']}><RequestProductPage /></RoleGuard></ProtectedLayout>} />
        <Route path="/analysis"          element={<ProtectedLayout><RoleGuard allowedRoles={['admin', 'branch_admin']}><AIAnalysisPage /></RoleGuard></ProtectedLayout>} />

        {/* Transactions — Super Admin sees all, Branch Admin sees their branch */}
        <Route path="/transactions" element={<ProtectedLayout><RoleGuard allowedRoles={['super_admin', 'branch_admin', 'admin']}><TransactionsPage /></RoleGuard></ProtectedLayout>} />

        {/* Report — standalone print view, no sidebar */}
        <Route path="/report" element={<AuthGuard><ReportPage /></AuthGuard>} />
        <Route path="/kasir" element={<AuthGuard><LocationProvider><CashierPage /></LocationProvider></AuthGuard>} />

        <Route path="/" element={<Navigate to="/overview" replace />} />
      </Routes>
    </React.Suspense>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  React.useEffect(() => {
    // Initialize database connection on app mount
    initializeDatabase().catch(err => console.error('Database initialization error:', err));
  }, []);

  return (
    <BrowserRouter basename="/admin">
      <LanguageProvider>
        <AuthProvider>
          <TooltipProvider>
            <AppRoutes />
            <Toaster position="top-right" expand={false} richColors />
          </TooltipProvider>
        </AuthProvider>
      </LanguageProvider>
    </BrowserRouter>
  );
}
