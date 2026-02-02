
import { type RouteObject } from 'react-router';
import { Navigate } from 'react-router-dom';
import { lazy } from 'react';
import DashboardLayout from '../components/layout/DashboardLayout';
import ProtectedRoute from '../components/auth/ProtectedRoute';

import TaxConfigurationPage from '../pages/taxes/configuration/page';
import NcfManagementPage from '../pages/taxes/ncf/page';
import FiscalSeriesPage from '../pages/taxes/fiscal-series/page';
import Report606Page from '../pages/taxes/report-606/page';
import Report607Page from '../pages/taxes/report-607/page';
import Report608Page from '../pages/taxes/report-608/page';
import Report623Page from '../pages/taxes/report-623/page';
import ReportIT1Page from '../pages/taxes/report-it1/page';
import ReportIR17Page from '../pages/taxes/report-ir17/page';
import Formulario607Page from '../pages/taxes/formulario-607/page';
import ItbisProportionalityPage from '../pages/taxes/itbis-proportionality/page';

// Payroll routes
import PayrollPage from '../pages/payroll/page';
import PayrollConfigurationPage from '../pages/payroll/configuration/page';
import PayrollEmployeesPage from '../pages/payroll/employees/page';
import PayrollEmployeeTypesPage from '../pages/payroll/employee-types/page';
import PayrollDepartmentsPage from '../pages/payroll/departments/page';
import PayrollPositionsPage from '../pages/payroll/positions/page';
import PayrollSalaryTypesPage from '../pages/payroll/salary-types/page';
import PayrollConceptsPage from '../pages/payroll/concepts/page';
import PayrollPeriodsPage from '../pages/payroll/periods/page';
import PayrollCommissionTypesPage from '../pages/payroll/commission-types/page';
import PayrollVacationsPage from '../pages/payroll/vacations/page';
import PayrollOvertimePage from '../pages/payroll/overtime/page';
import PayrollHolidaysPage from '../pages/payroll/holidays/page';
import PayrollBonusesPage from '../pages/payroll/bonuses/page';
import PayrollRoyaltiesPage from '../pages/payroll/royalties/page';
import PayrollDeductionsPage from '../pages/payroll/deductions/page';
import PayrollOtherDeductionsPage from '../pages/payroll/other-deductions/page';
import PayrollAbsencesPage from '../pages/payroll/absences/page';
import PayrollProcessPage from '../pages/payroll/payroll-process/page';
import PayrollJournalEntryPage from '../pages/payroll/journal-entry/page';
import PayrollSalaryChangesPage from '../pages/payroll/salary-changes/page';
import PayrollEmployeeExitsPage from '../pages/payroll/employee-exits/page';

const PublicDocumentPage = lazy(() => import('../pages/public-document/page'));
const PublicJobsPage = lazy(() => import('../pages/public-jobs/page'));
const PublicIdCardPage = lazy(() => import('../pages/public-id-card/page'));

const HomePage = lazy(() => import('../pages/home/page'));
const DemoPage = lazy(() => import('../pages/demo/page'));
const DashboardPage = lazy(() => import('../pages/dashboard/page'));
const StatisticsPage = lazy(() => import('../pages/statistics/page'));

// Contador Pages
const ContadorPage = lazy(() => import('../pages/contador/page'));
const ContadorStaffReportPage = lazy(() => import('../pages/contador/staff-report/page'));
const ContadorCajaFinanzaPage = lazy(() => import('../pages/contador/caja-finanza/page'));
const ContadorNominaPage = lazy(() => import('../pages/contador/nomina/page'));
const ContadorCompraProveedoresPage = lazy(() => import('../pages/contador/compra-proveedores/page'));
const ContadorProductsPage = lazy(() => import('../pages/contador/products/page'));
const ContadorInventarioPage = lazy(() => import('../pages/contador/inventario/page'));
const ContadorDevolucionesPage = lazy(() => import('../pages/contador/devoluciones/page'));
const ContadorReportesPage = lazy(() => import('../pages/contador/reportes/page'));

const AccountingPage = lazy(() => import('../pages/accounting/page'));
const ChartAccountsPage = lazy(() => import('../pages/accounting/chart-accounts/page'));

