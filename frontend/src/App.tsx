import { lazy } from 'react';
import { Route, Routes, Navigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import LoginPage from '@/pages/LoginPage';

const TicketListPage = lazy(() => import('@/pages/TicketListPage'));
const UserTicketListPage = lazy(() => import('@/pages/UserTicketListPage'));
const TicketDetailsPage = lazy(() => import('@/pages/TicketDetailsPage'));
const UserTicketDetailsPage = lazy(() => import('@/pages/UserTicketDetailsPage'));
const CreateTicketPage = lazy(() => import('@/pages/CreateTicketPage'));
const AnalyticsPage = lazy(() => import('@/pages/AnalyticsPage'));
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'));

function TicketRoute() {
  let role = 'user';
  const userStr = localStorage.getItem('user');
  if (userStr) {
    try {
      const user = JSON.parse(userStr);
      role = user.role || 'user';
    } catch {}
  }
  return role === 'admin' || role === 'engineer' ? <TicketListPage /> : <UserTicketListPage />;
}

const REFRESH_INTERVAL = 5000;

function TicketDetailsRoute() {
  let role = 'user';
  const userStr = localStorage.getItem('user');
  if (userStr) {
    try {
      const user = JSON.parse(userStr);
      role = user.role || 'user';
    } catch {}
  }
  return role === 'admin' || role === 'engineer' 
    ? <TicketDetailsPage refreshInterval={REFRESH_INTERVAL} /> 
    : <UserTicketDetailsPage refreshInterval={REFRESH_INTERVAL} />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route index element={<Navigate to="/tickets" replace />} />
          <Route path="tickets" element={<TicketRoute />} />
          <Route path="tickets/new" element={<CreateTicketPage refreshInterval={REFRESH_INTERVAL} />} />
          <Route path="tickets/:id" element={<TicketDetailsRoute />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  );
}

