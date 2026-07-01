import { Navigate } from 'react-router-dom';
import { useAuth } from '@/providers/AuthProvider';

/**
 * Index route (/) — redirects to role-appropriate home page.
 * Admin → /dashboard, User → /my-tickets.
 */
export function RoleRedirect() {
  const { user } = useAuth();

  if (user?.role === 'admin') {
    return <Navigate to="/dashboard" replace />;
  }

  return <Navigate to="/my-tickets" replace />;
}