// Accounting Sub-pages
const BanksPage = lazy(() => import('../pages/accounting/banks/page'));
const BankReconciliationPage = lazy(() => import('../pages/accounting/bank-reconciliation/page'));
const PettyCashPage = lazy(() => import('../pages/accounting/petty-cash/page'));
const PettyCashReportPage = lazy(() => import('../pages/accounting/petty-cash/report'));
const FinancialStatementsPage = lazy(() => import('../pages/accounting/financial-statements/page'));
const GeneralJournalPage = lazy(() => import('../pages/accounting/general-journal/page'));
const GeneralLedgerPage = lazy(() => import('../pages/accounting/general-ledger/page'));
const AccountingPeriodsPage = lazy(() => import('../pages/accounting/periods/page'));
const TrialBalancePage = lazy(() => import('../pages/accounting/trial-balance/page'));

const POSPage = lazy(() => import('../pages/pos/page'));
const CustomerDisplayPage = lazy(() => import('../pages/pos/customer-display'));
const ProductsPage = lazy(() => import('../pages/products/page'));
const CustomersPage = lazy(() => import('../pages/customers/page'));
const UsersPage = lazy(() => import('../pages/users/page'));
const InventoryPage = lazy(() => import('../pages/inventory/page'));
const InventoryReportsPage = lazy(() => import('../pages/inventory/reports/page'));

// Cash & Finance Pages
const CashFinancePage = lazy(() => import('../pages/cash-finance/page'));
const InventoryPhysicalCountPage = lazy(() => import('../pages/inventory/physical-count/page'));
const InventoryPhysicalResultPage = lazy(() => import('../pages/inventory/physical-result/page'));
const InventoryCostRevaluationPage = lazy(() => import('../pages/inventory/cost-revaluation/page'));
const FixedAssetsPage = lazy(() => import('../pages/fixed-assets/page'));
const AccountsReceivablePage = lazy(() => import('../pages/accounts-receivable/page'));
const AccountsPayablePage = lazy(() => import('../pages/accounts-payable/page'));
const BillingPage = lazy(() => import('../pages/billing/page'));
const TaxesPage = lazy(() => import('../pages/taxes/page'));
const PlansPage = lazy(() => import('../pages/plans/page'));
const StudentVerifyPage = lazy(() => import('../pages/plans/student-verify'));
const ProfilePage = lazy(() => import('../pages/profile/page'));
const ReferralsPage = lazy(() => import('../pages/referrals/page'));
const LoginPage = lazy(() => import('../pages/auth/login'));
const RegisterPage = lazy(() => import('../pages/auth/register'));
const ResetPasswordPage = lazy(() => import('../pages/auth/reset-password'));
const NotFoundPage = lazy(() => import('../pages/NotFound'));
const DocumentPage = lazy(() => import('../pages/document/page'));

// Settings Pages
const SettingsPage = lazy(() => import('../pages/settings/page'));
const CompanySettingsPage = lazy(() => import('../pages/settings/company/page'));

// Admin Pages
const AdminDemoRequestsPage = lazy(() => import('../pages/admin/demo-requests/page'));
const AdminDashboardPage = lazy(() => import('../pages/admin/dashboard/page'));
const UsersSettingsPage = lazy(() => import('../pages/settings/users/page'));
const AccountingSettingsPage = lazy(() => import('../pages/settings/accounting/page'));
const TaxSettingsPage = lazy(() => import('../pages/settings/taxes/page'));
const InventorySettingsPage = lazy(() => import('../pages/settings/inventory/page'));
const PayrollSettingsPage = lazy(() => import('../pages/settings/payroll/page'));
const BackupSettingsPage = lazy(() => import('../pages/settings/backup/page'));
const IntegrationsSettingsPage = lazy(() => import('../pages/settings/integrations/page'));
const StoresPage = lazy(() => import('../pages/settings/stores/page'));

