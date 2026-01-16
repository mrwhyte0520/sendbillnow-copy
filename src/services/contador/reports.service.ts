import { supabase } from '../../lib/supabase';

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
// REPORT GENERATION SERVICE
// =============================================================================

export const reportGeneratorService = {
  async generateProfitAndLoss(
    companyId: string,
    startDate: string,
    endDate: string
  ): Promise<ProfitAndLossReport> {
    const { data: transactions } = await supabase
      .from('contador_cash_transactions')
      .select('type, amount')
      .eq('user_id', companyId)
      .gte('created_at', startDate)
      .lte('created_at', endDate);

    let salesRevenue = 0;
    let expensesCashOut = 0;
    let refundsCashOut = 0;

    for (const tx of transactions || []) {
      switch (tx.type) {
        case 'sale_cash_in':
          salesRevenue += tx.amount;
          break;
        case 'paid_out_expense':
          expensesCashOut += tx.amount;
          break;
        case 'refund_cash_out':
          refundsCashOut += tx.amount;
          break;
      }
    }

    const expenses = [
      { category: 'Expenses', amount: expensesCashOut },
      { category: 'Refunds', amount: refundsCashOut },
    ].filter((e) => e.amount !== 0);

    const totalRevenue = salesRevenue;
    const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);

    return {
      period: { start: startDate, end: endDate },
      revenue: [{ category: 'Sales', amount: salesRevenue }],
      totalRevenue,
      expenses,
      totalExpenses,
      netIncome: totalRevenue - totalExpenses,
    };
  },

  async generateBalanceSheet(
    companyId: string,
    asOfDate: string
  ): Promise<BalanceSheetReport> {
    // Get cash balance
    const { data: drawers } = await supabase
      .from('contador_cash_drawers')
      .select('closing_cash_counted')
      .eq('user_id', companyId)
      .eq('status', 'closed');

    const cashBalance = (drawers || []).reduce((sum, d) => sum + (d.closing_cash_counted || 0), 0);

    // Get inventory value from core inventory_items
    const { data: inventory } = await supabase
      .from('inventory_items')
      .select('current_stock, cost')
      .eq('user_id', companyId);

    const inventoryValue = (inventory || []).reduce((sum, i: any) => {
      const cost = i.cost || 0;
      const qty = i.current_stock || 0;
      return sum + qty * cost;
    }, 0);

    // Get AP balance from core ap_invoices
    const { data: apData } = await supabase
      .from('ap_invoices')
      .select('balance_amount')
      .eq('user_id', companyId)
      .in('status', ['pending', 'partial']);

    const apBalance = (apData || []).reduce((sum, b: any) => sum + (b.balance_amount || 0), 0);

    const assets = [
      { name: 'Cash', amount: cashBalance },
      { name: 'Inventory', amount: inventoryValue },
    ];

    const liabilities = [
      { name: 'Accounts Payable', amount: apBalance },
    ];

    const totalAssets = assets.reduce((sum, a) => sum + a.amount, 0);
    const totalLiabilities = liabilities.reduce((sum, l) => sum + l.amount, 0);
    const totalEquity = totalAssets - totalLiabilities;

    return {
      asOfDate,
      assets,
      totalAssets,
      liabilities,
      totalLiabilities,
      equity: [{ name: 'Retained Earnings', amount: totalEquity }],
      totalEquity,
    };
  },

  async generateCashFlow(
    companyId: string,
    startDate: string,
    endDate: string
  ): Promise<CashFlowReport> {
    // Get cash transactions
    const { data: transactions } = await supabase
      .from('contador_cash_transactions')
      .select('type, amount')
      .eq('user_id', companyId)
      .gte('created_at', startDate)
      .lte('created_at', endDate);

    let salesCashIn = 0;
    let expensesCashOut = 0;
    let refundsCashOut = 0;

    for (const tx of transactions || []) {
      switch (tx.type) {
        case 'sale_cash_in':
          salesCashIn += tx.amount;
          break;
        case 'paid_out_expense':
          expensesCashOut += tx.amount;
          break;
        case 'refund_cash_out':
          refundsCashOut += tx.amount;
          break;
      }
    }

    // Get vendor payments
    const { data: vendorPayments } = await supabase
      .from('contador_vendor_payments')
      .select('amount')
      .eq('user_id', companyId)
      .gte('payment_date', startDate)
      .lte('payment_date', endDate);

    const vendorPaymentsTotal = (vendorPayments || []).reduce((sum, p) => sum + p.amount, 0);

    const operating = [
      { description: 'Cash from Sales', amount: salesCashIn },
      { description: 'Cash Paid for Expenses', amount: -expensesCashOut },
      { description: 'Cash Refunds', amount: -refundsCashOut },
    ];

    const investing: { description: string; amount: number }[] = [];

    const financing = [
      { description: 'Payments to Vendors', amount: -vendorPaymentsTotal },
    ];

    const totalOperating = operating.reduce((sum, o) => sum + o.amount, 0);
    const totalInvesting = investing.reduce((sum, i) => sum + i.amount, 0);
    const totalFinancing = financing.reduce((sum, f) => sum + f.amount, 0);

    return {
      period: { start: startDate, end: endDate },
      operating,
      totalOperating,
      investing,
      totalInvesting,
      financing,
      totalFinancing,
      netChange: totalOperating + totalInvesting + totalFinancing,
    };
  },

  async generateSalesTaxReport(
    companyId: string,
    startDate: string,
    endDate: string
  ): Promise<SalesTaxReport> {
    // Get jurisdictions with rates
    const jurisdictions = await taxJurisdictionsService.list(companyId);
    const byJurisdiction: SalesTaxReport['byJurisdiction'] = [];

    for (const jurisdiction of jurisdictions) {
      const rate = await taxRatesService.getCurrentRate(jurisdiction.id);

      // In a real implementation, you'd join with sales data by jurisdiction
      // For now, we'll use placeholder data
      const taxableSales = 0;
      const taxCollected = taxableSales * rate;

      byJurisdiction.push({
        jurisdiction: jurisdiction.name,
        state: jurisdiction.state,
        taxableSales,
        taxRate: rate * 100,
        taxCollected,
      });
    }

    return {
      period: { start: startDate, end: endDate },
      byJurisdiction,
      totalTaxableSales: byJurisdiction.reduce((sum, j) => sum + j.taxableSales, 0),
      totalTaxCollected: byJurisdiction.reduce((sum, j) => sum + j.taxCollected, 0),
    };
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
