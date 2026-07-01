import { lazy } from 'react';
import { Route, Routes } from 'react-router-dom';
import { AppLayout } from '@/components/layout';
import { AdminRoute, ProtectedRoute, RoleRedirect } from '@/components/auth';

const LoginPage = lazy(() => import('@/pages/LoginPage'));
const DashboardPage = lazy(() => import('@/pages/DashboardPage'));
const MyTicketsPage = lazy(() => import('@/pages/MyTicketsPage'));
const TicketListPage = lazy(() => import('@/pages/TicketListPage'));
const TicketDetailsPage = lazy(() => import('@/pages/TicketDetailsPage'));
const CreateTicketPage = lazy(() => import('@/pages/CreateTicketPage'));
const AnalyticsPage = lazy(() => import('@/pages/AnalyticsPage'));
const SettingsPage = lazy(() => import('@/pages/SettingsPage'));
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'));

export default function App() {
  return (
    <Routes>
      {/* Public route */}
      <Route path="login" element={<LoginPage />} />

      {/* Protected routes — require authentication */}
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          {/* / redirects based on role */}
          <Route index element={<RoleRedirect />} />

          {/* Admin-only routes */}
          <Route element={<AdminRoute />}>
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="tickets" element={<TicketListPage />} />
            <Route path="analytics" element={<AnalyticsPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>

          {/* Routes accessible by both roles */}
          <Route path="my-tickets" element={<MyTicketsPage />} />
          <Route path="tickets/new" element={<CreateTicketPage />} />
          <Route path="tickets/:id" element={<TicketDetailsPage />} />

          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