// Billing Pages
const SalesReportsPage = lazy(() => import('../pages/billing/sales-reports/page'));
const CommissionReportPage = lazy(() => import('../pages/billing/commission-report/page'));
const InvoicingPage = lazy(() => import('../pages/billing/invoicing/page'));
const PreInvoicingPage = lazy(() => import('../pages/billing/pre-invoicing/page'));
const RecurringBillingPage = lazy(() => import('../pages/billing/recurring/page'));
const CashClosingPage = lazy(() => import('../pages/billing/cash-closing/page'));
const QuotesPage = lazy(() => import('../pages/billing/quotes/page'));
const AuthorizationsPage = lazy(() => import('../pages/billing/authorizations/page'));
const SalesRepsPage = lazy(() => import('../pages/billing/sales-reps/page'));
const SalesRepTypesPage = lazy(() => import('../pages/billing/sales-rep-types/page'));
const BillingJobsPage = lazy(() => import('../pages/billing/jobs/page'));

// Accounts Payable Pages
const APReportsPage = lazy(() => import('../pages/accounts-payable/reports/page'));
const SuppliersPage = lazy(() => import('../pages/accounts-payable/suppliers/page'));
const PaymentsPage = lazy(() => import('../pages/accounts-payable/payments/page'));
const PurchaseOrdersPage = lazy(() => import('../pages/accounts-payable/purchase-orders/page'));
const APQuotesPage = lazy(() => import('../pages/accounts-payable/quotes/page'));
const AdvancesPage = lazy(() => import('../pages/accounts-payable/advances/page'));
const SupplierTypesPage = lazy(() => import('../pages/accounts-payable/supplier-types/page'));
const PaymentTermsPage = lazy(() => import('../pages/accounts-payable/payment-terms/page'));
const APInvoicesPage = lazy(() => import('../pages/accounts-payable/invoices/page'));
const APDebitCreditNotesPage = lazy(() => import('../pages/accounts-payable/debit-credit-notes/page'));

// Accounts Receivable Pages
const ARInvoicesPage = lazy(() => import('../pages/accounts-receivable/invoices/page'));
const ARCustomersPage = lazy(() => import('../pages/accounts-receivable/customers/page'));
const ARPaymentsPage = lazy(() => import('../pages/accounts-receivable/payments/page'));
const ARReportsPage = lazy(() => import('../pages/accounts-receivable/reports/page'));
const ARReceiptsPage = lazy(() => import('../pages/accounts-receivable/receipts/page'));
const ARAdvancesPage = lazy(() => import('../pages/accounts-receivable/advances/page'));
const ARCreditNotesPage = lazy(() => import('../pages/accounts-receivable/credit-notes/page'));
const ARDebitNotesPage = lazy(() => import('../pages/accounts-receivable/debit-notes/page'));
const ARDiscountsPage = lazy(() => import('../pages/accounts-receivable/discounts/page'));
const ARCustomerTypesPage = lazy(() => import('../pages/accounts-receivable/customer-types/page'));
const ARDeliveryNotesPage = lazy(() => import('../pages/accounts-receivable/delivery-notes/page'));

// Fixed Assets Pages
const AssetRegisterPage = lazy(() => import('../pages/fixed-assets/register/page'));
const AssetTypesPage = lazy(() => import('../pages/fixed-assets/types/page'));
const DepreciationPage = lazy(() => import('../pages/fixed-assets/depreciation/page'));
const DepreciationTypesPage = lazy(() => import('../pages/fixed-assets/depreciation-types/page'));
const FixedAssetsReportPage = lazy(() => import('../pages/fixed-assets/report/page'));
const RevaluationPage = lazy(() => import('../pages/fixed-assets/revaluation/page'));
const AssetDisposalPage = lazy(() => import('../pages/fixed-assets/disposal/page'));

