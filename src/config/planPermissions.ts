// Configuración de permisos por plan
// Define qué módulos y rutas están disponibles para cada plan

export type PlanId = 'facturacion-simple' | 'facturacion-premium' | 'pos-premium' | 'pos-super-plus' | 'trial' | 'none';

export interface PlanLimits {
  users: number;
  invoicesPerMonth: number;
  warehouses: number;
  products: number;
}

export interface PlanConfig {
  id: PlanId;
  name: string;
  modules: string[];
  routes: string[];
  limits: PlanLimits;
}

// Módulos del sistema
export const MODULES = {
  DASHBOARD: 'dashboard',
  BILLING: 'billing',
  INVOICING: 'invoicing',
  QUOTES: 'quotes',
  CREDIT_NOTES: 'credit-notes',
  REPORTS: 'reports',
  INVENTORY: 'inventory',
  PRODUCTS: 'products',
  POS: 'pos',
  CUSTOMERS: 'customers',
  SUPPLIERS: 'suppliers',
  PURCHASES: 'purchases',
  EXPENSES: 'expenses',
  ACCOUNTS_RECEIVABLE: 'accounts-receivable',
  ACCOUNTS_PAYABLE: 'accounts-payable',
  PAYROLL: 'payroll',
  BANKS: 'banks',
  PETTY_CASH: 'petty-cash',
  COMMISSIONS: 'commissions',
  REPAIRS: 'repairs',
  RETURNS: 'returns',
  MULTI_BRANCH: 'multi-branch',
  MULTI_CURRENCY: 'multi-currency',
  ACCOUNTING: 'accounting',
  TAXES: 'taxes',
  SETTINGS: 'settings',
  USERS: 'users',
  FIXED_ASSETS: 'fixed-assets',
  STATISTICS: 'statistics',
  REFERRALS: 'referrals',
  ACCOUNTING_SETTINGS: 'accounting-settings',
} as const;

