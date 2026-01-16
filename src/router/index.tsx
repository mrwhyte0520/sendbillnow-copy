
import { useNavigate, type NavigateFunction, useLocation } from "react-router-dom";
import { useRoutes } from "react-router-dom";
import { useEffect } from "react";
import routes from "./config";
import { useAuth } from "../hooks/useAuth";

let navigateResolver: (navigate: ReturnType<typeof useNavigate>) => void;

declare global {
  interface Window {
    REACT_APP_NAVIGATE: ReturnType<typeof useNavigate>;
  }
}

export const navigatePromise = new Promise<NavigateFunction>((resolve) => {
  navigateResolver = resolve;
});

export function AppRoutes() {
  const element = useRoutes(routes);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading } = useAuth();

  const publicRoutes = ['/auth/login', '/auth/register', '/auth/reset-password', '/'];
  const isPublicRoute = publicRoutes.includes(location.pathname);

  useEffect(() => {
    window.REACT_APP_NAVIGATE = navigate;
    navigateResolver(window.REACT_APP_NAVIGATE);
  }, [navigate]);

  useEffect(() => {
    if (!loading && false) {
      if (!user && !isPublicRoute) {
        // Usuario no autenticado intentando acceder a ruta protegida
        navigate('/auth/login', { replace: true });
      } else if (user && (location.pathname === '/auth/login' || location.pathname === '/auth/register')) {
        // Usuario autenticado intentando acceder a login/registro
        navigate('/dashboard', { replace: true });
      } else if (user && location.pathname === '/') {
        // Usuario autenticado en la página de inicio
        navigate('/dashboard', { replace: true });
      } else if (!user && location.pathname === '/') {
        // Usuario no autenticado en la página de inicio
        navigate('/auth/login', { replace: true });
      }
    }
  }, [user, loading, location.pathname, navigate]);

  if (loading && !isPublicRoute) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-600 to-purple-600 rounded-2xl mb-4 animate-pulse">
            <i className="ri-loader-4-line text-3xl text-white animate-spin"></i>
          </div>
          <p className="text-gray-600 font-medium">Cargando...</p>
        </div>
      </div>
    );
  }

  return element;
}
