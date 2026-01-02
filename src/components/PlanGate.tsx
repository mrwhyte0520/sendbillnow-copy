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

  // Check access
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

  // If has access, show content
  if (hasAccess) {
    return <>{children}</>;
  }

  // If there's a custom fallback, use it
  if (fallback) {
    return <>{fallback}</>;
  }

  // Show default block message
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden">
        {/* Header with lock */}
        <div className="bg-gradient-to-r from-gray-700 to-gray-800 p-8 text-center">
          <div className="w-20 h-20 mx-auto bg-white/10 rounded-full flex items-center justify-center mb-4">
            <i className="ri-lock-2-line text-4xl text-white"></i>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Module Blocked</h2>
          <p className="text-gray-300 text-sm">
            {blockedModuleName}
          </p>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {isTrialExpired && !hasActivePlan ? (
            <>
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-start">
                  <i className="ri-error-warning-line text-red-500 text-xl mr-3 mt-0.5"></i>
                  <div>
                    <h3 className="font-semibold text-red-800">Trial period expired</h3>
                    <p className="text-sm text-red-600 mt-1">
                      Your trial period has ended. Subscribe to a plan to continue using Sendbillnow.
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
                    <h3 className="font-semibold text-blue-800">Upgrade your plan</h3>
                    <p className="text-sm text-blue-600 mt-1">
                      This module is not included in your current plan ({currentPlanName}).
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-600 mb-2">
                  To access <strong>{blockedModuleName}</strong> you need:
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
              View Available Plans
            </button>
            <button
              onClick={() => navigate(-1)}
              className="w-full py-3 px-4 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
            >
              Go Back
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Component to use in sidebar/menu to show lock
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
        if (confirm(`The module "${moduleName}" requires the "${requiredPlan}" plan. Would you like to view available plans?`)) {
          navigate('/plans');
        }
      }}
      title={`Requires ${getRequiredPlanForModule(module)}`}
    >
      {children}
      <div className="absolute top-0 right-0 -mt-1 -mr-1">
        <i className="ri-lock-2-fill text-gray-500 text-sm"></i>
      </div>
    </div>
  );
}

export default PlanGate;
