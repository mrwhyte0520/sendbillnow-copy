import type { ReactElement } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { usePlanPermissions } from '../../hooks/usePlanPermissions';

interface PlanProtectedRouteProps {
  children: ReactElement;
}

export default function PlanProtectedRoute({ children }: PlanProtectedRouteProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { 
    canAccessRoute, 
    getRequiredPlanForRoute,
    currentPlanName,
    isTrialExpired,
    hasActivePlan
  } = usePlanPermissions();

  const currentPath = location.pathname;
  
  // Rutas siempre permitidas
  const alwaysAllowed = ['/plans', '/profile', '/settings', '/auth', '/login', '/register', '/'];
  const isAlwaysAllowed = alwaysAllowed.some(r => 
    currentPath === r || 
    currentPath.startsWith(r + '/') ||
    currentPath.startsWith('/auth/')
  );

  if (isAlwaysAllowed) {
    return children;
  }

  if (isTrialExpired && !hasActivePlan) {
    return <Navigate to="/plans" replace />;
  }

  // Verificar acceso
  const hasAccess = canAccessRoute(currentPath);

  if (hasAccess) {
    return children;
  }

  // Mostrar pantalla de bloqueo
  const requiredPlan = getRequiredPlanForRoute(currentPath);
  const moduleName = currentPath.split('/').filter(Boolean)[0] || 'este módulo';

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden">
        {/* Header con candado */}
        <div className="bg-gradient-to-r from-gray-700 to-gray-800 p-8 text-center">
          <div className="w-24 h-24 mx-auto bg-white/10 rounded-full flex items-center justify-center mb-4 animate-pulse">
            <i className="ri-lock-2-line text-5xl text-white"></i>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Acceso Restringido</h2>
          <p className="text-gray-300 capitalize">
            {moduleName.replace(/-/g, ' ')}
          </p>
        </div>

        {/* Contenido */}
        <div className="p-6 space-y-4">
          {isTrialExpired && !hasActivePlan ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-start">
                <i className="ri-error-warning-line text-red-500 text-xl mr-3 mt-0.5"></i>
                <div>
                  <h3 className="font-semibold text-red-800">Período de prueba expirado</h3>
                  <p className="text-sm text-red-600 mt-1">
                    Tu período de prueba ha terminado. Suscríbete a un plan para continuar usando Sendbillnow.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <div className="flex items-start">
                  <i className="ri-shield-star-line text-amber-500 text-xl mr-3 mt-0.5"></i>
                  <div>
                    <h3 className="font-semibold text-amber-800">Módulo no disponible</h3>
                    <p className="text-sm text-amber-600 mt-1">
                      Este módulo no está incluido en tu plan actual.
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Tu plan actual:</span>
                  <span className="font-medium text-gray-900 bg-gray-200 px-2 py-1 rounded">
                    {currentPlanName}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Plan requerido:</span>
                  <span className="font-medium text-blue-600 bg-blue-100 px-2 py-1 rounded">
                    {requiredPlan}
                  </span>
                </div>
              </div>
            </>
          )}

          <div className="flex flex-col gap-3 pt-4">
            <button
              onClick={() => navigate('/plans')}
              className="w-full py-3 px-4 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg font-semibold hover:from-blue-700 hover:to-blue-800 transition-all flex items-center justify-center shadow-lg"
            >
              <i className="ri-arrow-up-circle-line mr-2 text-lg"></i>
              Ver Planes y Actualizar
            </button>
            <button
              onClick={() => navigate('/dashboard')}
              className="w-full py-3 px-4 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors flex items-center justify-center"
            >
              <i className="ri-home-4-line mr-2"></i>
              Ir al Dashboard
            </button>
          </div>

          <p className="text-xs text-gray-500 text-center pt-2">
            Actualiza tu plan para desbloquear todas las funcionalidades de Sendbillnow
          </p>
        </div>
      </div>
    </div>
  );
}
