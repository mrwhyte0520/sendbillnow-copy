import { usePlans } from './usePlans';

export interface PlanLimitations {
  maxCompanies: number;
  maxUsers: number;
  maxProducts: number;
  maxEmployees: number;
  hasAdvancedReports: boolean;
  hasBankingManagement: boolean;
  hasAdvancedAnalytics: boolean;
  hasPayroll: boolean;
  hasMultiBranch: boolean;
  hasElectronicInvoicing: boolean;
  hasFixedAssets: boolean;
  hasInventoryManagement: boolean;
  hasAccountingPeriods: boolean;
  hasGeneralJournal: boolean;
  hasGeneralLedger: boolean;
  hasChartOfAccounts: boolean;
  hasFinancialStatements: boolean;
  hasBankReconciliation: boolean;
  hasTaxReports: boolean;
  hasAccountsPayable: boolean;
  hasAccountsReceivable: boolean;
  hasBilling: boolean;
  hasPOS: boolean;
}

export function usePlanLimitations() {
  const { currentPlan, hasAccess } = usePlans();

  const getPlanLimitations = (): PlanLimitations => {
    if (!hasAccess() || !currentPlan?.active) {
      // Sin plan activo - solo acceso básico durante trial
      return {
        maxCompanies: 1,
        maxUsers: 1,
        maxProducts: 50,
        maxEmployees: 0,
        hasAdvancedReports: false,
        hasBankingManagement: false,
        hasAdvancedAnalytics: false,
        hasPayroll: false,
        hasMultiBranch: false,
        hasElectronicInvoicing: false,
        hasFixedAssets: false,
        hasInventoryManagement: true,
        hasAccountingPeriods: true,
        hasGeneralJournal: true,
        hasGeneralLedger: true,
        hasChartOfAccounts: true,
        hasFinancialStatements: false,
        hasBankReconciliation: false,
        hasTaxReports: false,
        hasAccountsPayable: false,
        hasAccountsReceivable: false,
        hasBilling: true,
        hasPOS: false
      };
    }

    switch (currentPlan.id) {
      case 'pyme':
        return {
          maxCompanies: 1,
          maxUsers: 2,
          maxProducts: 500,
          maxEmployees: 0,
          hasAdvancedReports: false,
          hasBankingManagement: false,
          hasAdvancedAnalytics: false,
          hasPayroll: false,
          hasMultiBranch: false,
          hasElectronicInvoicing: false,
          hasFixedAssets: true,
          hasInventoryManagement: true,
          hasAccountingPeriods: true,
          hasGeneralJournal: true,
          hasGeneralLedger: true,
          hasChartOfAccounts: true,
          hasFinancialStatements: true,
          hasBankReconciliation: false,
          hasTaxReports: true,
          hasAccountsPayable: false,
          hasAccountsReceivable: false,
          hasBilling: true,
          hasPOS: false
        };

      case 'pro':
        return {
          maxCompanies: 3,
          maxUsers: 5,
          maxProducts: 2000,
          maxEmployees: 10,
          hasAdvancedReports: true,
          hasBankingManagement: true,
          hasAdvancedAnalytics: false,
          hasPayroll: true,
          hasMultiBranch: false,
          hasElectronicInvoicing: false,
          hasFixedAssets: true,
          hasInventoryManagement: true,
          hasAccountingPeriods: true,
          hasGeneralJournal: true,
          hasGeneralLedger: true,
          hasChartOfAccounts: true,
          hasFinancialStatements: true,
          hasBankReconciliation: true,
          hasTaxReports: true,
          hasAccountsPayable: true,
          hasAccountsReceivable: true,
          hasBilling: true,
          hasPOS: true
        };

      case 'plus':
      case 'student':
        return {
          maxCompanies: -1, // Ilimitado
          maxUsers: -1, // Ilimitado
          maxProducts: -1, // Ilimitado
          maxEmployees: -1, // Ilimitado
          hasAdvancedReports: true,
          hasBankingManagement: true,
          hasAdvancedAnalytics: true,
          hasPayroll: true,
          hasMultiBranch: true,
          hasElectronicInvoicing: true,
          hasFixedAssets: true,
          hasInventoryManagement: true,
          hasAccountingPeriods: true,
          hasGeneralJournal: true,
          hasGeneralLedger: true,
          hasChartOfAccounts: true,
          hasFinancialStatements: true,
          hasBankReconciliation: true,
          hasTaxReports: true,
          hasAccountsPayable: true,
          hasAccountsReceivable: true,
          hasBilling: true,
          hasPOS: true
        };

      default:
        // Fallback a valores por defecto sin plan
        return {
          maxCompanies: 1,
          maxUsers: 1,
          maxProducts: 50,
          maxEmployees: 0,
          hasAdvancedReports: false,
          hasBankingManagement: false,
          hasAdvancedAnalytics: false,
          hasPayroll: false,
          hasMultiBranch: false,
          hasElectronicInvoicing: false,
          hasFixedAssets: false,
          hasInventoryManagement: true,
          hasAccountingPeriods: true,
          hasGeneralJournal: true,
          hasGeneralLedger: true,
          hasChartOfAccounts: true,
          hasFinancialStatements: false,
          hasBankReconciliation: false,
          hasTaxReports: false,
          hasAccountsPayable: false,
          hasAccountsReceivable: false,
          hasBilling: true,
          hasPOS: false
        }
    }
  };

  const limitations = getPlanLimitations();

  const checkFeatureAccess = (feature: keyof PlanLimitations): boolean => {
    return limitations[feature] as boolean;
  };

  const checkQuantityLimit = (
    feature: 'maxCompanies' | 'maxUsers' | 'maxProducts' | 'maxEmployees',
    currentCount: number
  ): { allowed: boolean; limit: number; message?: string } => {
    const limit = limitations[feature];
    
    if (limit === -1) {
      return { allowed: true, limit: -1 };
    }

    const allowed = currentCount < limit;
    const message = allowed 
      ? undefined 
      : `Has alcanzado el límite de ${limit} ${getFeatureName(feature)} para tu plan ${currentPlan?.name || 'actual'}.`;

    return { allowed, limit, message };
  };

  const getFeatureName = (feature: string): string => {
    const names: Record<string, string> = {
      maxCompanies: 'empresas',
      maxUsers: 'usuarios',
      maxProducts: 'productos',
      maxEmployees: 'empleados'
    };
    return names[feature] || feature;
  };

  const getUpgradeMessage = (): string => {
    const currentPlanName = currentPlan?.name || 'actual';
    
    if (!currentPlan?.active) {
      return 'Necesitas una suscripción activa para acceder a esta función.';
    }

    switch (currentPlan.id) {
      case 'pyme':
        return `Esta función requiere el plan PRO o superior. Tu plan ${currentPlanName} no incluye esta característica.`;
      case 'pro':
        return `Esta función requiere el plan PLUS. Tu plan ${currentPlanName} no incluye esta característica.`;
      default:
        return `Esta función no está disponible en tu plan ${currentPlanName}.`;
    }
  };

  return {
    limitations,
    checkFeatureAccess,
    checkQuantityLimit,
    getUpgradeMessage,
    currentPlan: currentPlan?.name || 'Sin plan'
  };
}