// Configuración de cada plan
export const PLAN_CONFIGS: Record<PlanId, PlanConfig> = {
  'facturacion-simple': {
    id: 'facturacion-simple',
    name: 'Facturación Simple',
    modules: [
      MODULES.DASHBOARD,
      MODULES.BILLING,
      MODULES.INVOICING,
      MODULES.QUOTES,
      MODULES.CREDIT_NOTES,
      MODULES.REPORTS,
      MODULES.CUSTOMERS,
      MODULES.SETTINGS,
    ],
    routes: [
      '/dashboard',
      '/billing',
      '/billing/invoicing',
      '/billing/quotes',
      '/billing/credit-notes',
      '/billing/debit-notes',
      '/reports',
      '/customers',
      '/settings',
      '/profile',
      '/plans',
    ],
    limits: {
      users: 1,
      invoicesPerMonth: 100,
      warehouses: 0,
      products: 0,
    }
  },
  'facturacion-premium': {
    id: 'facturacion-premium',
    name: 'Facturación Premium',
    modules: [
      MODULES.DASHBOARD,
      MODULES.BILLING,
      MODULES.INVOICING,
      MODULES.QUOTES,
      MODULES.CREDIT_NOTES,
      MODULES.REPORTS,
      MODULES.CUSTOMERS,
      MODULES.INVENTORY,
      MODULES.PRODUCTS,
      MODULES.SETTINGS,
    ],
    routes: [
      '/dashboard',
      '/billing',
      '/billing/invoicing',
      '/billing/quotes',
      '/billing/credit-notes',
      '/billing/debit-notes',
      '/reports',
      '/customers',
      '/inventory',
      '/inventory/products',
      '/inventory/warehouses',
      '/settings',
      '/profile',
      '/plans',
    ],
    limits: {
      users: 8,
      invoicesPerMonth: 500,
      warehouses: 1,
      products: 1000,
    }
  },
  'pos-premium': {
    id: 'pos-premium',
    name: 'POS Premium',
    modules: [
      MODULES.DASHBOARD,
      MODULES.POS,
      MODULES.BILLING,
      MODULES.INVOICING,
      MODULES.QUOTES,
      MODULES.CREDIT_NOTES,
      MODULES.REPORTS,
      MODULES.INVENTORY,
      MODULES.PRODUCTS,
      MODULES.CUSTOMERS,
      MODULES.SUPPLIERS,
      MODULES.PURCHASES,
      MODULES.EXPENSES,
      MODULES.ACCOUNTS_RECEIVABLE,
      MODULES.ACCOUNTS_PAYABLE,
      MODULES.PAYROLL,
      MODULES.BANKS,
      MODULES.PETTY_CASH,
      MODULES.COMMISSIONS,
      MODULES.REPAIRS,
      MODULES.RETURNS,
      MODULES.MULTI_BRANCH,
      MODULES.ACCOUNTING,
      MODULES.TAXES,
      MODULES.SETTINGS,
      MODULES.USERS,
      MODULES.FIXED_ASSETS,
      MODULES.STATISTICS,
      MODULES.REFERRALS,
      MODULES.ACCOUNTING_SETTINGS,
    ],
    routes: [
      '/dashboard',
      '/pos',
      '/billing',
      '/billing/invoicing',
      '/billing/quotes',
      '/billing/credit-notes',
      '/billing/debit-notes',
      '/billing/recurring',
      '/reports',
      '/inventory',
      '/inventory/products',
      '/inventory/warehouses',
      '/inventory/movements',
      '/customers',
      '/suppliers',
      '/purchases',
      '/expenses',
      '/accounts-receivable',
      '/accounts-payable',
      '/payroll',
      '/banks',
      '/banks-module',
      '/petty-cash',
      '/commissions',
      '/repairs',
      '/returns',
      '/accounting',
      '/taxes',
      '/settings',
      '/settings/accounting',
      '/users',
      '/fixed-assets',
      '/statistics',
      '/referrals',
      '/profile',
      '/plans',
    ],
    limits: {
      users: 80,
      invoicesPerMonth: 2000,
      warehouses: 2,
      products: -1, // ilimitado
    }
  },
  'pos-super-plus': {
    id: 'pos-super-plus',
    name: 'POS Super Plus',
    modules: [
      MODULES.DASHBOARD,
      MODULES.POS,
      MODULES.BILLING,
      MODULES.INVOICING,
      MODULES.QUOTES,
      MODULES.CREDIT_NOTES,
      MODULES.REPORTS,
      MODULES.INVENTORY,
      MODULES.PRODUCTS,
      MODULES.CUSTOMERS,
      MODULES.SUPPLIERS,
      MODULES.PURCHASES,
      MODULES.EXPENSES,
      MODULES.ACCOUNTS_RECEIVABLE,
      MODULES.ACCOUNTS_PAYABLE,
      MODULES.PAYROLL,
      MODULES.BANKS,
      MODULES.PETTY_CASH,
      MODULES.COMMISSIONS,
      MODULES.REPAIRS,
      MODULES.RETURNS,
      MODULES.MULTI_BRANCH,
      MODULES.ACCOUNTING,
      MODULES.TAXES,
      MODULES.SETTINGS,
      MODULES.USERS,
      MODULES.FIXED_ASSETS,
      MODULES.STATISTICS,
      MODULES.REFERRALS,
      MODULES.ACCOUNTING_SETTINGS,
    ],
    routes: [
      '/dashboard',
      '/pos',
      '/billing',
      '/billing/invoicing',
      '/billing/quotes',
      '/billing/credit-notes',
      '/billing/debit-notes',
      '/billing/recurring',
      '/reports',
      '/inventory',
      '/inventory/products',
      '/inventory/warehouses',
      '/inventory/movements',
      '/customers',
      '/suppliers',
      '/purchases',
      '/expenses',
      '/accounts-receivable',
      '/accounts-payable',
      '/payroll',
      '/banks',
      '/banks-module',
      '/petty-cash',
      '/commissions',
      '/repairs',
      '/returns',
      '/accounting',
      '/taxes',
      '/settings',
      '/settings/accounting',
      '/users',
      '/fixed-assets',
      '/statistics',
      '/referrals',
      '/profile',
      '/plans',
    ],
    limits: {
      users: 300,
      invoicesPerMonth: -1, // ilimitado
      warehouses: 5,
      products: -1, // ilimitado
    }
  },
  'trial': {
    id: 'trial',
    name: 'Prueba Gratuita',
    modules: [
      MODULES.DASHBOARD,
      MODULES.POS,
      MODULES.BILLING,
      MODULES.INVOICING,
      MODULES.QUOTES,
      MODULES.CREDIT_NOTES,
      MODULES.REPORTS,
      MODULES.INVENTORY,
      MODULES.PRODUCTS,
      MODULES.CUSTOMERS,
      MODULES.SUPPLIERS,
      MODULES.PURCHASES,
      MODULES.EXPENSES,
      MODULES.ACCOUNTS_RECEIVABLE,
      MODULES.ACCOUNTS_PAYABLE,
      MODULES.PAYROLL,
      MODULES.BANKS,
      MODULES.PETTY_CASH,
      MODULES.COMMISSIONS,
      MODULES.REPAIRS,
      MODULES.RETURNS,
      MODULES.MULTI_BRANCH,
      MODULES.ACCOUNTING,
      MODULES.TAXES,
      MODULES.SETTINGS,
      MODULES.USERS,
      MODULES.FIXED_ASSETS,
      MODULES.ACCOUNTING_SETTINGS,
    ],
    routes: ['*'], // Todas las rutas durante prueba
    limits: {
      users: 5,
      invoicesPerMonth: 50,
      warehouses: 1,
      products: 100,
    }
  },
  'none': {
    id: 'none',
    name: 'Sin Plan',
    modules: [],
    routes: ['/plans', '/profile', '/settings'],
    limits: {
      users: 0,
      invoicesPerMonth: 0,
      warehouses: 0,
      products: 0,
    }
  }
};

