import { supabase } from '../../lib/supabase';
import { chartAccountsService } from '../database';

// =============================================================================
// TYPES
// =============================================================================

export interface AccountingPeriod {
  id: string;
  user_id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: 'open' | 'closed';
  closed_at: string | null;
  closed_by: string | null;
  created_at: string;
}

export interface FinancialReportSnapshot {
  id: string;
  user_id: string;
  period_id: string;
  report_type: 'pnl' | 'balance_sheet' | 'cash_flow' | 'sales_tax';
  generated_at: string;
  generated_by: string | null;
  filters_json: Record<string, any> | null;
  data_json: Record<string, any>;
}

export interface TaxJurisdiction {
  id: string;
  user_id: string;
  state: string;
  county: string | null;
  city: string | null;
  zip: string | null;
  name: string;
  created_at: string;
}

export interface TaxRate {
  id: string;
  user_id: string;
  jurisdiction_id: string;
  rate: number;
  effective_from: string;
  effective_to: string | null;
  created_at: string;
  jurisdiction?: TaxJurisdiction;
}

export interface ProfitAndLossReport {
  period: { start: string; end: string };
  revenue: { category: string; amount: number }[];
  totalRevenue: number;
  expenses: { category: string; amount: number }[];
  totalExpenses: number;
  netIncome: number;
}

export interface BalanceSheetReport {
  asOfDate: string;
  assets: { name: string; amount: number }[];
  totalAssets: number;
  liabilities: { name: string; amount: number }[];
  totalLiabilities: number;
  equity: { name: string; amount: number }[];
  totalEquity: number;
}

export interface CashFlowReport {
  period: { start: string; end: string };
  operating: { description: string; amount: number }[];
  totalOperating: number;
  investing: { description: string; amount: number }[];
  totalInvesting: number;
  financing: { description: string; amount: number }[];
  totalFinancing: number;
  netChange: number;
}

export interface SalesTaxReport {
  period: { start: string; end: string };
  byJurisdiction: {
    jurisdiction: string;
    state: string;
    taxableSales: number;
    taxRate: number;
    taxCollected: number;
  }[];
  totalTaxableSales: number;
  totalTaxCollected: number;
}

// =============================================================================
// ACCOUNTING PERIODS SERVICE
// =============================================================================

