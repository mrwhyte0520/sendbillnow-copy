// =============================================================================
// CONTADOR MODULE - Services Index
// =============================================================================

// Staff Report (Employees, Roles, Attendance)
export { default as staffService } from './staff.service';
export * from './staff.service';

// Cash & Finance (Drawers, Transactions, Expenses)
export { default as cashService } from './cash.service';
export * from './cash.service';

// Payroll (Runs, Profiles, Items, Tax Lines)
export { default as payrollService } from './payroll.service';
export * from './payroll.service';

// Vendors & Purchases (Vendors, POs, Bills, Payments)
export { default as vendorsModule } from './vendors.service';
export * from './vendors.service';

// Products (Catalog, Price History)
export { default as productsModule } from './products.service';
export * from './products.service';

// Inventory (Locations, Balances, Movements, Valuation)
export { default as inventoryService } from './inventory.service';
export * from './inventory.service';

// Returns (Sales Returns, Vendor Returns)
export { default as returnsService } from './returns.service';
export * from './returns.service';

// Reports (Periods, Snapshots, Tax, Report Generation)
export { default as reportsService } from './reports.service';
export * from './reports.service';

// =============================================================================
// UNIFIED CONTADOR SERVICE
// =============================================================================

import staffService from './staff.service';
import cashService from './cash.service';
import payrollService from './payroll.service';
import vendorsModule from './vendors.service';
import productsModule from './products.service';
import inventoryService from './inventory.service';
import returnsService from './returns.service';
import reportsService from './reports.service';

export const contadorService = {
  staff: staffService,
  cash: cashService,
  payroll: payrollService,
  vendors: vendorsModule,
  products: productsModule,
  inventory: inventoryService,
  returns: returnsService,
  reports: reportsService,
};

export default contadorService;