// Mapeo de rutas a módulos para verificación
export const ROUTE_TO_MODULE: Record<string, string> = {
  '/dashboard': MODULES.DASHBOARD,
  '/pos': MODULES.POS,
  '/billing': MODULES.BILLING,
  '/billing/invoicing': MODULES.INVOICING,
  '/billing/quotes': MODULES.QUOTES,
  '/billing/credit-notes': MODULES.CREDIT_NOTES,
  '/billing/debit-notes': MODULES.CREDIT_NOTES,
  '/billing/recurring': MODULES.BILLING,
  '/reports': MODULES.REPORTS,
  '/inventory': MODULES.INVENTORY,
  '/inventory/products': MODULES.PRODUCTS,
  '/inventory/warehouses': MODULES.INVENTORY,
  '/inventory/movements': MODULES.INVENTORY,
  '/customers': MODULES.CUSTOMERS,
  '/suppliers': MODULES.SUPPLIERS,
  '/purchases': MODULES.PURCHASES,
  '/expenses': MODULES.EXPENSES,
  '/accounts-receivable': MODULES.ACCOUNTS_RECEIVABLE,
  '/accounts-payable': MODULES.ACCOUNTS_PAYABLE,
  '/payroll': MODULES.PAYROLL,
  '/banks': MODULES.BANKS,
  '/banks-module': MODULES.BANKS,
  '/petty-cash': MODULES.PETTY_CASH,
  '/commissions': MODULES.COMMISSIONS,
  '/repairs': MODULES.REPAIRS,
  '/returns': MODULES.RETURNS,
  '/accounting': MODULES.ACCOUNTING,
  '/taxes': MODULES.TAXES,
  '/settings': MODULES.SETTINGS,
  '/users': MODULES.USERS,
  '/fixed-assets': MODULES.FIXED_ASSETS,
  '/statistics': MODULES.STATISTICS,
  '/referrals': MODULES.REFERRALS,
  '/settings/accounting': MODULES.ACCOUNTING_SETTINGS,
};

// Nombres amigables para los módulos
export const MODULE_NAMES: Record<string, string> = {
  [MODULES.DASHBOARD]: 'Dashboard',
  [MODULES.POS]: 'Punto de Venta (POS)',
  [MODULES.BILLING]: 'Facturación',
  [MODULES.INVOICING]: 'Facturas',
  [MODULES.QUOTES]: 'Cotizaciones',
  [MODULES.CREDIT_NOTES]: 'Notas de Crédito/Débito',
  [MODULES.REPORTS]: 'Reportes',
  [MODULES.INVENTORY]: 'Inventario',
  [MODULES.PRODUCTS]: 'Productos',
  [MODULES.CUSTOMERS]: 'Clientes',
  [MODULES.SUPPLIERS]: 'Proveedores',
  [MODULES.PURCHASES]: 'Compras',
  [MODULES.EXPENSES]: 'Gastos',
  [MODULES.ACCOUNTS_RECEIVABLE]: 'Cuentas por Cobrar',
  [MODULES.ACCOUNTS_PAYABLE]: 'Cuentas por Pagar',
  [MODULES.PAYROLL]: 'Nómina',
  [MODULES.BANKS]: 'Gestión Bancaria',
  [MODULES.PETTY_CASH]: 'Caja Chica',
  [MODULES.COMMISSIONS]: 'Comisiones',
  [MODULES.REPAIRS]: 'Servicio de Reparaciones',
  [MODULES.RETURNS]: 'Devoluciones',
  [MODULES.MULTI_BRANCH]: 'Multisucursal',
  [MODULES.MULTI_CURRENCY]: 'Multimoneda',
  [MODULES.ACCOUNTING]: 'Contabilidad',
  [MODULES.TAXES]: 'Impuestos',
  [MODULES.SETTINGS]: 'Configuración',
  [MODULES.USERS]: 'Usuarios',
  [MODULES.FIXED_ASSETS]: 'Activos Fijos',
  [MODULES.STATISTICS]: 'Estadísticas',
  [MODULES.REFERRALS]: 'Referidos',
  [MODULES.ACCOUNTING_SETTINGS]: 'Configuración Contable',
};

// Función para obtener el plan mínimo requerido para un módulo
export function getMinimumPlanForModule(module: string): PlanId {
  // Módulos básicos disponibles desde Facturación Simple
  const basicModules: string[] = [MODULES.DASHBOARD, MODULES.BILLING, MODULES.INVOICING, MODULES.QUOTES, MODULES.CREDIT_NOTES, MODULES.REPORTS, MODULES.CUSTOMERS, MODULES.SETTINGS];
  if (basicModules.includes(module)) return 'facturacion-simple';

  // Módulos de inventario disponibles desde Facturación Premium
  const inventoryModules: string[] = [MODULES.INVENTORY, MODULES.PRODUCTS];
  if (inventoryModules.includes(module)) return 'facturacion-premium';

  // Todos los demás módulos requieren POS Premium
  return 'pos-premium';
}

// Función para obtener el nombre del plan mínimo requerido
export function getMinimumPlanName(module: string): string {
  const planId = getMinimumPlanForModule(module);
  return PLAN_CONFIGS[planId]?.name || 'Plan desconocido';
}
