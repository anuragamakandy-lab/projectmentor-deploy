import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';

export function RequireAuth() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
}

export function RequireRole({ role }) {
  const { user } = useAuth();
  return user?.role === role ? <Outlet /> : <Navigate to={user ? '/' : '/login'} replace />;
}