export const accountingPeriodsService = {
  async list(companyId: string, filters?: { status?: string; year?: number }): Promise<AccountingPeriod[]> {
    let query = supabase
      .from('contador_accounting_periods')
      .select('*')
      .eq('user_id', companyId)
      .order('start_date', { ascending: false });

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }
    if (filters?.year) {
      query = query
        .gte('start_date', `${filters.year}-01-01`)
        .lte('end_date', `${filters.year}-12-31`);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  },

  async getById(id: string): Promise<AccountingPeriod | null> {
    const { data, error } = await supabase
      .from('contador_accounting_periods')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  },

  async getCurrent(companyId: string): Promise<AccountingPeriod | null> {
    const today = new Date().toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('contador_accounting_periods')
      .select('*')
      .eq('user_id', companyId)
      .eq('status', 'open')
      .lte('start_date', today)
      .gte('end_date', today)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  async create(payload: {
    user_id: string;
    name: string;
    start_date: string;
    end_date: string;
  }): Promise<AccountingPeriod> {
    const { data, error } = await supabase
      .from('contador_accounting_periods')
      .insert({ ...payload, status: 'open' })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async close(id: string, closedBy: string): Promise<AccountingPeriod> {
    const { data, error } = await supabase
      .from('contador_accounting_periods')
      .update({
        status: 'closed',
        closed_at: new Date().toISOString(),
        closed_by: closedBy,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async reopen(id: string): Promise<AccountingPeriod> {
    const { data, error } = await supabase
      .from('contador_accounting_periods')
      .update({
        status: 'open',
        closed_at: null,
        closed_by: null,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('contador_accounting_periods')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  async generateMonthlyPeriods(companyId: string, year: number): Promise<AccountingPeriod[]> {
    const periods: AccountingPeriod[] = [];
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];

    for (let month = 0; month < 12; month++) {
      const startDate = new Date(year, month, 1);
      const endDate = new Date(year, month + 1, 0);

      const period = await this.create({
        user_id: companyId,
        name: `${months[month]} ${year}`,
        start_date: startDate.toISOString().split('T')[0],
        end_date: endDate.toISOString().split('T')[0],
      });

      periods.push(period);
    }

    return periods;
  },
};

// =============================================================================
// FINANCIAL REPORT SNAPSHOTS SERVICE
// =============================================================================

export const reportSnapshotsService = {
  async list(
    companyId: string,
    filters?: { periodId?: string; reportType?: string }
  ): Promise<FinancialReportSnapshot[]> {
    let query = supabase
      .from('contador_financial_report_snapshots')
      .select('*')
      .eq('user_id', companyId)
      .order('generated_at', { ascending: false });

    if (filters?.periodId) {
      query = query.eq('period_id', filters.periodId);
    }
    if (filters?.reportType) {
      query = query.eq('report_type', filters.reportType);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  },

  async getById(id: string): Promise<FinancialReportSnapshot | null> {
    const { data, error } = await supabase
      .from('contador_financial_report_snapshots')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  },

  async create(payload: {
    user_id: string;
    period_id: string;
    report_type: 'pnl' | 'balance_sheet' | 'cash_flow' | 'sales_tax';
    generated_by?: string | null;
    filters_json?: Record<string, any> | null;
    data_json: Record<string, any>;
  }): Promise<FinancialReportSnapshot> {
    const { data, error } = await supabase
      .from('contador_financial_report_snapshots')
      .insert({
        ...payload,
        generated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('contador_financial_report_snapshots')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },
};

// =============================================================================
// TAX JURISDICTIONS SERVICE
// =============================================================================

export const taxJurisdictionsService = {
  async list(companyId: string, filters?: { state?: string }): Promise<TaxJurisdiction[]> {
    let query = supabase
      .from('contador_tax_jurisdictions')
      .select('*')
      .eq('user_id', companyId)
      .order('state')
      .order('name');

    if (filters?.state) {
      query = query.eq('state', filters.state);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  },

  async getById(id: string): Promise<TaxJurisdiction | null> {
    const { data, error } = await supabase
      .from('contador_tax_jurisdictions')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  },

  async create(payload: {
    user_id: string;
    state: string;
    county?: string | null;
    city?: string | null;
    zip?: string | null;
    name: string;
  }): Promise<TaxJurisdiction> {
    const { data, error } = await supabase
      .from('contador_tax_jurisdictions')
      .insert(payload)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async update(id: string, payload: Partial<Omit<TaxJurisdiction, 'id' | 'user_id' | 'created_at'>>): Promise<TaxJurisdiction> {
    const { data, error } = await supabase
      .from('contador_tax_jurisdictions')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('contador_tax_jurisdictions')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },
};

// =============================================================================
// TAX RATES SERVICE
// =============================================================================

export const taxRatesService = {
  async list(companyId: string, filters?: { jurisdictionId?: string; effectiveDate?: string }): Promise<TaxRate[]> {
    let query = supabase
      .from('contador_tax_rates')
      .select(`
        *,
        jurisdiction:tax_jurisdictions(*)
      `)
      .eq('user_id', companyId)
      .order('effective_from', { ascending: false });

    if (filters?.jurisdictionId) {
      query = query.eq('jurisdiction_id', filters.jurisdictionId);
    }
    if (filters?.effectiveDate) {
      query = query
        .lte('effective_from', filters.effectiveDate)
        .or(`effective_to.is.null,effective_to.gte.${filters.effectiveDate}`);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  },

  async getCurrentRate(jurisdictionId: string): Promise<number> {
    const today = new Date().toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('contador_tax_rates')
      .select('rate')
      .eq('jurisdiction_id', jurisdictionId)
      .lte('effective_from', today)
      .or(`effective_to.is.null,effective_to.gte.${today}`)
      .order('effective_from', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data?.rate || 0;
  },

  async create(payload: {
    user_id: string;
    jurisdiction_id: string;
    rate: number;
    effective_from: string;
    effective_to?: string | null;
  }): Promise<TaxRate> {
    const { data, error } = await supabase
      .from('contador_tax_rates')
      .insert(payload)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async update(id: string, payload: { rate?: number; effective_from?: string; effective_to?: string | null }): Promise<TaxRate> {
    const { data, error } = await supabase
      .from('contador_tax_rates')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('contador_tax_rates')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },
};

// =============================================================================
// REPORT GENERATION SERVICE - Uses real transaction data per US GAAP
// =============================================================================

export const reportGeneratorService = {
  async generateProfitAndLoss(
    companyId: string,
    startDate: string,
    endDate: string
  ): Promise<ProfitAndLossReport> {
    try {
      // =====================================================================
      // REVENUE = Sales (subtotal, without tax) - Returns
      // Source: invoices, credit_debit_notes (returns)
      // =====================================================================
      const { data: invoices } = await supabase
        .from('invoices')
        .select('subtotal, tax_amount, total_amount, paid_amount, status')
        .eq('user_id', companyId)
        .gte('invoice_date', startDate)
        .lte('invoice_date', endDate)
        .not('status', 'in', '("cancelled","voided","draft")');

      const grossSales = (invoices || []).reduce((sum, inv: any) => 
        sum + (Number(inv.subtotal) || 0), 0);

      // Get sales returns/credits
      const { data: creditNotes } = await supabase
        .from('credit_debit_notes')
        .select('total_amount, note_type, status')
        .eq('user_id', companyId)
        .eq('note_type', 'credit')
        .gte('note_date', startDate)
        .lte('note_date', endDate)
        .not('status', 'in', '("cancelled","cancelada")');

      const salesReturns = (creditNotes || []).reduce((sum, cn: any) =>
        sum + (Number((cn as any).total_amount) || 0), 0);

      const netSalesRevenue = grossSales - salesReturns;

      // =====================================================================
      // COGS = Cost of Goods Sold from inventory movements (sale_issue)
      // Source: inventory_movements
      // =====================================================================
      const { data: inventoryMovements } = await supabase
        .from('inventory_movements')
        .select('quantity, unit_cost, movement_type, created_at')
        .eq('user_id', companyId)
        .eq('movement_type', 'exit')
        .gte('created_at', startDate)
        .lte('created_at', `${endDate}T23:59:59.999Z`);

      const cogs = (inventoryMovements || []).reduce((sum, mov: any) => {
        const qty = Math.abs(Number((mov as any).quantity) || 0);
        const cost = Number((mov as any).unit_cost) || 0;
        return sum + qty * cost;
      }, 0);

      // =====================================================================
      // EXPENSES = AP Invoices + Petty Cash + Payroll
      // Source: ap_invoices, petty_cash_expenses, payroll_entries
      // =====================================================================
      const { data: apInvoices } = await supabase
        .from('ap_invoices')
        .select('total_gross, total_itbis, total_to_pay, paid_amount, status')
        .eq('user_id', companyId)
        .gte('invoice_date', startDate)
        .lte('invoice_date', endDate)
        .not('status', 'in', '("cancelled","voided","draft")');

      const apExpenses = (apInvoices || []).reduce((sum, inv: any) =>
        sum + (Number((inv as any).total_gross) || 0), 0);

      // Petty cash expenses
      const { data: pettyCashExpenses } = await supabase
        .from('petty_cash_expenses')
        .select('amount')
        .eq('user_id', companyId)
        .gte('expense_date', startDate)
        .lte('expense_date', endDate);

      const pettyCash = (pettyCashExpenses || []).reduce((sum, exp: any) => 
        sum + (Number(exp.amount) || 0), 0);

      // Payroll expenses
      const { data: payrollItems } = await supabase
        .from('payroll_items')
        .select('gross_pay, created_at')
        .eq('user_id', companyId)
        .gte('created_at', startDate)
        .lte('created_at', `${endDate}T23:59:59.999Z`);

      const payrollExpense = (payrollItems || []).reduce((sum, pi: any) =>
        sum + (Number((pi as any).gross_pay) || 0), 0);

      // Build revenue breakdown
      const revenue: { category: string; amount: number }[] = [];
      if (grossSales > 0) revenue.push({ category: 'Gross Sales', amount: grossSales });
      if (salesReturns > 0) revenue.push({ category: 'Sales Returns & Allowances', amount: -salesReturns });

      // Build expense breakdown (COGS separate from operating expenses)
      const expenses: { category: string; amount: number }[] = [];
      if (cogs > 0) expenses.push({ category: 'Cost of Goods Sold', amount: cogs });
      if (apExpenses > 0) expenses.push({ category: 'Purchases & Vendor Bills', amount: apExpenses });
      if (pettyCash > 0) expenses.push({ category: 'Petty Cash Expenses', amount: pettyCash });
      if (payrollExpense > 0) expenses.push({ category: 'Payroll Expenses', amount: payrollExpense });

      const totalRevenue = netSalesRevenue;
      const totalExpenses = cogs + apExpenses + pettyCash + payrollExpense;
      const netIncome = totalRevenue - totalExpenses;

      return {
        period: { start: startDate, end: endDate },
        revenue,
        totalRevenue,
        expenses,
        totalExpenses,
        netIncome,
      };
    } catch (error) {
      console.error('generateProfitAndLoss error:', error);
      return {
        period: { start: startDate, end: endDate },
        revenue: [],
        totalRevenue: 0,
        expenses: [],
        totalExpenses: 0,
        netIncome: 0,
      };
    }
  },

  async generateBalanceSheet(
    companyId: string,
    asOfDate: string
  ): Promise<BalanceSheetReport> {
    try {
      // =====================================================================
      // ASSETS
      // =====================================================================
      
      // 1. Cash = Bank Accounts + Cash Drawers + Petty Cash
      const { data: bankAccounts } = await supabase
        .from('bank_accounts')
        .select('name, current_balance')
        .eq('user_id', companyId);

      const bankCash = (bankAccounts || []).reduce((sum, acc: any) => 
        sum + (Number(acc.current_balance) || 0), 0);

      const { data: cashDrawers } = await supabase
        .from('contador_cash_drawers')
        .select('current_balance')
        .eq('user_id', companyId);

      const drawerCash = (cashDrawers || []).reduce((sum, d: any) => 
        sum + (Number(d.current_balance) || 0), 0);

      const { data: pettyCashFunds } = await supabase
        .from('petty_cash_funds')
        .select('current_balance')
        .eq('user_id', companyId);

      const pettyCash = (pettyCashFunds || []).reduce((sum, f: any) => 
        sum + (Number(f.current_balance) || 0), 0);

      const totalCash = bankCash + drawerCash + pettyCash;

      // 2. Accounts Receivable = Unpaid invoices
      const { data: arInvoices } = await supabase
        .from('invoices')
        .select('total, amount_paid')
        .eq('user_id', companyId)
        .lte('invoice_date', asOfDate)
        .in('status', ['sent', 'partial', 'overdue']);

      const accountsReceivable = (arInvoices || []).reduce((sum, inv: any) => {
        const total = Number(inv.total) || 0;
        const paid = Number(inv.amount_paid) || 0;
        return sum + (total - paid);
      }, 0);

      // 3. Inventory = Current inventory value
      const { data: inventoryItems } = await supabase
        .from('inventory_items')
        .select('quantity, unit_cost')
        .eq('user_id', companyId)
        .gt('quantity', 0);

      const inventoryValue = (inventoryItems || []).reduce((sum, item: any) => {
        const qty = Number(item.quantity) || 0;
        const cost = Number(item.unit_cost) || 0;
        return sum + (qty * cost);
      }, 0);

      // 4. Customer Advances (prepaid by customers - it's a liability, not asset)
      // But customer advances received are actually liabilities

      // =====================================================================
      // LIABILITIES
      // =====================================================================

      // 1. Accounts Payable = Unpaid vendor bills
      const { data: apInvoices } = await supabase
        .from('ap_invoices')
        .select('total, amount_paid')
        .eq('user_id', companyId)
        .lte('invoice_date', asOfDate)
        .in('status', ['pending', 'approved', 'partial']);

      const accountsPayable = (apInvoices || []).reduce((sum, inv: any) => {
        const total = Number(inv.total) || 0;
        const paid = Number(inv.amount_paid) || 0;
        return sum + (total - paid);
      }, 0);

      // 2. Sales Tax Payable = Tax collected but not remitted
      const { data: taxInvoices } = await supabase
        .from('invoices')
        .select('tax_amount')
        .eq('user_id', companyId)
        .lte('invoice_date', asOfDate)
        .in('status', ['paid', 'partial', 'sent', 'overdue']);

      const salesTaxPayable = (taxInvoices || []).reduce((sum, inv: any) => 
        sum + (Number(inv.tax_amount) || 0), 0);

      // 3. Customer Advances = Prepayments from customers (liability)
      const { data: customerAdvances } = await supabase
        .from('customer_advances')
        .select('amount, applied_amount')
        .eq('user_id', companyId);

      const unappliedAdvances = (customerAdvances || []).reduce((sum, adv: any) => {
        const amount = Number(adv.amount) || 0;
        const applied = Number(adv.applied_amount) || 0;
        return sum + (amount - applied);
      }, 0);

      // =====================================================================
      // BUILD ARRAYS
      // =====================================================================
      const assets: { name: string; amount: number }[] = [];
      if (totalCash > 0) assets.push({ name: 'Cash & Bank Accounts', amount: totalCash });
      if (accountsReceivable > 0) assets.push({ name: 'Accounts Receivable', amount: accountsReceivable });
      if (inventoryValue > 0) assets.push({ name: 'Inventory', amount: inventoryValue });

      const liabilities: { name: string; amount: number }[] = [];
      if (accountsPayable > 0) liabilities.push({ name: 'Accounts Payable', amount: accountsPayable });
      if (salesTaxPayable > 0) liabilities.push({ name: 'Sales Tax Payable', amount: salesTaxPayable });
      if (unappliedAdvances > 0) liabilities.push({ name: 'Customer Advances', amount: unappliedAdvances });

      const totalAssets = assets.reduce((sum, a) => sum + a.amount, 0);
      const totalLiabilities = liabilities.reduce((sum, l) => sum + l.amount, 0);
      
      // Equity = Assets - Liabilities (accounting equation)
      const totalEquity = totalAssets - totalLiabilities;
      const equity: { name: string; amount: number }[] = [];
      if (totalEquity !== 0) {
        equity.push({ name: 'Retained Earnings', amount: totalEquity });
      }

      return {
        asOfDate,
        assets,
        totalAssets,
        liabilities,
        totalLiabilities,
        equity,
        totalEquity,
      };
    } catch (error) {
      console.error('generateBalanceSheet error:', error);
      return {
        asOfDate,
        assets: [],
        totalAssets: 0,
        liabilities: [],
        totalLiabilities: 0,
        equity: [],
        totalEquity: 0,
      };
    }
  },

  async generateCashFlow(
    companyId: string,
    startDate: string,
    endDate: string
  ): Promise<CashFlowReport> {
    try {
      // Get customer payments received (operating inflow)
      const { data: customerPayments } = await supabase
        .from('customer_payments')
        .select('amount')
        .eq('user_id', companyId)
        .gte('payment_date', startDate)
        .lte('payment_date', endDate);

      const cashFromCustomers = (customerPayments || []).reduce((sum, p: any) => 
        sum + (Number(p.amount) || 0), 0);

      // Get supplier payments made (operating outflow)
      const { data: supplierPayments } = await supabase
        .from('supplier_payments')
        .select('amount')
        .eq('user_id', companyId)
        .gte('payment_date', startDate)
        .lte('payment_date', endDate);

      const cashToSuppliers = (supplierPayments || []).reduce((sum, p: any) => 
        sum + (Number(p.amount) || 0), 0);

      // Try to get detailed breakdown from chart accounts
      let operatingTotal = 0;
      let investingTotal = 0;
      let financingTotal = 0;

      try {
        const result = await chartAccountsService.generateCashFlowStatement(companyId, startDate, endDate);
        if (result.operatingCashFlow !== 0 || result.investingCashFlow !== 0 || result.financingCashFlow !== 0) {
          operatingTotal = result.operatingCashFlow || 0;
          investingTotal = result.investingCashFlow || 0;
          financingTotal = result.financingCashFlow || 0;
        }
      } catch {
        // Ignore - will use transaction data
      }

      // Use transaction data if no journal entries
      if (operatingTotal === 0 && (cashFromCustomers > 0 || cashToSuppliers > 0)) {
        operatingTotal = cashFromCustomers - cashToSuppliers;
      }

      const operating: { description: string; amount: number }[] = [];
      if (cashFromCustomers > 0) operating.push({ description: 'Collections from Customers', amount: cashFromCustomers });
      if (cashToSuppliers > 0) operating.push({ description: 'Payments to Suppliers', amount: -cashToSuppliers });

      const investing: { description: string; amount: number }[] = [];
      if (investingTotal !== 0) investing.push({ description: 'Investing Activities', amount: investingTotal });

      const financing: { description: string; amount: number }[] = [];
      if (financingTotal !== 0) financing.push({ description: 'Financing Activities', amount: financingTotal });

      return {
        period: { start: startDate, end: endDate },
        operating,
        totalOperating: operatingTotal,
        investing,
        totalInvesting: investingTotal,
        financing,
        totalFinancing: financingTotal,
        netChange: operatingTotal + investingTotal + financingTotal,
      };
    } catch (error) {
      console.error('generateCashFlow error:', error);
      return {
        period: { start: startDate, end: endDate },
        operating: [],
        totalOperating: 0,
        investing: [],
        totalInvesting: 0,
        financing: [],
        totalFinancing: 0,
        netChange: 0,
      };
    }
  },

  async generateSalesTaxReport(
    companyId: string,
    startDate: string,
    endDate: string
  ): Promise<SalesTaxReport> {
    try {
      // Get invoices with tax data from the period
      const { data: invoices, error } = await supabase
        .from('invoices')
        .select('subtotal, tax_amount, status')
        .eq('user_id', companyId)
        .gte('invoice_date', startDate)
        .lte('invoice_date', endDate)
        .in('status', ['paid', 'partial', 'sent']);

      if (error) throw error;

      const totalTaxableSales = (invoices || []).reduce((sum, inv: any) => 
        sum + (Number(inv.subtotal) || 0), 0);
      const totalTaxCollected = (invoices || []).reduce((sum, inv: any) => 
        sum + (Number(inv.tax_amount) || 0), 0);

      // Calculate average tax rate
      const avgTaxRate = totalTaxableSales > 0 
        ? (totalTaxCollected / totalTaxableSales) * 100 
        : 0;

      // Get jurisdictions if configured
      const jurisdictions = await taxJurisdictionsService.list(companyId);
      const byJurisdiction: SalesTaxReport['byJurisdiction'] = [];

      if (jurisdictions.length > 0) {
        for (const jurisdiction of jurisdictions) {
          const rate = await taxRatesService.getCurrentRate(jurisdiction.id);
          byJurisdiction.push({
            jurisdiction: jurisdiction.name,
            state: jurisdiction.state,
            taxableSales: totalTaxableSales / jurisdictions.length,
            taxRate: rate * 100,
            taxCollected: totalTaxCollected / jurisdictions.length,
          });
        }
      } else {
        // Default single jurisdiction with aggregated data
        byJurisdiction.push({
          jurisdiction: 'Total',
          state: '-',
          taxableSales: totalTaxableSales,
          taxRate: avgTaxRate,
          taxCollected: totalTaxCollected,
        });
      }

      return {
        period: { start: startDate, end: endDate },
        byJurisdiction,
        totalTaxableSales,
        totalTaxCollected,
      };
    } catch (error) {
      console.error('generateSalesTaxReport error:', error);
      return {
        period: { start: startDate, end: endDate },
        byJurisdiction: [{
          jurisdiction: 'Total',
          state: '-',
          taxableSales: 0,
          taxRate: 0,
          taxCollected: 0,
        }],
        totalTaxableSales: 0,
        totalTaxCollected: 0,
      };
    }
  },

  async saveSnapshot(
    companyId: string,
    periodId: string,
    reportType: 'pnl' | 'balance_sheet' | 'cash_flow' | 'sales_tax',
    data: Record<string, any>,
    generatedBy?: string
  ): Promise<FinancialReportSnapshot> {
    return reportSnapshotsService.create({
      user_id: companyId,
      period_id: periodId,
      report_type: reportType,
      generated_by: generatedBy || null,
      data_json: data,
    });
  },
};

// =============================================================================
// EXPORT ALL
// =============================================================================

export const reportsService = {
  periods: accountingPeriodsService,
  snapshots: reportSnapshotsService,
  jurisdictions: taxJurisdictionsService,
  taxRates: taxRatesService,
  generator: reportGeneratorService,
};

export default reportsService;
