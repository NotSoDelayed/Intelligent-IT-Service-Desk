import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/providers/AuthProvider';

/**
 * Route guard that requires admin role.
 * Non-admin users are redirected to /my-tickets.
 */
export function AdminRoute() {
  const { user } = useAuth();

  if (user?.role !== 'admin') {
    return <Navigate to="/my-tickets" replace />;
  }

  return <Outlet />;
}
