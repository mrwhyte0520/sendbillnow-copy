import { useMemo } from 'react';
import { usePlans } from './usePlans';
import { 
  PLAN_CONFIGS, 
  ROUTE_TO_MODULE, 
  MODULE_NAMES,
  getMinimumPlanName,
  type PlanId 
} from '../config/planPermissions';

export interface PlanPermissions {
  currentPlanId: PlanId;
  currentPlanName: string;
  isTrialActive: boolean;
  isTrialExpired: boolean;
  hasActivePlan: boolean;
  canAccessModule: (module: string) => boolean;
  canAccessRoute: (route: string) => boolean;
  getRequiredPlanForModule: (module: string) => string;
  getRequiredPlanForRoute: (route: string) => string;
  getModuleName: (module: string) => string;
  requiresAccountingSetup: boolean;
  skipPeriodValidation: boolean;
  limits: {
    users: number;
    invoicesPerMonth: number;
    warehouses: number;
    products: number;
  };
}

export function usePlanPermissions(): PlanPermissions {
  const { currentPlan, getTrialStatus } = usePlans();
  
  const trialStatus = getTrialStatus();
  const isTrialActive = trialStatus === 'active' || trialStatus === 'warning';
  const isTrialExpired = trialStatus === 'expired';
  const hasActivePlan = currentPlan?.active || false;

  // Determinar el plan actual
  const currentPlanId = useMemo((): PlanId => {
    if (hasActivePlan && currentPlan?.id) {
      // Mapear el ID del plan guardado a nuestros IDs
      const planId = currentPlan.id.toLowerCase();
      if (planId.includes('facturacion-simple') || planId === 'facturacion-simple') return 'facturacion-simple';
      if (planId.includes('facturacion-premium') || planId === 'facturacion-premium') return 'facturacion-premium';
      if (planId.includes('pos-premium') || planId === 'pos-premium') return 'pos-premium';
      if (planId.includes('pos-super-plus') || planId === 'pos-super-plus') return 'pos-super-plus';
      // Si tiene un plan activo pero no coincide, dar acceso completo
      return 'pos-super-plus';
    }
    if (isTrialActive) return 'trial';
    return 'none';
  }, [hasActivePlan, currentPlan, isTrialActive]);

  const planConfig = PLAN_CONFIGS[currentPlanId];
  const currentPlanName = planConfig?.name || 'Sin Plan';

  // Verificar si puede acceder a un módulo
  const canAccessModule = (module: string): boolean => {
    if (!planConfig) return false;
    if (isTrialExpired && currentPlanId === 'none') return false;
    return planConfig.modules.includes(module);
  };

  // Verificar si puede acceder a una ruta
  const canAccessRoute = (route: string): boolean => {
    if (!planConfig) return false;
    
    // Rutas siempre permitidas
    const alwaysAllowed = ['/plans', '/profile', '/settings', '/login', '/register', '/'];
    if (alwaysAllowed.some(r => route === r || route.startsWith(r + '/'))) {
      // Excepto settings para plan none si trial expirado
      if (route.startsWith('/settings') && isTrialExpired && currentPlanId === 'none') {
        return true; // Permitir settings incluso sin plan
      }
      return true;
    }

    // Durante trial activo, permitir todo
    if (isTrialActive && currentPlanId === 'trial') {
      return true;
    }

    // Si trial expirado y sin plan, bloquear todo excepto las rutas permitidas
    if (isTrialExpired && currentPlanId === 'none') {
      return false;
    }

    // Verificar si la ruta está en las rutas permitidas del plan
    // Primero verificar coincidencia exacta
    if (planConfig.routes.includes(route)) return true;

    // Luego verificar si alguna ruta del plan es prefijo de la ruta actual
    for (const allowedRoute of planConfig.routes) {
      if (allowedRoute === '*') return true;
      if (route.startsWith(allowedRoute + '/')) return true;
      if (route === allowedRoute) return true;
    }

    // Verificar por módulo
    const module = ROUTE_TO_MODULE[route];
    if (module && canAccessModule(module)) return true;

    // Verificar rutas padre
    const routeParts = route.split('/').filter(Boolean);
    for (let i = routeParts.length - 1; i >= 0; i--) {
      const parentRoute = '/' + routeParts.slice(0, i + 1).join('/');
      if (planConfig.routes.includes(parentRoute)) return true;
      const parentModule = ROUTE_TO_MODULE[parentRoute];
      if (parentModule && canAccessModule(parentModule)) return true;
    }

    return false;
  };

  // Obtener el plan requerido para un módulo
  const getRequiredPlanForModule = (module: string): string => {
    return getMinimumPlanName(module);
  };

  // Obtener el plan requerido para una ruta
  const getRequiredPlanForRoute = (route: string): string => {
    const module = ROUTE_TO_MODULE[route];
    if (module) {
      return getMinimumPlanName(module);
    }
    // Buscar en rutas padre
    const routeParts = route.split('/').filter(Boolean);
    for (let i = routeParts.length - 1; i >= 0; i--) {
      const parentRoute = '/' + routeParts.slice(0, i + 1).join('/');
      const parentModule = ROUTE_TO_MODULE[parentRoute];
      if (parentModule) {
        return getMinimumPlanName(parentModule);
      }
    }
    return 'POS Premium';
  };

  // Obtener nombre amigable del módulo
  const getModuleName = (module: string): string => {
    return MODULE_NAMES[module] || module;
  };

  // Determinar si el plan requiere configuración contable completa
  // Los planes básicos (facturacion-simple, facturacion-premium) no requieren períodos contables
  const basicPlans: PlanId[] = ['facturacion-simple', 'facturacion-premium'];
  const requiresAccountingSetup = !basicPlans.includes(currentPlanId) && currentPlanId !== 'none';
  
  // skipPeriodValidation es true para planes básicos (no necesitan validar períodos)
  const skipPeriodValidation = basicPlans.includes(currentPlanId);

  return {
    currentPlanId,
    currentPlanName,
    isTrialActive,
    isTrialExpired,
    hasActivePlan,
    canAccessModule,
    canAccessRoute,
    getRequiredPlanForModule,
    getRequiredPlanForRoute,
    getModuleName,
    requiresAccountingSetup,
    skipPeriodValidation,
    limits: planConfig?.limits || {
      users: 0,
      invoicesPerMonth: 0,
      warehouses: 0,
      products: 0,
    },
  };
}

export default usePlanPermissions;
