import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/providers/AuthProvider';

/**
 * Route guard that requires authentication.
 * Captures the current URL and redirects to /login with returnTo param.
 * Adds &expired=1 if the session just expired.
 */
export function ProtectedRoute() {
  const { isAuthenticated, sessionExpired } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    const returnTo = encodeURIComponent(location.pathname + location.search);
    const expiredParam = sessionExpired ? '&expired=1' : '';
    return <Navigate to={`/login?returnTo=${returnTo}${expiredParam}`} replace />;
  }

  return <Outlet />;
}