// Banks independent module pages
const BankAccountsPage = lazy(() => import('../pages/banks-module/bank-accounts'));
const BankAccountTypesPage = lazy(() => import('../pages/banks-module/account-types'));
const BankDepositsPage = lazy(() => import('../pages/banks-module/deposits'));
const BankPaymentRequestsPage = lazy(() => import('../pages/banks-module/payment-requests'));
const BankChecksPage = lazy(() => import('../pages/banks-module/checks'));
const BankTransfersPage = lazy(() => import('../pages/banks-module/transfers'));
const BankCreditsPage = lazy(() => import('../pages/banks-module/credits'));
const BankChargesPage = lazy(() => import('../pages/banks-module/charges'));
const BankCurrenciesPage = lazy(() => import('../pages/banks-module/currencies'));
const BankExchangeRatesPage = lazy(() => import('../pages/banks-module/exchange-rates'));
const BankReportsPage = lazy(() => import('../pages/banks-module/reports'));
const BankReconciliationModulePage = lazy(() => import('../pages/banks-module/reconciliation'));
const BankReconciliationsHistoryPage = lazy(
  () => import('../pages/banks-module/reconciliations-history'),
);

const routes: RouteObject[] = [
  {
    path: '/',
    element: <HomePage />
  },
  {
    path: '/demo',
    element: <DemoPage />
  },
  {
    path: '/public/document/:type/:token',
    element: <PublicDocumentPage />,
  },
  {
    path: '/public/jobs/:token',
    element: <PublicJobsPage />,
  },
  {
    path: '/public/id-card/:token',
    element: <PublicIdCardPage />,
  },
  {
    path: '/document/:type/:id',
    element: <DocumentPage />,
  },
  {
    path: '/referrals',
    element: <ProtectedRoute><ReferralsPage /></ProtectedRoute>
  },
  {
    path: '/dashboard',
    element: <DashboardPage />
  },
  {
    path: '/statistics',
    element: <StatisticsPage />
  },
  // CONTADOR Module Routes
  {
    path: '/contador',
    element: <ProtectedRoute><ContadorPage /></ProtectedRoute>
  },
  {
    path: '/contador/staff-report',
    element: <ProtectedRoute><ContadorStaffReportPage /></ProtectedRoute>
  },
  {
    path: '/contador/caja-finanza',
    element: <ProtectedRoute><ContadorCajaFinanzaPage /></ProtectedRoute>
  },
  {
    path: '/contador/nomina',
    element: <ProtectedRoute><ContadorNominaPage /></ProtectedRoute>
  },
  {
    path: '/contador/compra-proveedores',
    element: <ProtectedRoute><ContadorCompraProveedoresPage /></ProtectedRoute>
  },
  {
    path: '/contador/products',
    element: <ProtectedRoute><ContadorProductsPage /></ProtectedRoute>
  },
  {
    path: '/contador/inventario',
    element: <ProtectedRoute><ContadorInventarioPage /></ProtectedRoute>
  },
  {
    path: '/contador/devoluciones',
    element: <ProtectedRoute><ContadorDevolucionesPage /></ProtectedRoute>
  },
  {
    path: '/contador/reportes',
    element: <ProtectedRoute><ContadorReportesPage /></ProtectedRoute>
  },
  {
    path: '/profile',
    element: <ProfilePage />
  },
  {
    path: '/accounting',
    element: <ProtectedRoute><AccountingPage /></ProtectedRoute>
  },
  {
    path: '/accounting/chart-accounts',
    element: <ChartAccountsPage />
  },
  // Accounting Sub-routes
  {
    path: '/accounting/banks',
    element: <ProtectedRoute><BanksPage /></ProtectedRoute>
  },
  {
    path: '/accounting/bank-reconciliation',
    element: <ProtectedRoute><BankReconciliationPage /></ProtectedRoute>
  },
  {
    path: '/accounting/petty-cash',
    element: <ProtectedRoute><PettyCashPage /></ProtectedRoute>
  },
  {
    path: '/accounting/petty-cash/report',
    element: <ProtectedRoute><PettyCashReportPage /></ProtectedRoute>
  },
  {
    path: '/accounting/financial-statements',
    element: <ProtectedRoute><FinancialStatementsPage /></ProtectedRoute>
  },
  {
    path: '/accounting/general-journal',
    element: <ProtectedRoute><GeneralJournalPage /></ProtectedRoute>
  },
  {
    path: '/accounting/general-ledger',
    element: <ProtectedRoute><GeneralLedgerPage /></ProtectedRoute>
  },
  {
    path: '/accounting/trial-balance',
    element: <ProtectedRoute><TrialBalancePage /></ProtectedRoute>
  },
  {
    path: '/accounting/periods',
    element: <ProtectedRoute><AccountingPeriodsPage /></ProtectedRoute>
  },
  // Banks independent module
  {
    path: '/banks-module',
    element: <ProtectedRoute><BankAccountsPage /></ProtectedRoute>
  },
  {
    path: '/banks-module/bank-accounts',
    element: <ProtectedRoute><BankAccountsPage /></ProtectedRoute>
  },
  {
    path: '/banks-module/account-types',
    element: <ProtectedRoute><BankAccountTypesPage /></ProtectedRoute>
  },
  {
    path: '/banks-module/deposits',
    element: <ProtectedRoute><BankDepositsPage /></ProtectedRoute>
  },
  {
    path: '/banks-module/payment-requests',
    element: <ProtectedRoute><BankPaymentRequestsPage /></ProtectedRoute>
  },
  {
    path: '/banks-module/checks',
    element: <ProtectedRoute><BankChecksPage /></ProtectedRoute>
  },
  {
    path: '/banks-module/transfers',
    element: <ProtectedRoute><BankTransfersPage /></ProtectedRoute>
  },
  {
    path: '/banks-module/credits',
    element: <ProtectedRoute><BankCreditsPage /></ProtectedRoute>
  },
  {
    path: '/banks-module/charges',
    element: <ProtectedRoute><BankChargesPage /></ProtectedRoute>
  },
  {
    path: '/banks-module/currencies',
    element: <ProtectedRoute><BankCurrenciesPage /></ProtectedRoute>
  },
  {
    path: '/banks-module/exchange-rates',
    element: <ProtectedRoute><BankExchangeRatesPage /></ProtectedRoute>
  },
  {
    path: '/banks-module/reports',
    element: <ProtectedRoute><BankReportsPage /></ProtectedRoute>
  },
  {
    path: '/banks-module/reconciliation',
    element: <ProtectedRoute><BankReconciliationModulePage /></ProtectedRoute>
  },
  {
    path: '/banks-module/reconciliations-history',
    element: <ProtectedRoute><BankReconciliationsHistoryPage /></ProtectedRoute>
  },
  {
    path: '/payroll',
    element: <ProtectedRoute><PayrollPage /></ProtectedRoute>
  },
  {
    path: '/payroll/configuration',
    element: <PayrollConfigurationPage />
  },
  {
    path: '/payroll/employees',
    element: <PayrollEmployeesPage />
  },
  {
    path: '/payroll/employee-types',
    element: <PayrollEmployeeTypesPage />
  },
  {
    path: '/payroll/departments',
    element: <PayrollDepartmentsPage />
  },
  {
    path: '/payroll/positions',
    element: <PayrollPositionsPage />
  },
  {
    path: '/payroll/salary-types',
    element: <PayrollSalaryTypesPage />
  },
  {
    path: '/payroll/concepts',
    element: <PayrollConceptsPage />
  },
  {
    path: '/payroll/periods',
    element: <PayrollPeriodsPage />
  },
  {
    path: '/payroll/commission-types',
    element: <PayrollCommissionTypesPage />
  },
  {
    path: '/payroll/vacations',
    element: <PayrollVacationsPage />
  },
  {
    path: '/payroll/overtime',
    element: <PayrollOvertimePage />
  },
  {
    path: '/payroll/holidays',
    element: <PayrollHolidaysPage />
  },
  {
    path: '/payroll/bonuses',
    element: <PayrollBonusesPage />
  },
  {
    path: '/payroll/royalties',
    element: <PayrollRoyaltiesPage />
  },
  {
    path: '/payroll/deductions',
    element: <PayrollDeductionsPage />
  },
  {
    path: '/payroll/other-deductions',
    element: <PayrollOtherDeductionsPage />
  },
  {
    path: '/payroll/absences',
    element: <PayrollAbsencesPage />
  },
  {
    path: '/payroll/payroll-process',
    element: <PayrollProcessPage />
  },
  {
    path: '/payroll/journal-entry',
    element: <PayrollJournalEntryPage />
  },
  {
    path: '/payroll/salary-changes',
    element: <PayrollSalaryChangesPage />
  },
  {
    path: '/payroll/employee-exits',
    element: <PayrollEmployeeExitsPage />
  },
  {
    path: '/pos',
    element: <ProtectedRoute><POSPage /></ProtectedRoute>
  },
  {
    path: '/pos/customer-display',
    element: <CustomerDisplayPage />
  },
  {
    path: '/products',
    element: <ProtectedRoute><ProductsPage /></ProtectedRoute>
  },
  {
    path: '/customers',
    element: <ProtectedRoute><CustomersPage /></ProtectedRoute>
  },
  {
    path: '/users',
    element: <ProtectedRoute><UsersPage /></ProtectedRoute>
  },
  {
    path: '/inventory',
    element: <ProtectedRoute><InventoryPage /></ProtectedRoute>
  },
  {
    path: '/inventory/reports',
    element: <ProtectedRoute><InventoryReportsPage /></ProtectedRoute>
  },
  {
    path: '/inventory/physical-count',
    element: <ProtectedRoute><InventoryPhysicalCountPage /></ProtectedRoute>
  },
  {
    path: '/inventory/physical-result',
    element: <ProtectedRoute><InventoryPhysicalResultPage /></ProtectedRoute>
  },
  {
    path: '/inventory/cost-revaluation',
    element: <ProtectedRoute><InventoryCostRevaluationPage /></ProtectedRoute>
  },
  // Cash & Finance Routes
  {
    path: '/cash-finance',
    element: <ProtectedRoute><CashFinancePage /></ProtectedRoute>
  },
  {
    path: '/cash-finance/petty-cash',
    element: <ProtectedRoute><CashFinancePage /></ProtectedRoute>
  },
  {
    path: '/cash-finance/expenses',
    element: <ProtectedRoute><CashFinancePage /></ProtectedRoute>
  },
  {
    path: '/cash-finance/income',
    element: <ProtectedRoute><CashFinancePage /></ProtectedRoute>
  },
  {
    path: '/cash-finance/reports',
    element: <ProtectedRoute><CashFinancePage /></ProtectedRoute>
  },
  {
    path: '/fixed-assets',
    element: <ProtectedRoute><FixedAssetsPage /></ProtectedRoute>
  },
  // Fixed Assets Sub-routes
  {
    path: '/fixed-assets/register',
    element: <ProtectedRoute><AssetRegisterPage /></ProtectedRoute>
  },
  {
    path: '/fixed-assets/types',
    element: <ProtectedRoute><AssetTypesPage /></ProtectedRoute>
  },
  {
    path: '/fixed-assets/depreciation',
    element: <ProtectedRoute><DepreciationPage /></ProtectedRoute>
  },
  {
    path: '/fixed-assets/depreciation-types',
    element: <ProtectedRoute><DepreciationTypesPage /></ProtectedRoute>
  },
  {
    path: '/fixed-assets/report',
    element: <ProtectedRoute><FixedAssetsReportPage /></ProtectedRoute>
  },
  {
    path: '/fixed-assets/revaluation',
    element: <ProtectedRoute><RevaluationPage /></ProtectedRoute>
  },
  {
    path: '/fixed-assets/disposal',
    element: <ProtectedRoute><AssetDisposalPage /></ProtectedRoute>
  },
  {
    path: '/accounts-receivable',
    element: <ProtectedRoute><AccountsReceivablePage /></ProtectedRoute>
  },
  // Accounts Receivable Sub-routes
  {
    path: '/accounts-receivable/invoices',
    element: <ProtectedRoute><ARInvoicesPage /></ProtectedRoute>
  },
  {
    path: '/accounts-receivable/customers',
    element: <ProtectedRoute><ARCustomersPage /></ProtectedRoute>
  },
  {
    path: '/accounts-receivable/payments',
    element: <ProtectedRoute><ARPaymentsPage /></ProtectedRoute>
  },
  {
    path: '/accounts-receivable/reports',
    element: <ProtectedRoute><ARReportsPage /></ProtectedRoute>
  },
  {
    path: '/accounts-receivable/receipts',
    element: <ProtectedRoute><ARReceiptsPage /></ProtectedRoute>
  },
  {
    path: '/accounts-receivable/advances',
    element: <ProtectedRoute><ARAdvancesPage /></ProtectedRoute>
  },
  {
    path: '/accounts-receivable/delivery-notes',
    element: <ProtectedRoute><ARDeliveryNotesPage /></ProtectedRoute>
  },
  {
    path: '/accounts-receivable/discounts',
    element: <ProtectedRoute><ARDiscountsPage /></ProtectedRoute>
  },
  {
    path: '/accounts-receivable/credit-notes',
    element: <ProtectedRoute><ARCreditNotesPage /></ProtectedRoute>
  },
  {
    path: '/accounts-receivable/debit-notes',
    element: <ProtectedRoute><ARDebitNotesPage /></ProtectedRoute>
  },
  {
    path: '/accounts-receivable/customer-types',
    element: <ProtectedRoute><ARCustomerTypesPage /></ProtectedRoute>
  },
  {
    path: '/accounts-receivable/payment-terms',
    element: <ProtectedRoute><PaymentTermsPage /></ProtectedRoute>
  },
  {
    path: '/accounts-payable',
    element: <ProtectedRoute><AccountsPayablePage /></ProtectedRoute>
  },
  // Accounts Payable Sub-routes
  {
    path: '/accounts-payable/reports',
    element: <ProtectedRoute><APReportsPage /></ProtectedRoute>
  },
  {
    path: '/accounts-payable/suppliers',
    element: <ProtectedRoute><SuppliersPage /></ProtectedRoute>
  },
  {
    path: '/accounts-payable/payments',
    element: <ProtectedRoute><PaymentsPage /></ProtectedRoute>
  },
  {
    path: '/accounts-payable/purchase-orders',
    element: <ProtectedRoute><PurchaseOrdersPage /></ProtectedRoute>
  },
  {
    path: '/accounts-payable/quotes',
    element: <ProtectedRoute><APQuotesPage /></ProtectedRoute>
  },
  {
    path: '/accounts-payable/advances',
    element: <ProtectedRoute><AdvancesPage /></ProtectedRoute>
  },
  {
    path: '/accounts-payable/supplier-types',
    element: <ProtectedRoute><SupplierTypesPage /></ProtectedRoute>
  },
  {
    path: '/accounts-payable/payment-terms',
    element: <ProtectedRoute><PaymentTermsPage /></ProtectedRoute>
  },
  {
    path: '/accounts-payable/invoices',
    element: <ProtectedRoute><APInvoicesPage /></ProtectedRoute>
  },
  {
    path: '/accounts-payable/debit-credit-notes',
    element: <ProtectedRoute><APDebitCreditNotesPage /></ProtectedRoute>
  },
  {
    path: '/billing',
    element: <ProtectedRoute><BillingPage /></ProtectedRoute>
  },
  // Billing Sub-routes
  {
    path: '/billing/sales-reports',
    element: <SalesReportsPage />
  },
  {
    path: '/billing/commission-report',
    element: <ProtectedRoute><CommissionReportPage /></ProtectedRoute>
  },
  {
    path: '/billing/sales-reps',
    element: <ProtectedRoute><SalesRepsPage /></ProtectedRoute>
  },
  {
    path: '/billing/sales-rep-types',
    element: <ProtectedRoute><SalesRepTypesPage /></ProtectedRoute>
  },
  {
    path: '/billing/stores',
    element: <ProtectedRoute><StoresPage /></ProtectedRoute>
  },
  {
    path: '/billing/invoicing',
    element: <InvoicingPage />
  },
  {
    path: '/billing/pre-invoicing',
    element: <PreInvoicingPage />
  },
  {
    path: '/billing/recurring',
    element: <RecurringBillingPage />
  },
  {
    path: '/billing/cash-closing',
    element: <CashClosingPage />
  },
  {
    path: '/billing/quotes',
    element: <QuotesPage />
  },
  {
    path: '/billing/jobs',
    element: <ProtectedRoute><BillingJobsPage /></ProtectedRoute>
  },
  {
    path: '/billing/authorizations',
    element: <ProtectedRoute><AuthorizationsPage /></ProtectedRoute>
  },
  {
    path: '/taxes',
    element: <ProtectedRoute><TaxesPage /></ProtectedRoute>
  },
  {
    path: '/taxes/configuration',
    element: <ProtectedRoute><TaxConfigurationPage /></ProtectedRoute>
  },
  {
    path: '/taxes/ncf',
    element: <ProtectedRoute><NcfManagementPage /></ProtectedRoute>
  },
  {
    path: '/taxes/fiscal-series',
    element: <ProtectedRoute><FiscalSeriesPage /></ProtectedRoute>
  },
  {
    path: '/taxes/report-606',
    element: <ProtectedRoute><Report606Page /></ProtectedRoute>
  },
  {
    path: '/taxes/report-607',
    element: <ProtectedRoute><Report607Page /></ProtectedRoute>
  },
  {
    path: '/taxes/report-608',
    element: <ProtectedRoute><Report608Page /></ProtectedRoute>
  },
  {
    path: '/taxes/report-623',
    element: <ProtectedRoute><Report623Page /></ProtectedRoute>
  },
  {
    path: '/taxes/report-it1',
    element: <ProtectedRoute><ReportIT1Page /></ProtectedRoute>
  },
  {
    path: '/taxes/report-ir17',
    element: <ProtectedRoute><ReportIR17Page /></ProtectedRoute>
  },
  {
    path: '/taxes/formulario-607',
    element: <ProtectedRoute><DashboardLayout><Formulario607Page /></DashboardLayout></ProtectedRoute>
  },
  {
    path: '/taxes/itbis-proportionality',
    element: <ProtectedRoute><ItbisProportionalityPage /></ProtectedRoute>
  },
  {
    path: '/plans',
    element: <ProtectedRoute><PlansPage /></ProtectedRoute>
  },
  {
    path: '/plans/student-verify',
    element: <StudentVerifyPage />
  },
  // Settings Routes
  {
    path: '/settings',
    element: <ProtectedRoute><SettingsPage /></ProtectedRoute>
  },
  {
    path: '/settings/company',
    element: <ProtectedRoute><CompanySettingsPage /></ProtectedRoute>
  },
  {
    path: '/settings/opening-balances',
    element: <Navigate to="/settings" replace />
  },
  {
    path: '/settings/users',
    element: <ProtectedRoute><UsersSettingsPage /></ProtectedRoute>
  },
  {
    path: '/settings/accounting',
    element: <ProtectedRoute><AccountingSettingsPage /></ProtectedRoute>
  },
  {
    path: '/settings/taxes',
    element: <ProtectedRoute><TaxSettingsPage /></ProtectedRoute>
  },
  {
    path: '/settings/inventory',
    element: <ProtectedRoute><InventorySettingsPage /></ProtectedRoute>
  },
  {
    path: '/settings/payroll',
    element: <ProtectedRoute><PayrollSettingsPage /></ProtectedRoute>
  },
  {
    path: '/settings/backup',
    element: <ProtectedRoute><BackupSettingsPage /></ProtectedRoute>
  },
  {
    path: '/settings/integrations',
    element: <ProtectedRoute><IntegrationsSettingsPage /></ProtectedRoute>
  },
  {
    path: '/settings/stores',
    element: <ProtectedRoute><StoresPage /></ProtectedRoute>
  },
  // Admin Routes (Super Admin only)
  {
    path: '/admin/demo-requests',
    element: <ProtectedRoute><AdminDemoRequestsPage /></ProtectedRoute>
  },
  {
    path: '/admin/dashboard',
    element: <ProtectedRoute><AdminDashboardPage /></ProtectedRoute>
  },
  // Auth Routes
  {
    path: '/auth/login',
    element: <LoginPage />
  },
  {
    path: '/auth/register',
    element: <RegisterPage />
  },
  {
    path: '/auth/reset-password',
    element: <ResetPasswordPage />
  },
  {
    path: '*',
    element: <NotFoundPage />
  }
];

export default routes;
