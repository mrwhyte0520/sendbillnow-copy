import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePlanPermissions } from '../hooks/usePlanPermissions';

interface PlanGateProps {
  children: ReactNode;
  module?: string;
  route?: string;
  fallback?: ReactNode;
}

export function PlanGate({ children, module, route, fallback }: PlanGateProps) {
  const navigate = useNavigate();
  const { 
    canAccessModule, 
    canAccessRoute, 
    getRequiredPlanForModule,
    getRequiredPlanForRoute,
    getModuleName,
    currentPlanName,
    isTrialExpired,
    hasActivePlan
  } = usePlanPermissions();

  // Verificar acceso
  let hasAccess = true;
  let requiredPlan = '';
  let blockedModuleName = '';

  if (module) {
    hasAccess = canAccessModule(module);
    requiredPlan = getRequiredPlanForModule(module);
    blockedModuleName = getModuleName(module);
  } else if (route) {
    hasAccess = canAccessRoute(route);
    requiredPlan = getRequiredPlanForRoute(route);
    blockedModuleName = route;
  }

  // Si tiene acceso, mostrar el contenido
  if (hasAccess) {
    return <>{children}</>;
  }

  // Si hay fallback personalizado, usarlo
  if (fallback) {
    return <>{fallback}</>;
  }

  // Mostrar mensaje de bloqueo por defecto
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden">
        {/* Header con candado */}
        <div className="bg-gradient-to-r from-gray-700 to-gray-800 p-8 text-center">
          <div className="w-20 h-20 mx-auto bg-white/10 rounded-full flex items-center justify-center mb-4">
            <i className="ri-lock-2-line text-4xl text-white"></i>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Módulo Bloqueado</h2>
          <p className="text-gray-300 text-sm">
            {blockedModuleName}
          </p>
        </div>

        {/* Contenido */}
        <div className="p-6 space-y-4">
          {isTrialExpired && !hasActivePlan ? (
            <>
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
            </>
          ) : (
            <>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-start">
                  <i className="ri-information-line text-blue-500 text-xl mr-3 mt-0.5"></i>
                  <div>
                    <h3 className="font-semibold text-blue-800">Actualiza tu plan</h3>
                    <p className="text-sm text-blue-600 mt-1">
                      Este módulo no está incluido en tu plan actual ({currentPlanName}).
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-600 mb-2">
                  Para acceder a <strong>{blockedModuleName}</strong> necesitas:
                </p>
                <div className="flex items-center bg-white rounded-lg p-3 border border-gray-200">
                  <i className="ri-vip-crown-line text-amber-500 text-xl mr-3"></i>
                  <span className="font-semibold text-gray-900">{requiredPlan}</span>
                </div>
              </div>
            </>
          )}

          <div className="flex flex-col gap-3 pt-2">
            <button
              onClick={() => navigate('/plans')}
              className="w-full py-3 px-4 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg font-semibold hover:from-blue-700 hover:to-blue-800 transition-all flex items-center justify-center"
            >
              <i className="ri-arrow-up-circle-line mr-2"></i>
              Ver Planes Disponibles
            </button>
            <button
              onClick={() => navigate(-1)}
              className="w-full py-3 px-4 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
            >
              Volver Atrás
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Componente para usar en el sidebar/menú para mostrar candado
interface MenuItemLockProps {
  module: string;
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}

export function MenuItemWithLock({ module, children, onClick, className = '' }: MenuItemLockProps) {
  const navigate = useNavigate();
  const { canAccessModule, getRequiredPlanForModule, getModuleName } = usePlanPermissions();
  
  const hasAccess = canAccessModule(module);

  if (hasAccess) {
    return (
      <div onClick={onClick} className={className}>
        {children}
      </div>
    );
  }

  return (
    <div 
      className={`${className} relative cursor-pointer opacity-60`}
      onClick={() => {
        const moduleName = getModuleName(module);
        const requiredPlan = getRequiredPlanForModule(module);
        if (confirm(`El módulo "${moduleName}" requiere el plan "${requiredPlan}". ¿Deseas ver los planes disponibles?`)) {
          navigate('/plans');
        }
      }}
      title={`Requiere ${getRequiredPlanForModule(module)}`}
    >
      {children}
      <div className="absolute top-0 right-0 -mt-1 -mr-1">
        <i className="ri-lock-2-fill text-gray-500 text-sm"></i>
      </div>
    </div>
  );
}

export default PlanGate;
